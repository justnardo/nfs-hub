import { addDays, rangeDays, type Airline, type DelayCause, type DiscrepancyType, type FeedbackItem, type Flight, type GateLog, type Person, type Reassignment } from "@nfs/db";
import { coverageGrid, type EngineInput } from "@nfs/rules";
import type { Absence } from "./absence";
import { boardingMinutes, isNfsCause, slaMet, summarise, type Summary, operated } from "./metrics";

export interface ReportInput {
  from: string;
  to: string;
  terminal: "" | "US" | "INTL";
  airline: string;
  logs: GateLog[];
  flights: Flight[];
  airlines: Airline[];
  people: Person[];
  absences: Absence[];
  reassignments: Reassignment[];
  feedback: FeedbackItem[];
  engine: EngineInput;
}

export interface AirlineRow { code: string; name: string; flights: number; d0: number; d15: number; sla: number; boarding: number; issuesPer100: number; pax: number; nfsDelays: number; otherDelays: number }
export interface LeadRow { person: Person; flights: number; d0: number; sla: number; nfs: number; other: number }
export interface DayPoint { date: string; flights: number; d0: number | null; d15: number | null; pax: number; wheelchairs: number }

export interface Report {
  from: string;
  to: string;
  days: number;
  scope: string;
  summary: Summary;
  previous: Summary;
  pax: number;
  wheelchairs: number;
  avgDelayMin: number;
  delayMinutesNfs: number;
  charters: number;
  trend: DayPoint[];
  causes: { cause: DelayCause; n: number; nfs: boolean; minutes: number }[];
  discrepancies: { type: DiscrepancyType; n: number }[];
  airlines: AirlineRow[];
  leads: LeadRow[];
  feedback: { praise: number; complaints: number; open: number };
  staffing: { shiftsAtSla: number; shifts: number; red: number; sickDays: number; absenceDays: number; callOuts: number; covers: number; overrides: number; byType: { type: string; days: number }[] };
  highlights: string[];
}

const round = (x: number) => Math.round(x);

