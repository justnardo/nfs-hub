/**
 * Shared union, rest and fatigue rule engine + coverage maths.
 * Used by Gateline now and Rampline after the back-end merge.
 */
import {
  SHIFTS, addDays, dayOfWeek, rangeDays, shiftDemand, toMinutes, weekStart,
  type Airline, type Flight, type Person, type Reassignment, type RosterEntry, type ShiftCode,
} from "@nfs/db";

export const RULES = {
  minRestHours: 11,
  maxConsecutiveLates: 3,
  weeklyHours: 40,
  consecutiveDaysOffPerWeek: 2,
  changeNoticeHours: 48,
} as const;

export interface RuleViolation {
  personId: string;
  date: string;
  rule: "rest" | "late-run" | "days-off" | "hours";
  message: string;
}

function restHours(prev: ShiftCode, next: ShiftCode): number {
  if (prev !== "E" && prev !== "L") return 99;
  if (next !== "E" && next !== "L") return 99;
  const end = toMinutes(SHIFTS[prev].end);
  const start = toMinutes(SHIFTS[next].start) + 1440;
  return (start - end) / 60;
}

/** Validate one person's roster over a date range. */
export function validatePerson(personId: string, entries: RosterEntry[]): RuleViolation[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const out: RuleViolation[] = [];
  let lateRun = 0;
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    const prev = sorted[i - 1];
    if (prev && addDays(prev.date, 1) === e.date) {
      const rest = restHours(prev.shift, e.shift);
      if (rest < RULES.minRestHours) {
        out.push({ personId, date: e.date, rule: "rest", message: `Only ${rest.toFixed(1)}h rest after late shift (union minimum ${RULES.minRestHours}h)` });
      }
    }
    lateRun = e.shift === "L" ? lateRun + 1 : 0;
    if (lateRun === RULES.maxConsecutiveLates + 1) {
      out.push({ personId, date: e.date, rule: "late-run", message: `${lateRun} late shifts in a row (max ${RULES.maxConsecutiveLates})` });
    }
  }
  // per Sun–Sat week
  const weeks = new Map<string, RosterEntry[]>();
  for (const e of sorted) weeks.set(weekStart(e.date), [...(weeks.get(weekStart(e.date)) ?? []), e]);
  for (const [ws, list] of weeks) {
    if (list.length < 7) continue;
    if (list.every((e) => e.shift === "V")) continue;
    const byDow = new Map(list.map((e) => [dayOfWeek(e.date), e.shift]));
    let consecutive = false;
    for (let d = 0; d < 6; d++) {
      const a = byDow.get(d);
      const b = byDow.get(d + 1);
      if ((a === "O" || a === "V") && (b === "O" || b === "V")) consecutive = true;
    }
    if (!consecutive) out.push({ personId, date: ws, rule: "days-off", message: "No two consecutive days off inside the Sun–Sat week" });
    const hours = list.filter((e) => e.shift === "E" || e.shift === "L").length * 8;
    if (hours > RULES.weeklyHours) out.push({ personId, date: ws, rule: "hours", message: `${hours}h rostered (standard ${RULES.weeklyHours}h)` });
  }
  return out;
}

export function validateRoster(entries: RosterEntry[]): RuleViolation[] {
  const byPerson = new Map<string, RosterEntry[]>();
  for (const e of entries) byPerson.set(e.personId, [...(byPerson.get(e.personId) ?? []), e]);
  return [...byPerson].flatMap(([id, list]) => validatePerson(id, list));
}

// ---------------- Training eligibility ----------------

export type Eligibility = { ok: true } | { ok: false; reason: string };

export function eligibleFor(person: Person, airline: Airline, onDate: string): Eligibility {
  if (!person.trainedAirlines.includes(airline.code)) return { ok: false, reason: `Not trained on ${airline.name}` };
  const recs = person.training.filter((t) => t.airline === airline.code);
  const missing = airline.requiredTraining.filter((c) => !recs.some((t) => t.course === c));
  if (missing.length) return { ok: false, reason: `Missing ${missing.join(", ")}` };
  const expired = recs.filter((t) => t.expires < onDate);
  if (expired.length) return { ok: false, reason: `${expired[0].course} expired ${expired[0].expires}` };
  return { ok: true };
}

export function expiringSoon(person: Person, onDate: string, days = 30) {
  const limit = addDays(onDate, days);
  return person.training.filter((t) => t.expires >= onDate && t.expires <= limit);
}

// ---------------- Coverage ----------------

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
}

export function level(required: number, assigned: number, leadsRequired: number, leadsAssigned: number): CoverageLevel {
  if (required === 0 && leadsRequired === 0) return "none";
  const ratio = required === 0 ? 1 : assigned / required;
  if (ratio < 0.75) return "red";
  if (ratio < 1 || leadsAssigned < leadsRequired) return "amber";
  return "green";
}

export interface CoverageInput {
  airlines: Airline[];
  people: Person[];
  flights: Flight[];
  roster: RosterEntry[];
  reassignments: Reassignment[];
}

