/**
 * Coverage in 15-minute slots: flight demand (counter phase, then gate + jet bridge phase) against
 * trained agents on duty. Agents helping another airline count there, not for their own team.
 */
import { SHIFTS, flightActiveAt, flightAgentNeedAt, rangeDays, toMinutes, type Airline, type Flight, type Person, type Reassignment, type RosterEntry, type ShiftCode } from "@nfs/db";
import { SLOTS, SLOT_MIN, covers } from "./shifts";
import { eligibleFor } from "./eligibility";

export interface EngineInput {
  airlines: Airline[];
  people: Person[];
  flights: Flight[];
  roster: RosterEntry[];
  reassignments: Reassignment[];
}
/** @deprecated name kept for existing callers */
export type CoverageInput = EngineInput;

export type ShiftIndex = Map<string, ShiftCode>;
export const key = (personId: string, date: string) => `${personId}|${date}`;

export function buildShiftIndex(roster: RosterEntry[]): ShiftIndex {
  const m = new Map<string, ShiftCode>();
  for (const e of roster) m.set(key(e.personId, e.date), e.shift);
  return m;
}

export interface Gap {
  airline: string;
  date: string;
  kind: "agents" | "lead";
  from: string;
  to: string;
  /** Largest shortfall inside the gap */
  short: number;
  /** Shift accountable for the gap's first slot */
  shift: "E" | "L";
}

export interface DayCoverage {
  airline: string;
  date: string;
  need: number[];
  have: number[];
  leadNeed: number[];
  leadHave: number[];
  gaps: Gap[];
  coreOnDuty: string[];
  coversIn: string[];
  pulledOut: string[];
  flightIds: string[];
}

