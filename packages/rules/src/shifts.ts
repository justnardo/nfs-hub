import { toMinutes, type ShiftCode } from "@nfs/db";

/** Shift catalogue. Paid length 8h (30-minute unpaid meal inside the 8.5h span). */
export const SHIFT_TIMES = {
  E: { code: "E", label: "Early", start: "04:00", end: "12:30" },
  M: { code: "M", label: "Mid", start: "08:00", end: "16:30" },
  L: { code: "L", label: "Late", start: "12:00", end: "20:30" },
} as const;

export type WorkShift = keyof typeof SHIFT_TIMES;
export const PAID_HOURS = 8;
export const SLOT_MIN = 15;
export const SLOTS = (24 * 60) / SLOT_MIN;

export function isWork(s: ShiftCode | undefined | null): s is WorkShift {
  return s === "E" || s === "M" || s === "L";
}

export function startMin(s: WorkShift): number {
  return toMinutes(SHIFT_TIMES[s].start);
}
export function endMin(s: WorkShift): number {
  return toMinutes(SHIFT_TIMES[s].end);
}

/** Does shift s cover minute t of the day? */
export function covers(s: ShiftCode | undefined, t: number): boolean {
  if (!isWork(s)) return false;
  return t >= startMin(s) && t < endMin(s);
}

export const SHIFT_LABEL: Record<ShiftCode, string> = { E: "Early", M: "Mid", L: "Late", O: "Day off", V: "Vacation" };
