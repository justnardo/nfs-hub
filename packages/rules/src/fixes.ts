/**
 * Ranked repairs for one coverage gap (airline, date, shift). The engine proposes; a manager approves.
 *  pull      — someone on shift from the float pool or another team who is current on the airline
 *  swap      — a core agent on the other shift that day moves over (where that shift has room)
 *  dayoff    — a core agent off that day comes in and takes a different day off that week
 *  overtime  — a core agent off that day comes in as an extra shift (over 40h, needs approval)
 *  leave-empty — always last
 * Every option is simulated: does it close the gap, and which rules would it break?
 */
import { addDays, rangeDays, weekStart, type Person, type Reassignment, type ShiftCode } from "@nfs/db";
import { resolveRules, type RuleSettings } from "./config";
import { CoverageContext, buildShiftIndex, cellFromDay, key, type CoverageCell, type EngineInput } from "./coverage";
import { checkPerson, type Violation } from "./check";
import { eligibleFor } from "./eligibility";
import { SHIFT_LABEL, isWork } from "./shifts";

export type FixKind = "pull" | "swap" | "dayoff" | "overtime" | "leave-empty";

export interface CellEdit {
  personId: string;
  date: string;
  shift: ShiftCode;
}

export interface Fix {
  id: string;
  kind: FixKind;
  title: string;
  detail: string;
  personId?: string;
  edits: CellEdit[];
  reassignment?: Omit<Reassignment, "id" | "at" | "approvedBy" | "overrideReason">;
  closes: boolean;
  improves: boolean;
  needsOverride: boolean;
  newHard: Violation[];
  newSoft: Violation[];
  rank: number;
}

const name = (p: Person) => `${p.firstName} ${p.lastName}`;

function simulate(input: EngineInput, baseIdx: Map<string, ShiftCode>, edits: CellEdit[], r?: Fix["reassignment"]) {
  const idx = new Map(baseIdx);
  for (const e of edits) idx.set(key(e.personId, e.date), e.shift);
  const reassignments = r ? [...input.reassignments, { ...r, id: "sim", at: "", approvedBy: "", overrideReason: null }] : input.reassignments;
  return new CoverageContext({ ...input, reassignments }, idx);
}

function personDiff(before: CoverageContext, after: CoverageContext, p: Person, from: string, rules: RuleSettings) {
  const b = new Set(checkPerson(before, p, from, 14, rules).map((v) => v.ruleId + v.date));
  return checkPerson(after, p, from, 14, rules).filter((v) => !b.has(v.ruleId + v.date));
}

const COST: Record<FixKind, number> = { pull: 2, swap: 3, dayoff: 4, overtime: 6, "leave-empty": 999 };

