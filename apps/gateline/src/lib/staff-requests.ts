import { addDays, type Airline, type Person, type RosterEntry, type ShiftCode } from "@nfs/db";
import { CoverageContext, checkPerson, eligibleFor, isWork, type EngineInput, type RuleSettings, type Violation } from "@nfs/rules";
import type { AbsenceType } from "./absence";

/** A shift swap or leave request an agent makes from their phone; supervisors and managers decide. */
export type StaffRequest = SwapRequest | LeaveRequest;

interface Base {
  id: string;
  /** Who asked. */
  by: string;
  at: string;
  note?: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
}

export interface SwapRequest extends Base {
  type: "swap";
  /** The colleague who would take the requester's shift. */
  with: string;
  date: string;
  /** Requester's shift that day, and the colleague's (O = off, so the colleague covers and the requester goes off). */
  myShift: ShiftCode;
  theirShift: ShiftCode;
  status: "awaiting_colleague" | "awaiting_approval" | "approved" | "declined" | "cancelled";
  colleagueAt?: string;
}

export interface LeaveRequest extends Base {
  type: "leave";
  absenceType: AbsenceType;
  from: string;
  to: string;
  status: "awaiting_approval" | "approved" | "declined" | "cancelled";
}

export const REQUEST_STATUS: Record<StaffRequest["status"], { label: string; tone: "warn" | "brand" | "ok" | "bad" | "neutral" }> = {
  awaiting_colleague: { label: "Waiting for colleague", tone: "warn" },
  awaiting_approval: { label: "Waiting for approval", tone: "brand" },
  approved: { label: "Approved", tone: "ok" },
  declined: { label: "Declined", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/** Leave types an agent can ask for ahead of time. Sick calls are reported, not requested. */
export const LEAVE_TYPES: AbsenceType[] = ["annual", "personal", "bereavement", "maternity", "paternity", "training", "unpaid"];

export const isOpen = (r: StaffRequest) => r.status === "awaiting_colleague" || r.status === "awaiting_approval";

export interface SwapOption {
  person: Person;
  theirShift: ShiftCode;
  /** Hard rule breaks block the swap; softer ones are shown so everyone knows before agreeing. */
  blocks: Violation[];
  warnings: Violation[];
  reason?: string;
}

/**
 * Who could swap with `me` on `date`: same airline team and same role (lead for lead, agent for agent),
 * current training on that airline, a different shift that day, and no hard rule broken for either person.
 */
export function swapOptions(input: EngineInput, rules: RuleSettings, me: Person, date: string, shiftOf: (pid: string, d: string) => ShiftCode | undefined, away: (pid: string, d: string) => boolean): SwapOption[] {
  const myShift = shiftOf(me.id, date);
  if (!isWork(myShift)) return [];
  const airline = input.airlines.find((a) => a.code === me.coreAirline);
  const team = input.people.filter((p) => p.id !== me.id && p.active !== false && p.role === me.role && p.coreAirline === me.coreAirline);
  const out: SwapOption[] = [];
  for (const p of team) {
    const theirs = shiftOf(p.id, date) ?? "O";
    if (theirs === myShift || theirs === "V" || away(p.id, date)) continue;
    const elig = airline ? eligibleFor(p, airline, date) : { ok: true as const };
    const check = checkSwap(input, rules, me, p, date, myShift, theirs);
    out.push({ person: p, theirShift: theirs, blocks: check.filter((v) => v.severity === "hard"), warnings: check.filter((v) => v.severity !== "hard"), reason: elig.ok ? undefined : elig.reason });
  }
  return out.sort((a, b) => Number(!!a.reason || a.blocks.length > 0) - Number(!!b.reason || b.blocks.length > 0) || a.warnings.length - b.warnings.length);
}

/** Rule check with the swap applied: rest, days in a row, weekly hours, for both people around the date. */
export function checkSwap(input: EngineInput, rules: RuleSettings, a: Person, b: Person, date: string, aShift: ShiftCode, bShift: ShiftCode): Violation[] {
  const roster: RosterEntry[] = input.roster.filter((r) => !(r.date === date && (r.personId === a.id || r.personId === b.id)));
  roster.push({ personId: a.id, date, shift: bShift }, { personId: b.id, date, shift: aShift });
  const ctx = new CoverageContext({ ...input, roster });
  const from = addDays(date, -1);
  return [...checkPerson(ctx, a, from, 3, rules), ...checkPerson(ctx, b, from, 3, rules)];
}

export function airlineName(airlines: Airline[], code?: string | null) {
  return airlines.find((a) => a.code === code)?.name ?? "Float pool";
}

/**
 * Sample requests so the Staff requests inbox has real work in it on a fresh demo: leave and swaps
 * waiting for a manager, one waiting on a colleague, and a couple already decided. Built from the live
 * roster so every swap is between two people on the same team who really work different shifts that day.
 */
export function demoRequests(today: string, people: Person[], shiftOf: (pid: string, d: string) => ShiftCode | undefined): StaffRequest[] {
  const at = (days: number, hm: string) => `${addDays(today, days)}T${hm}:00.000Z`;
  const team = (code: string) => people.filter((p) => p.role === "agent" && p.active !== false && p.coreAirline === code && p.id !== "p4100");
  const sup = people.find((p) => p.role === "supervisor" && p.active !== false);
  const supName = sup ? `${sup.firstName} ${sup.lastName}` : "Duty supervisor";
  const out: StaffRequest[] = [];
  const used = new Set<string>();
  const pick = (code: string, n = 0) => team(code).filter((p) => !used.has(p.id))[n];
  const swapPair = (code: string, fromDay: number) => {
    const ms = team(code).filter((p) => !used.has(p.id));
    for (let k = fromDay; k < fromDay + 6; k++) {
      const d = addDays(today, k);
      for (const a of ms) for (const b of ms) {
        if (a.id === b.id) continue;
        const sa = shiftOf(a.id, d);
        const sb = shiftOf(b.id, d);
        if ((sa === "E" && sb === "L") || (sa === "L" && sb === "E")) return { a, b, d, sa, sb };
      }
    }
    return null;
  };
  const leave = (id: string, p: Person | undefined, type: LeaveRequest["absenceType"], from: number, to: number, asked: string, note: string, decided?: { status: "approved" | "declined"; days: number; note?: string }) => {
    if (!p) return;
    used.add(p.id);
    out.push({
      id, type: "leave", by: p.id, at: asked, absenceType: type, from: addDays(today, from), to: addDays(today, to), note,
      status: decided ? decided.status : "awaiting_approval",
      ...(decided ? { decidedBy: supName, decidedAt: at(decided.days, "15:20"), decisionNote: decided.note } : {}),
    });
  };
  leave("req-demo-1", pick("UA"), "annual", 9, 11, at(-1, "09:14"), "Family wedding in Andros");
  leave("req-demo-2", pick("AC"), "personal", 4, 4, at(0, "07:40"), "My son's graduation in the morning");
  const s1 = swapPair("CM", 3);
  if (s1) {
    used.add(s1.a.id); used.add(s1.b.id);
    out.push({ id: "req-demo-3", type: "swap", by: s1.a.id, with: s1.b.id, date: s1.d, myShift: s1.sa!, theirShift: s1.sb!, at: at(-1, "18:20"), colleagueAt: at(0, "08:05"), note: "Doctor's appointment that afternoon", status: "awaiting_approval" });
  }
  const s2 = ["WS", "JY", "AC", "UA"].reduce<ReturnType<typeof swapPair>>((hit, code) => hit ?? swapPair(code, 5), null);
  if (s2) {
    used.add(s2.a.id); used.add(s2.b.id);
    out.push({ id: "req-demo-4", type: "swap", by: s2.a.id, with: s2.b.id, date: s2.d, myShift: s2.sa!, theirShift: s2.sb!, at: at(0, "06:55"), note: "Church conference that evening", status: "awaiting_colleague" });
  }
  leave("req-demo-5", pick("BW"), "annual", 14, 18, at(-4, "11:02"), "Trip to Miami booked in August", { status: "approved", days: -2, note: "Approved. Enjoy the trip." });
  leave("req-demo-6", pick("UA"), "personal", 2, 2, at(-3, "16:45"), "Moving house", { status: "declined", days: -2, note: "United is short on that late shift. Can you pick another day this week?" });
  return out;
}
