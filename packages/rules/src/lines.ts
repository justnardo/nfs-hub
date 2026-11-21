/**
 * Line rosters, the way NFS issues them to agents: an airline has lines (A, B, C…), each a fixed
 * Sunday-to-Saturday week of shift times or days off, and every agent is put on a line each week.
 */
import { addDays, weekStart as weekStartOf, type Airline, type LineGroup, type Person, type RosterEntry, type RosterLine, type ShiftCode } from "@nfs/db";
import { bandOf, isWork, normaliseSpan, parseSpan, SHIFT_TIMES } from "./shifts";

/** Seed lines may use "@this-week" / "@this-week-1" so the demo always shows a mid-month change; resolve them. */
export function resolveLines(lines: RosterLine[], today: string): RosterLine[] {
  const ws = weekStartOf(today);
  const fix = (v?: string) => (v === "@this-week" ? ws : v === "@this-week-1" ? addDays(ws, -1) : v);
  return lines.map((l) => ({ ...l, from: fix(l.from), to: fix(l.to) }));
}

/** Which set of lines a person is on: leads and supervisors have their own when the airline defines them. */
export function lineGroup(lines: RosterLine[], p: Pick<Person, "role">): LineGroup | undefined {
  if (p.role === "supervisor") return "supervisor";
  return p.role === "lead" && lines.some((l) => l.group === "lead") ? "lead" : undefined;
}

/** Order of sections on the printed roster: agents, then supervisors, then leads. */
export const GROUP_ORDER: Record<string, number> = { "": 0, supervisor: 1, lead: 2 };

/**
 * Supervisors on an airline's lines: the ones put on them, or, when the airline has supervisor lines and
 * nobody yet, the first supervisor at that terminal who isn't already on another airline's lines.
 */
export function lineSupervisors(airline: Airline, people: Person[], airlines: Airline[]): Person[] {
  const lines = airline.lines ?? [];
  if (!lines.some((l) => l.group === "supervisor")) return [];
  const sups = people.filter((p) => p.role === "supervisor" && p.active !== false);
  const named = sups.filter((p) => airline.lineAssign?.[p.id]);
  if (named.length) return named;
  const taken = new Set(airlines.filter((a) => a.code !== airline.code).flatMap((a) => Object.keys(a.lineAssign ?? {})));
  const first = sups.filter((p) => p.homeTerminal === airline.terminal && !taken.has(p.id)).sort((a, b) => a.staffNo.localeCompare(b.staffNo))[0];
  return first ? [first] : [];
}

/** Who an airline's line roster covers: its agents and leads, plus its supervisors on lines. */
export function lineMembers(airline: Airline, people: Person[], airlines: Airline[]): Person[] {
  const team = people.filter((p) => p.active !== false && (p.role === "agent" || p.role === "lead") && p.coreAirline === airline.code);
  return [...team, ...lineSupervisors(airline, people, airlines)];
}

/** The version of a line that applies in the week starting `ws`. */
export function lineAt(lines: RosterLine[], label: string, ws: string, group?: LineGroup): RosterLine | undefined {
  return lines.find((l) => l.label === label && (l.group ?? undefined) === group && (!l.from || l.from <= ws) && (!l.to || ws <= l.to));
}

/** Distinct line labels in roster order, for one group of lines. */
export function lineLabels(lines: RosterLine[], group?: LineGroup): string[] {
  return [...new Set(lines.filter((l) => (l.group ?? undefined) === group).map((l) => l.label))].sort();
}

/**
 * Standing line per person: what the airline has on record, otherwise leads first, then agents by
 * staff number, dealt across the lines in order.
 */
export function standingLines(airline: Airline, members: Person[]): Map<string, string> {
  const lines = airline.lines ?? [];
  const out = new Map<string, string>();
  if (!lines.length) return out;
  const sorted = [...members].sort((a, b) => Number(b.role === "lead") - Number(a.role === "lead") || a.staffNo.localeCompare(b.staffNo));
  const dealt = new Map<string, number>();
  for (const p of sorted) {
    const g = lineGroup(lines, p);
    const labels = lineLabels(lines, g);
    if (!labels.length) continue;
    const set = airline.lineAssign?.[p.id];
    const i = dealt.get(g ?? "") ?? 0;
    out.set(p.id, set && labels.includes(set) ? set : labels[i % labels.length]);
    if (!(set && labels.includes(set))) dealt.set(g ?? "", i + 1);
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
      const line = label ? lineAt(lines, label, ws, lineGroup(lines, p)) : undefined;
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
    const k = `${l.group ?? ""}#${keyOf(l.days.map((t) => (t ? normaliseSpan(t) : null)))}`;
    if (!named.has(k)) named.set(k, l.label);
  }
  const standing = standingLines(airline, members);
  // Each group (agents, leads) is lettered from A, like the separate blocks on the paper roster
  const used = new Map<string, Set<string>>();
  for (const l of lines) used.set(l.group ?? "", (used.get(l.group ?? "") ?? new Set()).add(l.label));
  const fresh = (g: string) => {
    const set = used.get(g) ?? new Set<string>();
    let n = 0;
    while (set.has(String.fromCharCode(65 + n))) n++;
    const l = String.fromCharCode(65 + n);
    used.set(g, set.add(l));
    return l;
  };
  const labelFor = (p: Person, ws: string, days: (string | null)[]) => {
    const g = lines.length ? lineGroup(lines, p) ?? "" : p.role === "agent" ? "" : p.role;
    const k = `${g}#${keyOf(days)}`;
    const own = lines.length ? lineFor(airline, standing, p.id, ws) : undefined;
    const ownLine = own ? lineAt(lines, own, ws, lineGroup(lines, p)) : undefined;
    if (ownLine && `${g}#${keyOf(ownLine.days.map((t) => (t ? normaliseSpan(t) : null)))}` === k) return own!;
    if (!named.has(k)) named.set(k, fresh(g));
    return named.get(k)!;
  };

  const sorted = [...members].sort((a, b) => a.staffNo.localeCompare(b.staffNo));
  const blocks = new Map<string, SheetBlock>();
  for (const p of sorted) {
    let seg: { weeks: string[]; days: (string | null)[]; labels: string[]; last: (string | null)[] } | null = null;
    const flush = () => {
      if (!seg) return;
      const k = `${GROUP_ORDER[lines.length ? lineGroup(lines, p) ?? "" : p.role === "agent" ? "" : p.role]}|${seg.weeks.join(",")}`;
      const b = blocks.get(k) ?? { weekStarts: seg.weeks, rows: [] };
      b.rows.push({ person: p, label: seg.labels[0], days: seg.days, weeks: seg.labels });
      blocks.set(k, b);
    };
    for (const ws of weekStarts) {
      const days = pattern(p.id, ws);
      const label = labelFor(p, ws, days);
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
  // Sections in paper order (agents, supervisors, leads); within one, blocks by their first line, then earliest weeks first
  return [...blocks.entries()]
    .map(([k, b]) => ({ k, b: { ...b, rows: b.rows.sort((x, y) => x.label.localeCompare(y.label) || x.person.staffNo.localeCompare(y.person.staffNo)) } }))
    .sort((x, y) => x.k.split("|")[0].localeCompare(y.k.split("|")[0]) || x.b.rows[0].label.localeCompare(y.b.rows[0].label) || x.b.weekStarts[0].localeCompare(y.b.weekStarts[0]))
    .map(({ b }) => b);
}
