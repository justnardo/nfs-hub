/**
 * Roster periods: a 1–4 week roster the engine builds for one team or all teams.
 * Drafts are reviewed and edited, then published. Published periods become the live roster,
 * can be printed to PDF and shared with agents through a read-only link.
 */
import { addDays, rangeDays, shiftDemand, type Airline, type Person, type Role, type RosterEntry, type ShiftCode } from "@nfs/db";
import {
  CoverageContext, cellFromDay, check, eligibleFor, fairnessHistory, optimiseWeek, weekPatterns, type EngineInput, type RuleSettings,
} from "@nfs/rules";
import type { PdfSection } from "./pdf";

export type TeamKey = string; // airline code | POOL | SUP-US | SUP-INTL

export interface Actor {
  id: string;
  name: string;
  role: Role;
}

export interface ShareLink {
  token: string;
  createdAt: string;
  createdBy: string;
  expires: string; // YYYY-MM-DD, last day the link works
}

export interface RosterPeriod {
  id: string;
  teams: TeamKey[];
  start: string; // Sunday (weeks run Sun–Sat)
  weeks: number; // 1–4
  status: "draft" | "published";
  /** personId → one shift code per day of the period */
  grid: Record<string, string>;
  createdBy: Actor;
  createdAt: string;
  publishedBy?: Actor;
  publishedAt?: string;
  share?: ShareLink | null;
  note?: string;
}

export type AuditAction =
  | "shift.change"
  | "shift.revert"
  | "roster.optimise"
  | "roster.fix"
  | "cover.move"
  | "cover.cancel"
  | "team.assign"
  | "period.create"
  | "period.edit"
  | "period.publish"
  | "period.delete"
  | "share.create"
  | "share.revoke"
  | "airline.change"
  | "schedule.change"
  | "rules.change"
  | "undo";

export interface CellChange {
  personId: string;
  date: string;
  from: ShiftCode | null;
  to: ShiftCode | null;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: Actor;
  action: AuditAction;
  summary: string;
  teams?: TeamKey[];
  personId?: string;
  date?: string;
  cells?: CellChange[];
  /** Values before the change, for undo (person fields, reassignment id). */
  prev?: Record<string, unknown>;
  ref?: string;
  reason?: string | null;
  undone?: { by: string; at: string };
  undoOf?: string;
}

export const ACTION_LABEL: Record<AuditAction, string> = {
  "shift.change": "Shift changed",
  "shift.revert": "Back to plan",
  "roster.optimise": "Week optimised",
  "roster.fix": "Gap fixed",
  "cover.move": "Agent moved",
  "cover.cancel": "Move cancelled",
  "team.assign": "Team / role changed",
  "period.create": "Roster created",
  "period.edit": "Draft edited",
  "period.publish": "Roster published",
  "period.delete": "Draft deleted",
  "share.create": "Share link created",
  "share.revoke": "Share link revoked",
  "airline.change": "Airline / SLA changed",
  "schedule.change": "Schedule changed",
  "rules.change": "Rule settings changed",
  undo: "Undo",
};

export const UNDOABLE: AuditAction[] = ["shift.change", "shift.revert", "roster.optimise", "roster.fix", "cover.move", "team.assign"];

/* ---------------- Teams ---------------- */

export function teamOf(p: Person): TeamKey | null {
  if (p.role === "supervisor") return p.homeTerminal === "US" ? "SUP-US" : "SUP-INTL";
  if (p.role === "agent" || p.role === "lead") return p.coreAirline ?? "POOL";
  return null;
}

export function teamLabel(team: TeamKey, airlines: Airline[]): string {
  if (team === "POOL") return "Float pool";
  if (team === "SUP-US") return "Supervisors · US";
  if (team === "SUP-INTL") return "Supervisors · International";
  return airlines.find((a) => a.code === team)?.name ?? team;
}

export function allTeams(airlines: Airline[]): TeamKey[] {
  return [...airlines.map((a) => a.code), "POOL", "SUP-US", "SUP-INTL"];
}

