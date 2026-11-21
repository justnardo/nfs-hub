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
