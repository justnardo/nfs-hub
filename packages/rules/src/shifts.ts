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

/** "07:00-15:00" or "0700-1500" → minutes from midnight; an end before the start runs past midnight. */
export function parseSpan(time: string): { start: number; end: number } | null {
  const m = /^(\d{2}):?(\d{2})\s*[-–]\s*(\d{2}):?(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  let end = Number(m[3]) * 60 + Number(m[4]);
  if (end <= start) end += 1440;
  return { start, end };
}

/** Which band a start time belongs to, for coverage and rules: before 08:00 early, before 12:00 mid, after that late. */
export function bandOf(startMinutes: number): WorkShift {
  return startMinutes < 8 * 60 ? "E" : startMinutes < 12 * 60 ? "M" : "L";
}

/** Start and end of a rostered shift: its exact time if it has one, otherwise the standard band. */
export function spanOf(s: WorkShift, time?: string | null): { start: number; end: number } {
  const t = time ? parseSpan(time) : null;
  return t ?? { start: startMin(s), end: endMin(s) };
}

/** "07:00-15:00" → "0700-1500", the way NFS rosters print it. */
export function compactSpan(time: string): string {
  return time.replace(/:/g, "").replace(/\s/g, "");
}

/** Normalise any accepted input ("0700-1500", "7:00-15:00") to "07:00-15:00". */
export function normaliseSpan(time: string): string | null {
  const t = parseSpan(time.replace(/(^|[-–\s])(\d):/g, "$10$2:"));
  if (!t) return null;
  const f = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return `${f(t.start)}-${f(t.end)}`;
}
