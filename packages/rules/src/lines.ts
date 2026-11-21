/**
 * Line rosters, the way NFS issues them to agents: an airline has lines (A, B, C…), each a fixed
 * Sunday-to-Saturday week of shift times or days off, and every agent is put on a line each week.
 */
import { addDays, weekStart as weekStartOf, type Airline, type Person, type RosterEntry, type RosterLine, type ShiftCode } from "@nfs/db";
import { bandOf, isWork, normaliseSpan, parseSpan, SHIFT_TIMES } from "./shifts";

/** Seed lines may use "@this-week" / "@this-week-1" so the demo always shows a mid-month change; resolve them. */
export function resolveLines(lines: RosterLine[], today: string): RosterLine[] {
  const ws = weekStartOf(today);
  const fix = (v?: string) => (v === "@this-week" ? ws : v === "@this-week-1" ? addDays(ws, -1) : v);
  return lines.map((l) => ({ ...l, from: fix(l.from), to: fix(l.to) }));
}

/** The version of a line that applies in the week starting `ws`. */
export function lineAt(lines: RosterLine[], label: string, ws: string): RosterLine | undefined {
  return lines.find((l) => l.label === label && (!l.from || l.from <= ws) && (!l.to || ws <= l.to));
}

/** Distinct line labels in roster order. */
export function lineLabels(lines: RosterLine[]): string[] {
  return [...new Set(lines.map((l) => l.label))].sort();
}

/**
 * Standing line per person: what the airline has on record, otherwise leads first, then agents by
 * staff number, dealt across the lines in order.
 */
export function standingLines(airline: Airline, members: Person[]): Map<string, string> {
  const labels = lineLabels(airline.lines ?? []);
  const out = new Map<string, string>();
  if (!labels.length) return out;
  const sorted = [...members].sort((a, b) => Number(b.role === "lead") - Number(a.role === "lead") || a.staffNo.localeCompare(b.staffNo));
  let i = 0;
  for (const p of sorted) {
    const set = airline.lineAssign?.[p.id];
    out.set(p.id, set && labels.includes(set) ? set : labels[i++ % labels.length]);
  }
  return out;
}

/** Which line a person is on in the week starting `ws`. */
export function lineFor(airline: Airline, standing: Map<string, string>, personId: string, ws: string): string | undefined {
  return airline.lineWeeks?.[ws]?.[personId] ?? standing.get(personId);
}

/** A day of a line as a roster entry: band code for coverage and rules, plus the exact time. */
export function lineDay(line: RosterLine | undefined, dow: number): { shift: ShiftCode; time?: string } {
  const t = line?.days[dow];
  const span = t ? parseSpan(t) : null;
  if (!t || !span) return { shift: "O" };
  return { shift: bandOf(span.start), time: normaliseSpan(t) ?? t };
}

/** Roster entries for a team from its lines, for each week start given. */
export function entriesFromLines(airline: Airline, members: Person[], weekStarts: string[]): RosterEntry[] {
  const lines = airline.lines ?? [];
  if (!lines.length) return [];
  const standing = standingLines(airline, members);
  const out: RosterEntry[] = [];
  for (const ws of weekStarts) {
    for (const p of members) {
      const label = lineFor(airline, standing, p.id, ws);
      const line = label ? lineAt(lines, label, ws) : undefined;
      for (let d = 0; d < 7; d++) {
        const { shift, time } = lineDay(line, d);
        out.push({ personId: p.id, date: addDays(ws, d), shift, ...(time ? { time } : {}) });
      }
    }
  }
  return out;
}

/* ---------------- The printed roster sheet ---------------- */

export interface SheetRow {
  person: Person;
  /** The line shown at the start of the row, and its week. */
  label: string;
  days: (string | null)[];
  /** Line letter for each week in the block. */
  weeks: string[];
}
export interface SheetBlock {
  weekStarts: string[];
  rows: SheetRow[];
}

/** A day's time for the sheet: exact time, or the standard band time, or null for off/leave. */
const dayTime = (e?: Pick<RosterEntry, "shift" | "time">) => (e && isWork(e.shift) ? e.time ?? `${SHIFT_TIMES[e.shift].start}-${SHIFT_TIMES[e.shift].end}` : null);

/**
 * Lay a team's roster out the way NFS prints it. Airlines with lines use them; any other airline gets
 * lines worked out from its roster (each distinct week becomes a line), so every team can print the same sheet.
 * Rows are grouped into blocks of weeks in which each person's pattern stays the same, so a mid-month
 * change starts a new block, exactly as on the paper roster.
 */
export function rosterSheet(airline: Airline, members: Person[], weekStarts: string[], entryOf: (pid: string, date: string) => Pick<RosterEntry, "shift" | "time"> | undefined): SheetBlock[] {
  const pattern = (pid: string, ws: string) => Array.from({ length: 7 }, (_, d) => dayTime(entryOf(pid, addDays(ws, d))));
  const keyOf = (days: (string | null)[]) => days.map((x) => x ?? "OFF").join("|");

  // Label each distinct week pattern: the airline's own line letters where they match, else A, B, C… in order of first use.
  const lines = airline.lines ?? [];
  const named = new Map<string, string>();
  for (const l of lines) {
    const k = keyOf(l.days.map((t) => (t ? normaliseSpan(t) : null)));
    if (!named.has(k)) named.set(k, l.label);
  }
  const standing = standingLines(airline, members);
  const used = new Set(named.values());
  let next = 0;
  const fresh = () => {
    while (used.has(String.fromCharCode(65 + next))) next++;
    const l = String.fromCharCode(65 + next++);
    used.add(l);
    return l;
  };
  const labelFor = (pid: string, ws: string, days: (string | null)[]) => {
    const k = keyOf(days);
    const own = lines.length ? lineFor(airline, standing, pid, ws) : undefined;
    if (own && lineAt(lines, own, ws) && keyOf(lineAt(lines, own, ws)!.days.map((t) => (t ? normaliseSpan(t) : null))) === k) return own;
    if (!named.has(k)) named.set(k, fresh());
    return named.get(k)!;
  };

  const sorted = [...members].sort((a, b) => Number(b.role === "lead") - Number(a.role === "lead") || a.staffNo.localeCompare(b.staffNo));
  const blocks = new Map<string, SheetBlock>();
  for (const p of sorted) {
    let seg: { weeks: string[]; days: (string | null)[]; labels: string[]; last: (string | null)[] } | null = null;
    const flush = () => {
      if (!seg) return;
      const k = `${p.role === "lead" ? "L" : "A"}|${seg.weeks.join(",")}`;
      const b = blocks.get(k) ?? { weekStarts: seg.weeks, rows: [] };
      b.rows.push({ person: p, label: seg.labels[0], days: seg.days, weeks: seg.labels });
      blocks.set(k, b);
    };
    for (const ws of weekStarts) {
      const days = pattern(p.id, ws);
      const label = labelFor(p.id, ws, days);
      // A line whose pattern changes part-way (same letter, new times) starts a new block, as on the paper roster.
      // Moving to another line just shows the new letter in that week's column.
      if (seg && lines.length && label === seg.labels[seg.labels.length - 1] && keyOf(seg.last) !== keyOf(days)) {
        flush();
        seg = null;
      }
      if (!seg) seg = { weeks: [ws], days, labels: [label], last: days };
      else {
        seg.weeks.push(ws);
        seg.labels.push(label);
        seg.last = days;
      }
    }
    flush();
  }
  return [...blocks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, b]) => ({ ...b, rows: b.rows.sort((x, y) => x.label.localeCompare(y.label) || x.person.staffNo.localeCompare(y.person.staffNo)) }));
}
