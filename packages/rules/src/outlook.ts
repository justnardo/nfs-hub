/**
 * Can a team's gaps be closed by rearranging its own shifts, or does it need people it does not have?
 * Like Rampline's staffing outlook, "short" is a proof: supply is counted generously (everyone
 * current and not on leave, any day), demand as the least the SLA can mean.
 */
import { formatDate, rangeDays } from "@nfs/db";
import type { RuleSettings } from "./config";
import { CoverageContext, cellFromDay, type EngineInput } from "./coverage";
import { eligibleFor } from "./eligibility";

export interface OutlookDay {
  date: string;
  needPeople: number;
  available: number;
  short: number;
  gaps: number;
}

export interface Outlook {
  airline: string;
  weekStart: string;
  days: OutlookDay[];
  shiftsNeeded: number;
  capacity: number;
  extraPeople: number;
  verdict: "ok" | "rearrange" | "short";
  summary: string;
}

export function staffingOutlook(input: EngineInput, airlineCode: string, weekStart: string, rules: RuleSettings, ctx = new CoverageContext(input)): Outlook {
  const a = ctx.airlineBy.get(airlineCode)!;
  const days = rangeDays(weekStart, 7);
  const core = (ctx.coreBy.get(airlineCode) ?? []).filter((p) => p.role === "agent");
  const workDays = 7 - rules["days-off-count"].params.count;
  const out: OutlookDay[] = [];
  let shiftsNeeded = 0;
  for (const d of days) {
    const dc = ctx.day(airlineCode, d);
    const e = cellFromDay(dc, "E", ctx);
    const l = cellFromDay(dc, "L", ctx);
    const needPeople = e.required + l.required;
    shiftsNeeded += needPeople;
    const available = core.filter((p) => ctx.shift(p.id, d) !== "V" && eligibleFor(p, a, d).ok).length;
    out.push({ date: d, needPeople, available, short: Math.max(0, needPeople - available), gaps: dc.gaps.filter((g) => g.kind === "agents").length });
  }
  const capacity = core.reduce((s, p) => {
    const leave = days.filter((d) => ctx.shift(p.id, d) === "V").length;
    const current = eligibleFor(p, a, days[0]).ok ? 1 : 0;
    return s + current * Math.max(0, workDays - leave);
  }, 0);
  const dayShort = out.reduce((m, d) => Math.max(m, d.short), 0);
  const weekShort = Math.max(0, shiftsNeeded - capacity);
  const extraPeople = Math.max(dayShort, Math.ceil(weekShort / workDays));
  const anyGaps = out.some((d) => d.gaps > 0);
  const verdict: Outlook["verdict"] = extraPeople > 0 ? "short" : anyGaps ? "rearrange" : "ok";
  const worst = out.reduce((w, d) => (d.short > w.short ? d : w), out[0]);
  const summary =
    verdict === "short"
      ? `${a.name} needs ${extraPeople} more current agent${extraPeople > 1 ? "s" : ""} this week: ${shiftsNeeded} shifts to cover with capacity for ${capacity}${worst.short ? `; ${formatDate(worst.date)} needs ${worst.needPeople} people but only ${worst.available} are available` : ""}. Rearranging shifts cannot close this.`
      : verdict === "rearrange"
        ? `${a.name} has enough people this week (${capacity} shifts available for ${shiftsNeeded} needed). The gaps can be closed by moving shifts — run Optimise or use the suggested fixes.`
        : `${a.name} is covered all week.`;
  return { airline: airlineCode, weekStart, days: out, shiftsNeeded, capacity, extraPeople, verdict, summary };
}