/** Everything the analytics page and the board report show, computed once for a period and scope. */
export function buildReport(r: ReportInput): Report {
  const days = rangeDays(r.from, Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86400000) + 1);
  const span = days.length;
  const airlineBy = new Map(r.airlines.map((a) => [a.code, a]));
  const inScope = (code: string) => {
    const a = airlineBy.get(code);
    return !!a && (!r.terminal || a.terminal === r.terminal) && (!r.airline || a.code === r.airline);
  };
  const filed = (from: string, to: string) => r.logs.filter((l) => l.status === "filed" && operated(l) && l.date >= from && l.date <= to && inScope(l.airline));
  const logs = filed(r.from, r.to);
  const prevLogs = filed(addDays(r.from, -span), addDays(r.from, -1));
  const summary = summarise(logs, airlineBy);
  const previous = summarise(prevLogs, airlineBy);
  const flightBy = new Map(r.flights.map((f) => [f.id, f]));

  const pax = logs.reduce((s, l) => s + (l.paxBoarded ?? 0), 0);
  const wheelchairs = logs.reduce((s, l) => s + (l.wheelchairs ?? 0), 0);
  const delayed = logs.filter((l) => l.delayMinutes > 0);
  const avgDelayMin = delayed.length ? delayed.reduce((s, l) => s + l.delayMinutes, 0) / delayed.length : 0;
  const delayMinutesNfs = delayed.filter((l) => isNfsCause(l.delayCause)).reduce((s, l) => s + l.delayMinutes, 0);
  const charters = logs.filter((l) => flightBy.get(l.flightId)?.adhoc).length;

  const trend: DayPoint[] = days.map((d) => {
    const x = logs.filter((l) => l.date === d);
    const s = summarise(x, airlineBy);
    return { date: d, flights: x.length, d0: x.length ? round(s.d0) : null, d15: x.length ? round(s.d15) : null, pax: x.reduce((n, l) => n + (l.paxBoarded ?? 0), 0), wheelchairs: x.reduce((n, l) => n + (l.wheelchairs ?? 0), 0) };
  });

  const causeMap = new Map<DelayCause, { n: number; minutes: number }>();
  for (const l of delayed) if (l.delayCause) {
    const c = causeMap.get(l.delayCause) ?? { n: 0, minutes: 0 };
    causeMap.set(l.delayCause, { n: c.n + 1, minutes: c.minutes + l.delayMinutes });
  }
  const causes = [...causeMap].map(([cause, v]) => ({ cause, n: v.n, minutes: v.minutes, nfs: isNfsCause(cause) })).sort((a, b) => b.n - a.n);

  const discMap = new Map<DiscrepancyType, number>();
  for (const l of logs) for (const d of l.discrepancies) discMap.set(d.type, (discMap.get(d.type) ?? 0) + 1);
  const discrepancies = [...discMap].map(([type, n]) => ({ type, n })).sort((a, b) => b.n - a.n);

  const airlines: AirlineRow[] = r.airlines
    .filter((a) => inScope(a.code))
    .map((a) => {
      const x = logs.filter((l) => l.airline === a.code);
      const s = summarise(x, airlineBy);
      return { code: a.code, name: a.name, flights: x.length, d0: round(s.d0), d15: round(s.d15), sla: round(s.slaCompliance), boarding: round(s.avgBoarding), issuesPer100: round(s.discrepanciesPer100), pax: x.reduce((n, l) => n + (l.paxBoarded ?? 0), 0), nfsDelays: s.nfsDelays, otherDelays: s.otherDelays };
    })
    .filter((a) => a.flights > 0)
    .sort((a, b) => Number(!!airlineBy.get(a.code)?.charter) - Number(!!airlineBy.get(b.code)?.charter) || b.d0 - a.d0 || b.flights - a.flights);
  const scheduled = airlines.filter((a) => !airlineBy.get(a.code)?.charter && a.flights >= 3);

  const leads: LeadRow[] = r.people
    .filter((p) => p.role === "lead")
    .map((p) => {
      const mine = logs.filter((l) => l.leadId === p.id);
      const s = summarise(mine, airlineBy);
      return { person: p, flights: mine.length, d0: s.d0, sla: s.slaCompliance, nfs: s.nfsDelays, other: s.otherDelays };
    })
    .filter((x) => x.flights > 0)
    .sort((a, b) => b.d0 - a.d0 || b.flights - a.flights);

  // Staffing: coverage against SLA over the period, absences and covers
  const scopedEngine: EngineInput = { ...r.engine, airlines: r.engine.airlines.filter((a) => inScope(a.code) && !a.charter) };
  const cells = coverageGrid(scopedEngine, r.from, span).filter((c) => c.level !== "none");
  const scopedPeople = new Set(r.people.filter((p) => !p.coreAirline || inScope(p.coreAirline) || (!r.airline && !r.terminal)).map((p) => p.id));
  const absDays = (types?: string[]) => {
    let n = 0;
    for (const a of r.absences) {
      if (!scopedPeople.has(a.personId) || (types && !types.includes(a.type))) continue;
      for (const d of days) if (d >= a.from && d <= a.to) n++;
    }
    return n;
  };
  const byTypeMap = new Map<string, number>();
  for (const a of r.absences) {
    if (!scopedPeople.has(a.personId)) continue;
    const n = days.filter((d) => d >= a.from && d <= a.to).length;
    if (n) byTypeMap.set(a.type, (byTypeMap.get(a.type) ?? 0) + n);
  }
  const moves = r.reassignments.filter((m) => m.date >= r.from && m.date <= r.to && inScope(m.toAirline));
  const staffing = {
    shiftsAtSla: cells.filter((c) => c.level === "green").length,
    shifts: cells.length,
    red: cells.filter((c) => c.level === "red").length,
    sickDays: absDays(["sick", "noshow"]),
    absenceDays: absDays(),
    callOuts: r.absences.filter((a) => scopedPeople.has(a.personId) && (a.type === "sick" || a.type === "noshow") && a.from <= r.to && a.to >= r.from).length,
    covers: moves.length,
    overrides: moves.filter((m) => m.overrideReason).length,
    byType: [...byTypeMap].map(([type, d]) => ({ type, days: d })).sort((a, b) => b.days - a.days),
  };

  const fb = r.feedback.filter((f) => f.date >= r.from && f.date <= r.to && inScope(f.airline));
  const feedback = { praise: fb.filter((f) => f.kind === "praise").length, complaints: fb.filter((f) => f.kind === "complaint").length, open: fb.filter((f) => f.status === "open").length };

  // Plain-language highlights, most useful first
  const h: string[] = [];
  const d0Delta = round(summary.d0 - previous.d0);
  if (summary.flights) h.push(`On-time departures (D0) ${d0Delta === 0 || !previous.flights ? "were" : d0Delta > 0 ? "rose to" : "fell to"} ${round(summary.d0)}% across ${summary.flights} flights${previous.flights && d0Delta ? `, ${Math.abs(d0Delta)} points ${d0Delta > 0 ? "up on" : "down on"} the previous ${span} days` : ""}.`);
  const totalDelays = summary.nfsDelays + summary.otherDelays;
  if (totalDelays) h.push(`${summary.otherDelays} of ${totalDelays} delays (${round((summary.otherDelays / totalDelays) * 100)}%) were outside passenger services’ control${causes[0] ? `; the most common cause was ${causes[0].cause.toLowerCase()} (${causes[0].n})` : ""}.`);
  const best = scheduled[0];
  const worst = scheduled.length > 1 ? scheduled[scheduled.length - 1] : null;
  if (best && worst && best.code !== worst.code) h.push(`${best.name} led on-time performance at ${best.d0}%; ${worst.name} was lowest at ${worst.d0}%${worst.otherDelays > worst.nfsDelays ? ", mostly from causes outside NFS" : ""}.`);
  if (summary.flights) h.push(`The team met each airline’s SLA staffing on ${round(summary.slaCompliance)}% of flights; ${staffing.shifts ? `${round((staffing.shiftsAtSla / staffing.shifts) * 100)}% of operating shifts were fully covered` : "no shifts operated"}.`);
  if (staffing.callOuts || staffing.covers) h.push(`${staffing.callOuts} sick call-out${staffing.callOuts === 1 ? "" : "s"} and ${staffing.covers} cover${staffing.covers === 1 ? "" : "s"} placed between teams${staffing.overrides ? ` (${staffing.overrides} with a manager override)` : ""}.`);
  if (feedback.praise || feedback.complaints) h.push(`Station managers sent ${feedback.praise} compliment${feedback.praise === 1 ? "" : "s"} and ${feedback.complaints} complaint${feedback.complaints === 1 ? "" : "s"}${feedback.open ? `; ${feedback.open} still open` : ""}.`);
  if (pax) h.push(`${pax.toLocaleString("en-US")} passengers boarded${wheelchairs ? `, including ${wheelchairs} wheelchair assist${wheelchairs === 1 ? "" : "s"}` : ""}${charters ? `, and ${charters} charter flight${charters === 1 ? "" : "s"} handled` : ""}.`);

  const scope = [r.airline ? airlineBy.get(r.airline)?.name : null, r.terminal ? (r.terminal === "US" ? "US Departures Terminal" : "International Terminal") : null].filter(Boolean).join(" · ") || "All airlines · both terminals";
  return { from: r.from, to: r.to, days: span, scope, summary, previous, pax, wheelchairs, avgDelayMin, delayMinutesNfs, charters, trend, causes, discrepancies, airlines, leads, feedback, staffing, highlights: h };
}

