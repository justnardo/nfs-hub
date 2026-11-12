/**
 * Runs the enabled rules over a date range and returns plain-English findings.
 * Person rules look back one week for seams (rest, late runs, consecutive days).
 */
import { addDays, dayOfWeek, formatDate, rangeDays, weekStart, type Person, type ShiftCode } from "@nfs/db";
import { resolveRules, type RuleId, type RuleSettings, type Severity } from "./config";
import { CoverageContext, type EngineInput } from "./coverage";
import { eligibleFor } from "./eligibility";
import { PAID_HOURS, SHIFT_LABEL, endMin, isWork, startMin } from "./shifts";

export interface Violation {
  ruleId: RuleId;
  severity: Severity;
  personId?: string;
  airline?: string;
  date: string;
  message: string;
}

export interface RosterEdit {
  personId: string;
  date: string;
  shift: ShiftCode;
  at: string; // ISO time the edit was made
}

export interface CheckOptions {
  from: string;
  days: number;
  personIds?: string[];
  airlines?: string[];
  rules?: RuleSettings;
  edits?: RosterEdit[];
  /** Skip airline coverage rules (person-only check, e.g. when simulating a single change). */
  personOnly?: boolean;
  now?: Date;
}

const rostered = (p: Person) => p.role === "agent" || p.role === "lead" || p.role === "supervisor";

export function checkPerson(ctx: CoverageContext, p: Person, from: string, days: number, rules: RuleSettings): Violation[] {
  const out: Violation[] = [];
  const to = addDays(from, days - 1);
  const look = rangeDays(addDays(from, -7), days + 7);
  const codes = look.map((d) => ctx.shift(p.id, d));
  const name = `${p.firstName} ${p.lastName}`;
  const push = (ruleId: RuleId, date: string, message: string) => {
    const r = rules[ruleId];
    if (!r.enabled || date < from || date > to) return;
    out.push({ ruleId, severity: r.severity, personId: p.id, date, message: `${name}: ${message}` });
  };

  const trainingFlagged = new Set<string>();
  let lateRun = 0;
  let dayRun = 0;
  let lastWork: { i: number; s: "E" | "M" | "L" } | null = null;
  for (let i = 0; i < look.length; i++) {
    const s = codes[i];
    const date = look[i];
    if (isWork(s)) {
      if (lastWork && lastWork.i === i - 1) {
        const rest = (startMin(s) + 1440 - endMin(lastWork.s)) / 60;
        if (rest < rules["rest-min"].params.hours) push("rest-min", date, `only ${rest.toFixed(1)}h rest after ${SHIFT_LABEL[lastWork.s].toLowerCase()} shift on ${formatDate(look[i - 1])} (minimum ${rules["rest-min"].params.hours}h)`);
        if (startMin(s) < startMin(lastWork.s)) push("forward-rotation", date, `${SHIFT_LABEL[s].toLowerCase()} shift straight after a ${SHIFT_LABEL[lastWork.s].toLowerCase()} shift — rotation must run forward`);
      }
      dayRun++;
      lateRun = s === "L" ? lateRun + 1 : 0;
      if (dayRun === rules["consecutive-days-max"].params.max + 1) push("consecutive-days-max", date, `${dayRun} working days in a row (maximum ${rules["consecutive-days-max"].params.max})`);
      if (lateRun === rules["consecutive-lates-max"].params.max + 1) push("consecutive-lates-max", date, `${lateRun} late shifts in a row (maximum ${rules["consecutive-lates-max"].params.max})`);
      lastWork = { i, s };
      if (p.coreAirline && p.role === "agent") {
        const a = ctx.airlineBy.get(p.coreAirline);
        const moved = ctx.input.reassignments.some((r) => r.personId === p.id && r.date === date);
        if (a && !moved) {
          const e = eligibleFor(p, a, date);
          const wk = weekStart(date);
          if (!e.ok && !trainingFlagged.has(wk) && date >= from) {
            trainingFlagged.add(wk);
            push("training-current", date, `rostered on ${a.code} in week of ${formatDate(wk)} but ${e.reason.toLowerCase()} — does not count toward SLA`);
          }
        }
      }
    } else {
      dayRun = 0;
      lateRun = 0;
      if (s !== undefined) lastWork = null;
    }
  }

  // Sun–Sat week rules for complete weeks inside the range
  for (let ws = weekStart(from); ws <= to; ws = addDays(ws, 7)) {
    const week = rangeDays(ws, 7).map((d) => ctx.shift(p.id, d));
    if (week.some((s) => s === undefined)) continue;
    if (week.every((s) => s === "V")) continue;
    const hours = week.filter(isWork).length * PAID_HOURS;
    if (hours > rules["weekly-hours-max"].params.hours) push("weekly-hours-max", ws, `${hours}h rostered in week of ${formatDate(ws)} (standard ${rules["weekly-hours-max"].params.hours}h) — overtime`);
    const hasLeave = week.includes("V");
    const offs = week.filter((s) => s === "O").length;
    const needOffs = rules["days-off-count"].params.count;
    if (!hasLeave && offs < needOffs) push("days-off-count", ws, `${offs} day${offs === 1 ? "" : "s"} off in week of ${formatDate(ws)} (needs ${needOffs})`);
    if (!hasLeave && offs >= 2) {
      const off = week.map((s) => s === "O");
      const circular = rules["days-off-consecutive"].params.satSunPairs >= 1;
      if (!offTogether(off, circular)) push("days-off-consecutive", ws, `days off split in week of ${formatDate(ws)} — must be together`);
    }
  }

  // Nobody fixed: same 7-day pattern as previous week
  for (let ws = weekStart(from); ws <= to; ws = addDays(ws, 7)) {
    const cur = rangeDays(ws, 7).map((d) => ctx.shift(p.id, d) ?? "?").join("");
    const prev = rangeDays(addDays(ws, -7), 7).map((d) => ctx.shift(p.id, d) ?? "?").join("");
    if (!cur.includes("?") && !prev.includes("?") && !cur.includes("V") && cur === prev) push("same-pattern-repeat", ws, `same weekly pattern as the week before`);
  }
  return out;
}