export function teamMembers(people: Person[], team: TeamKey): Person[] {
  const list = people.filter((p) => p.active !== false).filter((p) => teamOf(p) === team);
  return list.sort((a, b) => (a.role === b.role ? a.lastName.localeCompare(b.lastName) : a.role === "lead" ? -1 : 1));
}

/* ---------------- Period helpers ---------------- */

export const periodDays = (p: Pick<RosterPeriod, "start" | "weeks">) => rangeDays(p.start, p.weeks * 7);
export const periodEnd = (p: Pick<RosterPeriod, "start" | "weeks">) => addDays(p.start, p.weeks * 7 - 1);

export function periodShift(p: RosterPeriod, personId: string, date: string): ShiftCode | undefined {
  const row = p.grid[personId];
  if (!row) return undefined;
  const i = Math.round((Date.parse(date) - Date.parse(p.start)) / 86400000);
  if (i < 0 || i >= row.length) return undefined;
  return row[i] as ShiftCode;
}

/** Engine input with a period's cells applied over the live roster. */
export function withPeriod(input: EngineInput, p: RosterPeriod): EngineInput {
  const days = periodDays(p);
  const daySet = new Set(days);
  const ids = new Set(Object.keys(p.grid));
  const roster: RosterEntry[] = input.roster.filter((r) => !(ids.has(r.personId) && daySet.has(r.date)));
  for (const [pid, row] of Object.entries(p.grid)) days.forEach((d, i) => roster.push({ personId: pid, date: d, shift: row[i] as ShiftCode }));
  return { ...input, roster };
}

export function newShareToken(): string {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
}

/* ---------------- Build ---------------- */

export interface BuildOptions {
  input: EngineInput; // live roster
  teams: TeamKey[];
  start: string;
  weeks: number;
  rules: RuleSettings;
  today: string;
  seed: string;
}

/**
 * Build a period week by week with the engine. Each week chains from the one before it
 * (rest between Sunday late and Monday early, rotation, fairness over the last three weeks).
 * Past days and booked leave stay as they are.
 */
export function buildPeriod(o: BuildOptions): Record<string, string> {
  const ctx = new CoverageContext(o.input);
  const planned = new Map<string, ShiftCode>();
  const shiftAt = (id: string, d: string) => planned.get(`${id}|${d}`) ?? ctx.shift(id, d);
  const patterns = weekPatterns(o.rules);
  const flightsByDate = new Map<string, typeof o.input.flights>();
  for (const f of o.input.flights) flightsByDate.set(f.date, [...(flightsByDate.get(f.date) ?? []), f]);
  const airlines = new Map(o.input.airlines.map((a) => [a.code, a]));
  const grid: Record<string, string> = {};

  for (let w = 0; w < o.weeks; w++) {
    const ws = addDays(o.start, w * 7);
    const days = rangeDays(ws, 7);
    const prevDays = rangeDays(addDays(ws, -7), 7);
    const histDays = rangeDays(addDays(ws, -21), 21);
    for (const team of o.teams) {
      const members = teamMembers(o.input.people, team);
      const airline = airlines.get(team);
      const cache = new Map<string, number>();
      const cached = (k: string, f: () => number) => {
        if (!cache.has(k)) cache.set(k, f());
        return cache.get(k)!;
      };
      const groups: { people: Person[]; demand: (d: string, s: "E" | "L") => number }[] = airline
        ? [
            { people: members.filter((m) => m.role === "agent"), demand: (d, s) => cached(`a${d}${s}`, () => shiftDemand(flightsByDate.get(d) ?? [], airline, s).agents) },
            { people: members.filter((m) => m.role === "lead"), demand: (d, s) => cached(`l${d}${s}`, () => Math.min(1, shiftDemand(flightsByDate.get(d) ?? [], airline, s).leads)) },
          ]
        : [{ people: members, demand: () => 1 }];
      for (const g of groups) {
        if (!g.people.length) continue;
        const plan = optimiseWeek(
          {
            members: g.people,
            weekStart: ws,
            demand: g.demand,
            prevWeek: (id) => prevDays.map((d) => shiftAt(id, d)),
            locked: (id, i) => {
              const d = days[i];
              const cur = ctx.shift(id, d);
              if (d < o.today) return cur;
              if (cur === "V") return "V";
              return undefined;
            },
            history: (id) => fairnessHistory(id, histDays, shiftAt),
            counts: (id) => (airline ? eligibleFor(o.input.people.find((p) => p.id === id)!, airline, ws).ok : true),
            rules: o.rules,
            seed: `${o.seed}-${team}-${ws}`,
            restarts: 3,
          },
          patterns,
        );
        for (const p of g.people) {
          plan.patterns.get(p.id)!.forEach((s, i) => planned.set(`${p.id}|${days[i]}`, s));
        }
      }
    }
  }
  const all = rangeDays(o.start, o.weeks * 7);
  for (const team of o.teams) {
    for (const m of teamMembers(o.input.people, team)) grid[m.id] = all.map((d) => planned.get(`${m.id}|${d}`) ?? "O").join("");
  }
  return grid;
}