export function reportCsv(rep: Report, logs: GateLog[], flights: Flight[], people: Map<string, Person>): string {
  const fl = new Map(flights.map((f) => [f.id, f]));
  const head = ["Date", "Flight", "Airline", "Destination", "STD", "Lead", "Door close", "Pushback", "Delay min", "Cause", "NFS cause", "Booked", "Checked in", "Boarded", "Wheelchairs", "Boarding min", "Discrepancies"];
  const rows = logs
    .filter((l) => l.status === "filed" && operated(l) && l.date >= rep.from && l.date <= rep.to)
    .map((l) => {
      const f = fl.get(l.flightId);
      const lead = people.get(l.leadId);
      return [l.date, f?.flightNo ?? "", l.airline, f?.destination ?? "", f?.std ?? "", lead ? `${lead.firstName} ${lead.lastName}` : "", l.events.door_close ?? "", l.events.pushback ?? "", l.delayMinutes, l.delayCause ?? "", isNfsCause(l.delayCause) ? "Y" : "", l.paxBooked ?? "", l.paxCheckedIn ?? "", l.paxBoarded ?? "", l.wheelchairs ?? "", boardingMinutes(l) ?? "", l.discrepancies.map((d) => d.type).join("; ")];
    });
  return [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export { slaMet };