/** Off days form one run; with `circular`, Saturday followed by Sunday counts as together. */
export function offTogether(off: boolean[], circular: boolean): boolean {
  if (off.every(Boolean) || !off.some(Boolean)) return true;
  if (circular) {
    let runs = 0;
    for (let d = 0; d < 7; d++) if (off[d] && !off[(d + 6) % 7]) runs++;
    return runs <= 1;
  }
  const first = off.indexOf(true);
  const last = off.lastIndexOf(true);
  for (let d = first; d <= last; d++) if (!off[d]) return false;
  return true;
}

export function check(input: EngineInput, opts: CheckOptions, ctx = new CoverageContext(input)): Violation[] {
  const rules = opts.rules ?? resolveRules();
  const out: Violation[] = [];
  const people = input.people.filter((p) => rostered(p) && p.active !== false && (!opts.personIds || opts.personIds.includes(p.id)));
  for (const p of people) out.push(...checkPerson(ctx, p, opts.from, opts.days, rules));

  // Weekend fairness: over 4+ weeks
  const wf = rules["weekend-off-fairness"];
  if (wf.enabled && opts.days >= 28) {
    for (const p of people) {
      if (p.role === "supervisor") continue;
      const dates = rangeDays(opts.from, opts.days);
      const weekendOffs = dates.filter((d) => [0, 6].includes(dayOfWeek(d)) && ctx.shift(p.id, d) === "O").length;
      const onLeave = dates.some((d) => ctx.shift(p.id, d) === "V");
      if (!onLeave && weekendOffs < wf.params.min) out.push({ ruleId: "weekend-off-fairness", severity: wf.severity, personId: p.id, date: opts.from, message: `${p.firstName} ${p.lastName}: ${weekendOffs} weekend days off in four weeks (minimum ${wf.params.min})` });
    }
  }

  if (!opts.personOnly) {
    const dates = rangeDays(opts.from, opts.days);
    for (const a of input.airlines) {
      if (opts.airlines && !opts.airlines.includes(a.code)) continue;
      for (const d of dates) {
        const dc = ctx.day(a.code, d);
        for (const g of dc.gaps) {
          const r = g.kind === "agents" ? rules["sla-coverage"] : rules["lead-on-duty"];
          if (!r.enabled) continue;
          out.push({
            ruleId: g.kind === "agents" ? "sla-coverage" : "lead-on-duty",
            severity: r.severity,
            airline: a.code,
            date: d,
            message: g.kind === "agents" ? `${a.code} short ${g.short} agent${g.short > 1 ? "s" : ""} ${g.from}–${g.to} on ${formatDate(d)}` : `${a.code} has no lead on duty ${g.from}–${g.to} on ${formatDate(d)}`,
          });
        }
      }
    }
    const co = rules["cover-override"];
    if (co.enabled) {
      for (const r of input.reassignments) {
        if (!r.overrideReason || !dates.includes(r.date)) continue;
        const p = ctx.peopleBy.get(r.personId);
        out.push({ ruleId: "cover-override", severity: co.severity, personId: r.personId, airline: r.toAirline, date: r.date, message: `${p ? `${p.firstName} ${p.lastName}` : "Agent"} moved ${r.fromAirline} → ${r.toAirline} below ${r.fromAirline} SLA — override: ${r.overrideReason}` });
      }
    }
  }

  const cn = rules["change-notice"];
  if (cn.enabled && opts.edits?.length) {
    const end = addDays(opts.from, opts.days - 1);
    for (const e of opts.edits) {
      if (e.date < opts.from || e.date > end) continue;
      const s = ctx.shift(e.personId, e.date);
      const shiftStart = new Date(`${e.date}T${isWork(s) ? String(Math.floor(startMin(s) / 60)).padStart(2, "0") + ":" + String(startMin(s) % 60).padStart(2, "0") : "00:00"}:00-05:00`);
      const hoursBefore = (shiftStart.getTime() - new Date(e.at).getTime()) / 3600000;
      if (hoursBefore < cn.params.hours) {
        const p = ctx.peopleBy.get(e.personId);
        out.push({ ruleId: "change-notice", severity: cn.severity, personId: e.personId, date: e.date, message: `${p ? `${p.firstName} ${p.lastName}` : "Staff"}: changed ${Math.max(0, Math.round(hoursBefore))}h before the shift (notice ${cn.params.hours}h)` });
      }
    }
  }
  return out;
}

export function countBySeverity(v: Violation[]) {
  return { hard: v.filter((x) => x.severity === "hard").length, soft: v.filter((x) => x.severity === "soft").length, warning: v.filter((x) => x.severity === "warning").length };
}