const hhmm = (slot: number) => {
  const m = slot * SLOT_MIN;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Context with pre-built lookups; build once per render/check. */
export class CoverageContext {
  readonly idx: ShiftIndex;
  readonly airlineBy = new Map<string, Airline>();
  readonly flightsBy = new Map<string, Flight[]>();
  readonly coreBy = new Map<string, Person[]>();
  readonly peopleBy = new Map<string, Person>();
  private cache = new Map<string, DayCoverage>();

  /** Terminal supervisors on duty count as the lead (Rampline's lead-role default). */
  supervisorsCountAsLead = true;

  constructor(readonly input: EngineInput, idx?: ShiftIndex, opts?: { supervisorsCountAsLead?: boolean }) {
    if (opts?.supervisorsCountAsLead === false) this.supervisorsCountAsLead = false;
    this.idx = idx ?? buildShiftIndex(input.roster);
    for (const a of input.airlines) this.airlineBy.set(a.code, a);
    for (const f of input.flights) {
      const k = `${f.airline}|${f.date}`;
      const list = this.flightsBy.get(k);
      if (list) list.push(f);
      else this.flightsBy.set(k, [f]);
    }
    for (const p of input.people) {
      this.peopleBy.set(p.id, p);
      if (p.coreAirline && p.active !== false) this.coreBy.set(p.coreAirline, [...(this.coreBy.get(p.coreAirline) ?? []), p]);
    }
  }

  shift(personId: string, date: string): ShiftCode | undefined {
    return this.idx.get(key(personId, date));
  }

  day(airlineCode: string, date: string): DayCoverage {
    const ck = `${airlineCode}|${date}`;
    const hit = this.cache.get(ck);
    if (hit) return hit;
    const a = this.airlineBy.get(airlineCode)!;
    const flights = this.flightsBy.get(ck) ?? [];
    const moves = this.input.reassignments.filter((r) => r.date === date);
    const out = new Set(moves.filter((r) => r.fromAirline === airlineCode).map((r) => r.personId));
    const inn = moves.filter((r) => r.toAirline === airlineCode).map((r) => r.personId);

    const core = (this.coreBy.get(airlineCode) ?? []).filter((p) => !out.has(p.id));
    const agents = core.filter((p) => p.role === "agent" && eligibleFor(p, a, date).ok);
    const leads = core.filter((p) => p.role === "lead");
    const coverAgents = inn.map((id) => this.peopleBy.get(id)!).filter((p) => p && p.role === "agent");
    const coverLeads = inn.map((id) => this.peopleBy.get(id)!).filter((p) => p && p.role === "lead");
    const supers = this.supervisorsCountAsLead ? this.input.people.filter((p) => p.role === "supervisor" && p.active !== false && p.homeTerminal === a.terminal) : [];

    const need = new Array<number>(SLOTS).fill(0);
    const have = new Array<number>(SLOTS).fill(0);
    const leadNeed = new Array<number>(SLOTS).fill(0);
    const leadHave = new Array<number>(SLOTS).fill(0);
    const contributing = new Set<string>();
    const onDuty = new Set<string>();

    for (let s = 0; s < SLOTS; s++) {
      const t = s * SLOT_MIN;
      let n = 0;
      let active = false;
      for (const f of flights) {
        const x = flightAgentNeedAt(f, a, t);
        if (x > 0) {
          n += x;
          contributing.add(f.id);
        }
        if (flightActiveAt(f, t)) active = true;
      }
      need[s] = n;
      leadNeed[s] = active && a.sla.lead > 0 ? 1 : 0;
      for (const p of [...agents, ...coverAgents]) {
        if (covers(this.shift(p.id, date), t)) {
          have[s]++;
          if (n > 0) onDuty.add(p.id);
        }
      }
      for (const p of [...leads, ...coverLeads, ...supers]) if (covers(this.shift(p.id, date), t)) leadHave[s]++;
    }

    const gaps: Gap[] = [];
    const scan = (needArr: number[], haveArr: number[], kind: Gap["kind"]) => {
      let s = 0;
      while (s < SLOTS) {
        if (haveArr[s] < needArr[s]) {
          const from = s;
          let short = 0;
          while (s < SLOTS && haveArr[s] < needArr[s]) {
            short = Math.max(short, needArr[s] - haveArr[s]);
            s++;
          }
          const startT = from * SLOT_MIN;
          gaps.push({ airline: airlineCode, date, kind, from: hhmm(from), to: hhmm(s), short, shift: startT < toMinutes(SHIFTS.L.demandFrom) ? "E" : "L" });
        } else s++;
      }
    };
    scan(need, have, "agents");
    scan(leadNeed, leadHave, "lead");

    const dc: DayCoverage = {
      airline: airlineCode,
      date,
      need,
      have,
      leadNeed,
      leadHave,
      gaps,
      coreOnDuty: agents.filter((p) => onDuty.has(p.id)).map((p) => p.id),
      coversIn: inn,
      pulledOut: [...out],
      flightIds: [...contributing],
    };
    this.cache.set(ck, dc);
    return dc;
  }
}

// ---------------- Heatmap cells (shift-level summary) ----------------

export type CoverageLevel = "green" | "amber" | "red" | "none";

export interface CoverageCell {
  airline: string;
  date: string;
  shift: "E" | "L";
  required: number;
  assigned: number;
  leadsRequired: number;
  leadsAssigned: number;
  level: CoverageLevel;
  coreOnShift: string[];
  coversIn: string[];
  pulledOut: string[];
  flightIds: string[];
  gaps: Gap[];
}

export function level(required: number, assigned: number, leadsRequired: number, leadsAssigned: number): CoverageLevel {
  if (required === 0 && leadsRequired === 0) return "none";
  const ratio = required === 0 ? 1 : assigned / required;
  if (ratio < 0.75) return "red";
  if (ratio < 1 || leadsAssigned < leadsRequired) return "amber";
  return "green";
}

export function cellFromDay(dc: DayCoverage, shift: "E" | "L", ctx: CoverageContext): CoverageCell {
  const from = toMinutes(SHIFTS[shift].demandFrom) / SLOT_MIN;
  const to = toMinutes(SHIFTS[shift].demandTo) / SLOT_MIN;
  let required = 0;
  let worst = -Infinity;
  let leadsRequired = 0;
  let leadWorst = -Infinity;
  for (let s = from; s < to; s++) {
    if (dc.need[s] > 0) {
      required = Math.max(required, dc.need[s]);
      worst = Math.max(worst, dc.need[s] - dc.have[s]);
    }
    if (dc.leadNeed[s] > 0) {
      leadsRequired = 1;
      leadWorst = Math.max(leadWorst, dc.leadNeed[s] - dc.leadHave[s]);
    }
  }
  const assigned = required === 0 ? 0 : Math.max(0, required - worst);
  const leadsAssigned = leadsRequired === 0 ? 0 : Math.max(0, leadsRequired - leadWorst);
  const inShift = (id: string) => {
    const s = ctx.shift(id, dc.date);
    return s === shift || s === "M";
  };
  return {
    airline: dc.airline,
    date: dc.date,
    shift,
    required,
    assigned,
    leadsRequired,
    leadsAssigned,
    level: level(required, assigned, leadsRequired, leadsAssigned),
    coreOnShift: dc.coreOnDuty.filter(inShift),
    coversIn: dc.coversIn.filter(inShift),
    pulledOut: dc.pulledOut.filter(inShift),
    flightIds: dc.flightIds.filter((id) => {
      const f = ctx.input.flights.find((x) => x.id === id);
      if (!f) return false;
      const stdSlot = toMinutes(f.std);
      return shift === "E" ? stdSlot - 60 < toMinutes(SHIFTS.E.demandTo) : stdSlot + 10 > toMinutes(SHIFTS.L.demandFrom);
    }),
    gaps: dc.gaps.filter((g) => g.shift === shift),
  };
}

export function coverageCell(input: EngineInput, airline: Airline, date: string, shift: "E" | "L", idxOrCtx?: ShiftIndex | CoverageContext): CoverageCell {
  const ctx = idxOrCtx instanceof CoverageContext ? idxOrCtx : new CoverageContext(input, idxOrCtx);
  return cellFromDay(ctx.day(airline.code, date), shift, ctx);
}

export function coverageGrid(input: EngineInput, start: string, days: number, ctx = new CoverageContext(input)): CoverageCell[] {
  const out: CoverageCell[] = [];
  for (const date of rangeDays(start, days)) {
    for (const a of input.airlines) {
      const dc = ctx.day(a.code, date);
      for (const s of ["E", "L"] as const) out.push(cellFromDay(dc, s, ctx));
    }
  }
  return out;
}