export function suggestFixes(input: EngineInput, target: { airline: string; date: string; shift: "E" | "L" }, rulesIn?: RuleSettings, limit = 8): Fix[] {
  const rules = rulesIn ?? resolveRules();
  const baseIdx = buildShiftIndex(input.roster);
  const base = new CoverageContext(input, baseIdx);
  const airline = base.airlineBy.get(target.airline)!;
  const cellBefore = cellFromDay(base.day(target.airline, target.date), target.shift, base);
  const needAgents = cellBefore.assigned < cellBefore.required;
  const needLead = cellBefore.leadsAssigned < cellBefore.leadsRequired;
  const other: "E" | "L" = target.shift === "E" ? "L" : "E";
  const ws = weekStart(target.date);
  const week = rangeDays(ws, 7);
  const checkFrom = ws;
  const out: Fix[] = [];
  const already = new Set(input.reassignments.filter((r) => r.date === target.date).map((r) => r.personId));

  const finish = (f: Omit<Fix, "closes" | "improves" | "newHard" | "newSoft" | "rank" | "needsOverride"> & { needsOverride?: boolean }, affected: Person[]) => {
    const after = simulate(input, baseIdx, f.edits, f.reassignment);
    const cell = cellFromDay(after.day(target.airline, target.date), target.shift, after);
    const closes = cell.assigned >= cell.required && cell.leadsAssigned >= cell.leadsRequired;
    const improves = cell.assigned > cellBefore.assigned || cell.leadsAssigned > cellBefore.leadsAssigned;
    let newV: Violation[] = [];
    for (const p of affected) newV = newV.concat(personDiff(base, after, p, checkFrom, rules));
    // A move must not open a gap elsewhere silently
    let needsOverride = !!f.needsOverride;
    for (const e of f.edits) {
      if (e.date !== target.date || !isWork(e.shift)) continue;
      const p = base.peopleBy.get(e.personId);
      if (p?.coreAirline && p.coreAirline === target.airline && e.shift === target.shift) {
        const o = cellFromDay(after.day(target.airline, target.date), other, after);
        const ob = cellFromDay(base.day(target.airline, target.date), other, base);
        if (o.assigned < o.required && o.assigned < ob.assigned) newV.push({ ruleId: "sla-coverage", severity: rules["sla-coverage"].severity, airline: target.airline, date: target.date, message: `${target.airline} ${SHIFT_LABEL[other].toLowerCase()} drops to ${o.assigned}/${o.required}` });
      }
    }
    const newHard = newV.filter((v) => v.severity === "hard");
    const newSoft = newV.filter((v) => v.severity !== "hard");
    const rank = (closes ? 0 : improves ? 100 : 500) + newHard.length * 1000 + (needsOverride ? 50 : 0) + newSoft.length * 5 + COST[f.kind];
    out.push({ ...f, closes, improves, needsOverride, newHard, newSoft, rank });
  };

  // ---- pull: someone on that shift elsewhere, current on this airline
  const roles = new Set<string>([...(needAgents ? ["agent"] : []), ...(needLead ? ["lead"] : [])]);
  for (const p of input.people) {
    if (!roles.has(p.role) || p.active === false || p.coreAirline === target.airline || already.has(p.id)) continue;
    const s = base.shift(p.id, target.date);
    if (s !== target.shift && s !== "M") continue;
    if (!eligibleFor(p, airline, target.date).ok) continue;
    let needsOverride = false;
    let detail = "Float pool — no core team affected.";
    if (p.coreAirline) {
      const sim = simulate(input, baseIdx, [], { date: target.date, shift: target.shift, personId: p.id, fromAirline: p.coreAirline, toAirline: target.airline });
      const home = cellFromDay(sim.day(p.coreAirline, target.date), target.shift, sim);
      if (home.required > 0 && home.assigned < home.required) {
        needsOverride = true;
        detail = `Core ${p.coreAirline} — ${p.coreAirline} drops to ${home.assigned}/${home.required}. Needs a manager override.`;
      } else detail = `Core ${p.coreAirline} — ${p.coreAirline} keeps its SLA (${home.assigned}/${home.required}).`;
    }
    finish(
      {
        id: `pull-${p.id}`,
        kind: "pull",
        title: `Move ${name(p)} to ${target.airline}${p.role === "lead" ? " as lead" : ""}`,
        detail,
        personId: p.id,
        edits: [],
        reassignment: { date: target.date, shift: target.shift, personId: p.id, fromAirline: p.coreAirline ?? "POOL", toAirline: target.airline },
        needsOverride,
      },
      [p],
    );
  }

  const core = (base.coreBy.get(target.airline) ?? []).filter((p) => (needAgents ? p.role === "agent" : p.role === "lead") && (p.role !== "agent" || eligibleFor(p, airline, target.date).ok));

  // ---- swap: same team, other shift that day
  for (const p of core) {
    if (base.shift(p.id, target.date) !== other) continue;
    finish(
      { id: `swap-${p.id}`, kind: "swap", title: `Switch ${name(p)} to ${SHIFT_LABEL[target.shift].toLowerCase()} that day`, detail: `On ${SHIFT_LABEL[other].toLowerCase()} today; moves to ${SHIFT_LABEL[target.shift].toLowerCase()}. Same hours.`, personId: p.id, edits: [{ personId: p.id, date: target.date, shift: target.shift }] },
      [p],
    );
  }

  // ---- dayoff + overtime: same team, off that day
  for (const p of core) {
    if (base.shift(p.id, target.date) !== "O") continue;
    // try giving a different working day off where that shift has room
    let placed = false;
    for (const d of week) {
      if (d === target.date) continue;
      const s = base.shift(p.id, d);
      if (s !== "E" && s !== "L") continue;
      const c = cellFromDay(base.day(target.airline, d), s, base);
      if (c.assigned - 1 < c.required) continue;
      const edits = [
        { personId: p.id, date: target.date, shift: target.shift as ShiftCode },
        { personId: p.id, date: d, shift: "O" as ShiftCode },
      ];
      const trial = simulate(input, baseIdx, edits);
      if (personDiff(base, trial, p, checkFrom, rules).some((v) => v.severity === "hard")) continue;
      finish({ id: `dayoff-${p.id}-${d}`, kind: "dayoff", title: `Bring ${name(p)} in; day off moves to ${new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })}`, detail: `Same hours that week. ${SHIFT_LABEL[s]} on that day keeps cover (${c.assigned - 1}/${c.required}).`, personId: p.id, edits }, [p]);
      placed = true;
      break;
    }
    finish(
      { id: `ot-${p.id}`, kind: "overtime", title: `Call ${name(p)} in on overtime`, detail: `Extra ${SHIFT_LABEL[target.shift].toLowerCase()} shift on a day off — overtime, needs approval${placed ? "" : ". No day-off swap fits the rules this week"}.`, personId: p.id, edits: [{ personId: p.id, date: target.date, shift: target.shift }] },
      [p],
    );
  }

  out.sort((a, b) => a.rank - b.rank);
  const top = out.slice(0, limit);
  top.push({ id: "leave", kind: "leave-empty", title: "Leave the gap", detail: "Keep the roster as it is and note the shortfall.", edits: [], closes: false, improves: false, needsOverride: false, newHard: [], newSoft: [], rank: 9999 });
  return top;
}