export function buildShiftIndex(roster: RosterEntry[]) {
  const m = new Map<string, ShiftCode>();
  for (const e of roster) m.set(`${e.personId}|${e.date}`, e.shift);
  return m;
}

export function coverageCell(input: CoverageInput, airline: Airline, date: string, shift: "E" | "L", idx = buildShiftIndex(input.roster)): CoverageCell {
  const dayFlights = input.flights.filter((f) => f.date === date && f.airline === airline.code);
  const demand = shiftDemand(dayFlights, airline, shift);
  const moves = input.reassignments.filter((r) => r.date === date && r.shift === shift);
  const outIds = new Set(moves.filter((r) => r.fromAirline === airline.code).map((r) => r.personId));
  const inIds = moves.filter((r) => r.toAirline === airline.code).map((r) => r.personId);

  const core = input.people.filter(
    (p) => (p.role === "agent") && p.coreAirline === airline.code && idx.get(`${p.id}|${date}`) === shift && !outIds.has(p.id),
  );
  const eligibleCore = core.filter((p) => eligibleFor(p, airline, date).ok);
  const leads = input.people.filter(
    (p) => p.role === "lead" && p.coreAirline === airline.code && idx.get(`${p.id}|${date}`) === shift && !outIds.has(p.id),
  );
  const coversIn = inIds.filter((id) => {
    const p = input.people.find((x) => x.id === id);
    return p && p.role === "agent";
  });
  const leadsIn = inIds.filter((id) => input.people.find((x) => x.id === id)?.role === "lead");
  const assigned = eligibleCore.length + coversIn.length;
  const leadsAssigned = leads.length + leadsIn.length;
  const leadsRequired = Math.min(1, demand.leads);
  return {
    airline: airline.code,
    date,
    shift,
    required: demand.agents,
    assigned,
    leadsRequired,
    leadsAssigned,
    level: level(demand.agents, assigned, leadsRequired, leadsAssigned),
    coreOnShift: eligibleCore.map((p) => p.id),
    coversIn,
    pulledOut: [...outIds],
    flightIds: demand.flightIds,
  };
}

export function coverageGrid(input: CoverageInput, start: string, days: number): CoverageCell[] {
  const idx = buildShiftIndex(input.roster);
  const out: CoverageCell[] = [];
  for (const date of rangeDays(start, days)) {
    for (const a of input.airlines) {
      for (const s of ["E", "L"] as const) out.push(coverageCell(input, a, date, s, idx));
    }
  }
  return out;
}

// ---------------- Protected reassignment ----------------

export type ReassignCheck =
  | { verdict: "allow"; notes: string[] }
  | { verdict: "warn"; notes: string[]; homeAfter: CoverageCell }
  | { verdict: "block"; notes: string[] };

/**
 * Check moving a person onto another airline for a shift.
 * Blocks untrained/expired; warns if a core agent's own airline would drop below SLA.
 */
export function checkReassignment(
  input: CoverageInput,
  person: Person,
  toAirline: Airline,
  date: string,
  shift: "E" | "L",
): ReassignCheck {
  const idx = buildShiftIndex(input.roster);
  const notes: string[] = [];
  const on = idx.get(`${person.id}|${date}`);
  if (on !== shift) return { verdict: "block", notes: [`Not rostered on the ${SHIFTS[shift].label.toLowerCase()} shift (${on ?? "no shift"})`] };
  const elig = eligibleFor(person, toAirline, date);
  if (!elig.ok) return { verdict: "block", notes: [elig.reason] };
  if (person.coreAirline === toAirline.code) return { verdict: "block", notes: ["Already on this airline's core team"] };
  if (!person.coreAirline) {
    notes.push("Float pool agent — no core team affected");
    return { verdict: "allow", notes };
  }
  const home = input.airlines.find((a) => a.code === person.coreAirline)!;
  const simulated: Reassignment = { id: "sim", date, shift, personId: person.id, fromAirline: home.code, toAirline: toAirline.code, overrideReason: null, approvedBy: "", at: "" };
  const homeAfter = coverageCell({ ...input, reassignments: [...input.reassignments, simulated] }, home, date, shift, idx);
  if (person.role === "lead") {
    if (homeAfter.leadsAssigned < homeAfter.leadsRequired) {
      notes.push(`${home.name} would have no lead on this shift`);
      notes.push(`Core ${home.code} lead — station manager expects a dedicated lead`);
      return { verdict: "warn", notes, homeAfter };
    }
    notes.push(`${home.name} keeps a lead on shift`);
    return { verdict: "allow", notes };
  }
  if (homeAfter.required > 0 && homeAfter.assigned < homeAfter.required) {
    notes.push(`${home.name} drops to ${homeAfter.assigned}/${homeAfter.required} against SLA`);
    notes.push(`Core ${home.code} agent — station manager expects core staff to stay on ${home.code} flights`);
    return { verdict: "warn", notes, homeAfter };
  }
  notes.push(`${home.name} stays at ${homeAfter.assigned}/${homeAfter.required} — SLA held`);
  return { verdict: "allow", notes };
}

export { SHIFTS };