export interface PeriodHealth {
  gaps: number;
  hard: number;
  soft: number;
  weeks: { start: string; gaps: number; hard: number; soft: number }[];
}

/** Coverage gaps and rule findings for a period (or the live roster over the same dates). */
export function periodHealth(input: EngineInput, p: Pick<RosterPeriod, "start" | "weeks" | "teams">, rules: RuleSettings, today: string): PeriodHealth {
  const ctx = new CoverageContext(input);
  const weeks: PeriodHealth["weeks"] = [];
  for (let w = 0; w < p.weeks; w++) {
    const ws = addDays(p.start, w * 7);
    const ids = p.teams.flatMap((t) => teamMembers(input.people, t).map((m) => m.id));
    const codes = p.teams.filter((t) => input.airlines.some((a) => a.code === t));
    const v = check(input, { from: ws, days: 7, personIds: ids, airlines: codes, rules }, ctx);
    const gaps = rangeDays(ws, 7)
      .filter((d) => d >= today)
      .reduce((s, d) => s + codes.reduce((t, c) => t + ctx.day(c, d).gaps.filter((g) => g.kind === "agents").length, 0), 0);
    weeks.push({ start: ws, gaps, hard: v.filter((x) => x.severity === "hard").length, soft: v.filter((x) => x.severity !== "hard").length });
  }
  return { weeks, gaps: weeks.reduce((s, w) => s + w.gaps, 0), hard: weeks.reduce((s, w) => s + w.hard, 0), soft: weeks.reduce((s, w) => s + w.soft, 0) };
}

/* ---------------- PDF / share sections ---------------- */

const ROLE_WORD: Record<string, string> = { agent: "Agent", lead: "Lead", supervisor: "Supervisor" };

/** Table sections (one per team per week) from an engine input — live roster or a period applied. */
export function rosterSections(input: EngineInput, teams: TeamKey[], start: string, weeks: number, highlightId?: string): PdfSection[] {
  const ctx = new CoverageContext(input);
  return teams.map((team) => {
    const members = teamMembers(input.people, team);
    const airline = input.airlines.find((a) => a.code === team);
    return {
      team: teamLabel(team, input.airlines),
      weeks: Array.from({ length: weeks }, (_, w) => {
        const ws = addDays(start, w * 7);
        const days = rangeDays(ws, 7);
        return {
          start: ws,
          days,
          rows: members.map((m) => ({
            staffNo: m.staffNo,
            name: `${m.firstName} ${m.lastName}`,
            role: ROLE_WORD[m.role] ?? m.role,
            shifts: days.map((d) => ctx.shift(m.id, d)),
            highlight: m.id === highlightId,
          })),
          coverage: airline
            ? (["E", "L"] as const).map((s) => {
                const cells = days.map((d) => cellFromDay(ctx.day(airline.code, d), s, ctx));
                return {
                  label: `${s === "E" ? "Early" : "Late"} on duty / SLA need`,
                  values: cells.map((c) => (c.level === "none" ? "·" : `${c.assigned}/${c.required}`)),
                  short: cells.map((c) => c.level === "red"),
                };
              })
            : undefined,
        };
      }),
    };
  });
}