// ---------------- Compatibility: single reassignment check ----------------

export type ReassignCheck =
  | { verdict: "allow"; notes: string[] }
  | { verdict: "warn"; notes: string[]; homeAfter: CoverageCell }
  | { verdict: "block"; notes: string[] };

export function checkReassignment(input: EngineInput, person: Person, toAirline: { code: string; name: string } & Parameters<typeof eligibleFor>[1], date: string, shift: "E" | "L"): ReassignCheck {
  const ctx = new CoverageContext(input);
  const on = ctx.shift(person.id, date);
  if (on !== shift && on !== "M") return { verdict: "block", notes: [`Not rostered on the ${SHIFT_LABEL[shift].toLowerCase()} shift (${on ? SHIFT_LABEL[on].toLowerCase() : "no shift"})`] };
  const e = eligibleFor(person, toAirline, date);
  if (!e.ok) return { verdict: "block", notes: [e.reason] };
  if (person.coreAirline === toAirline.code) return { verdict: "block", notes: ["Already on this airline's core team"] };
  if (!person.coreAirline) return { verdict: "allow", notes: ["Float pool agent — no core team affected"] };
  const sim = simulate(input, ctx.idx, [], { date, shift, personId: person.id, fromAirline: person.coreAirline, toAirline: toAirline.code });
  const home = cellFromDay(sim.day(person.coreAirline, date), shift, sim);
  const homeName = ctx.airlineBy.get(person.coreAirline)?.name ?? person.coreAirline;
  if (person.role === "lead") {
    if (home.leadsAssigned < home.leadsRequired) return { verdict: "warn", notes: [`${homeName} would have no lead on this shift`, `Core ${person.coreAirline} lead — station manager expects a dedicated lead`], homeAfter: home };
    return { verdict: "allow", notes: [`${homeName} keeps a lead on shift`] };
  }
  if (home.required > 0 && home.assigned < home.required) return { verdict: "warn", notes: [`${homeName} drops to ${home.assigned}/${home.required} against SLA`, `Core ${person.coreAirline} agent — station manager expects core staff to stay on ${person.coreAirline} flights`], homeAfter: home };
  return { verdict: "allow", notes: [`${homeName} stays at ${home.assigned}/${home.required} — SLA held`] };
}

export { addDays };
