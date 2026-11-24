"use client";
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, BellRing, Check, Lightbulb, Luggage, Wrench } from "lucide-react";
import { Badge, Button, Dialog, DialogContent, cn } from "@nfs/ui";
import { addDays, formatDate, rangeDays, timingsFor, type Airline, type GateLog } from "@nfs/db";
import { deriveStatus } from "@nfs/flights";
import { CoverageContext, coverageGrid, eligibleFor, expiringSoon, type CoverageCell } from "@nfs/rules";
import { useEngineInput, useHub, personName } from "@/lib/store";
import { ABSENCE_TYPES } from "@/lib/absence";
import { isNfsCause, slaMet, teamShortfall } from "@/lib/metrics";
import { AirlineChip, FlightStatusBadge } from "./ops";

export type TodayDetailKind = "departures" | "ontime" | "sla" | "gaps" | "issues" | "training";

const TITLES: Record<TodayDetailKind, [string, string]> = {
  departures: ["Departures today", "Every departure, where it stands and who's leading it"],
  ontime: ["On-time performance", "Today's delays, their causes, and the pattern over the last 7 days"],
  sla: ["SLA team met", "Flights that went out short of the airline's agreed team, and where"],
  gaps: ["Coverage gaps", "Why each gap exists, how to fix it, and what's coming this week"],
  issues: ["Discrepancies", "What was logged at the gate today, and what keeps coming up"],
  training: ["Training due", "Expired training stops someone being rostered on that airline"],
};

const day = (d: string) => formatDate(d, { weekday: "short", day: "numeric" });

/* Small building blocks */
function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mt-5 first:mt-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}
function Bars({ rows, tone = "brand" }: { rows: { label: React.ReactNode; value: number; note?: string }[]; tone?: "brand" | "warn" | "bad" }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const fill = { brand: "bg-brand-500", warn: "bg-amber-500", bad: "bg-red-500" }[tone];
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs">
          <span className="truncate font-medium">{r.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-line"><span className={cn("block h-full rounded-full", fill)} style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="w-14 text-right font-semibold tabular">{r.note ?? r.value}</span>
        </div>
      ))}
    </div>
  );
}
function Insight({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-900">
      <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-brand-600" />
      <span>{children}</span>
    </p>
  );
}
function Trend({ days, values, suffix = "", good = "high" }: { days: string[]; values: (number | null)[]; suffix?: string; good?: "high" | "low" }) {
  const max = Math.max(1, ...values.map((v) => v ?? 0));
  return (
    <div className="grid grid-cols-7 items-end gap-1.5">
      {days.map((d, i) => {
        const v = values[i];
        const h = v === null ? 4 : Math.max(6, (v / max) * 64);
        const ok = v === null ? null : good === "high" ? v >= 85 : v <= 1;
        return (
          <div key={d} className="text-center">
            <p className="mb-1 text-[10px] font-semibold tabular text-muted">{v === null ? "–" : `${Math.round(v)}${suffix}`}</p>
            <div className={cn("mx-auto w-full max-w-8 rounded-t-md", v === null ? "bg-line" : ok ? "bg-brand-500" : "bg-amber-400")} style={{ height: h }} />
            <p className="mt-1 text-[10px] text-muted">{day(d)}</p>
          </div>
        );
      })}
    </div>
  );
}

/** One summary per Today tile. Opens as a sheet on phones. */
export function TodayDetail({ kind, onClose, onFix }: { kind: TodayDetailKind; onClose: () => void; onFix: (c: CoverageCell) => void }) {
  const hub = useHub();
  const [title, description] = TITLES[kind];
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl" title={title} description={description} footer={<div className="flex justify-end"><Button variant="outline" className="h-11 w-full sm:h-9 sm:w-auto" onClick={onClose}>Close</Button></div>}>
        {kind === "departures" ? <Departures /> : null}
        {kind === "ontime" ? <OnTime /> : null}
        {kind === "sla" ? <Sla /> : null}
        {kind === "gaps" ? <Gaps onFix={(c) => { onClose(); onFix(c); }} /> : null}
        {kind === "issues" ? <Issues /> : null}
        {kind === "training" ? <Training /> : null}
        <p className="mt-5 text-[11px] text-muted">As of {String(Math.floor(hub.nowMin / 60)).padStart(2, "0")}:{String(hub.nowMin % 60).padStart(2, "0")} · {formatDate(hub.today, { weekday: "long", day: "numeric", month: "long" })}</p>
      </DialogContent>
    </Dialog>
  );
}

function useWeek() {
  const hub = useHub();
  const days = rangeDays(addDays(hub.today, -6), 7);
  const filed = hub.gateLogs.filter((g) => g.status === "filed" && g.date >= days[0] && g.date <= hub.today);
  const airlines = new Map(hub.ds.airlines.map((a) => [a.code, a]));
  return { days, filed, airlines };
}
const flightOf = (hub: ReturnType<typeof useHub>, g: GateLog) => hub.ds.flights.find((f) => f.id === g.flightId);
function FlightRow({ g, right, sub }: { g: GateLog; right?: React.ReactNode; sub?: React.ReactNode }) {
  const hub = useHub();
  const f = flightOf(hub, g);
  const a = hub.ds.airlines.find((x) => x.code === g.airline);
  return (
    <Link href={g.status === "filed" ? `/records/${g.id}` : `/gate/${g.flightId}`} className="flex items-center gap-2.5 rounded-xl border border-line p-2.5 transition-colors hover:border-brand-400 hover:bg-brand-50">
      {a ? <AirlineChip airline={a} /> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{f?.flightNo ?? g.flightId} <span className="font-normal text-muted">· {f?.std ?? ""}{g.date !== hub.today ? ` · ${day(g.date)}` : ""}</span></span>
        {sub ? <span className="block truncate text-xs text-muted">{sub}</span> : null}
      </span>
      {right}
    </Link>
  );
}

/* ---------------- Departures ---------------- */
function Departures() {
  const hub = useHub();
  const rows = hub.ds.flights.filter((f) => f.date === hub.today && f.kind !== "arrival").map((f) => {
    const log = hub.logByFlight.get(f.id);
    return { f, log, st: deriveStatus(f, log, hub.today, hub.nowMin, timingsFor(hub.ds.airlines.find((a) => a.code === f.airline))).status };
  });
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.st, (counts.get(r.st) ?? 0) + 1);
  const next = rows.find((r) => r.st !== "Departed");
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {[...counts.entries()].map(([k, v]) => <Badge key={k} tone={k === "Departed" ? "ok" : "brand"}>{v} {k.toLowerCase()}</Badge>)}
      </div>
      {next ? <div className="mt-3"><Insight>Next out: <b>{next.f.flightNo}</b> at {next.f.std} from gate {next.f.gate}{next.log?.leadId ? `, led by ${personName(hub.people.get(next.log.leadId))}` : ", no lead set yet"}.</Insight></div> : null}
      <Section title="All departures">
        <div className="space-y-1.5">
          {rows.map(({ f, log, st }) => {
            const a = hub.ds.airlines.find((x) => x.code === f.airline);
            return (
              <Link key={f.id} href={log?.status === "filed" ? `/records/${log.id}` : `/gate/${f.id}`} className="flex items-center gap-2.5 rounded-xl border border-line p-2.5 transition-colors hover:border-brand-400 hover:bg-brand-50">
                {a ? <AirlineChip airline={a} /> : null}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{f.flightNo} <span className="font-normal text-muted">· {f.std} · gate {f.gate}</span></span>
                  <span className="block truncate text-xs text-muted">{log?.leadId ? `Lead ${personName(hub.people.get(log.leadId))}` : "No lead yet"}{log?.delayMinutes ? ` · +${log.delayMinutes} min` : ""}</span>
                </span>
                <FlightStatusBadge status={st} />
              </Link>
            );
          })}
        </div>
      </Section>
    </>
  );
}

/* ---------------- On time ---------------- */
function OnTime() {
  const hub = useHub();
  const { days, filed } = useWeek();
  const today = filed.filter((g) => g.date === hub.today);
  const late = today.filter((g) => g.delayMinutes > 0).sort((a, b) => b.delayMinutes - a.delayMinutes);
  const trend = days.map((d) => {
    const l = filed.filter((g) => g.date === d);
    return l.length ? (l.filter((g) => !g.delayMinutes).length / l.length) * 100 : null;
  });
  const delayed = filed.filter((g) => g.delayMinutes > 0);
  const causes = new Map<string, number>();
  for (const g of delayed) causes.set(g.delayCause ?? "Not given", (causes.get(g.delayCause ?? "Not given") ?? 0) + 1);
  const causeRows = [...causes.entries()].sort((a, b) => b[1] - a[1]);
  const nfs = delayed.filter((g) => isNfsCause(g.delayCause)).length;
  const byAirline = new Map<string, { n: number; ok: number }>();
  for (const g of filed) {
    const v = byAirline.get(g.airline) ?? { n: 0, ok: 0 };
    byAirline.set(g.airline, { n: v.n + 1, ok: v.ok + (g.delayMinutes ? 0 : 1) });
  }
  const worst = [...byAirline.entries()].filter(([, v]) => v.n >= 3).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n)[0];
  const airlineName = (c: string) => hub.ds.airlines.find((a) => a.code === c)?.name ?? c;
  return (
    <>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Big v={`${today.length ? Math.round(((today.length - late.length) / today.length) * 100) : 0}%`} l="on time today" />
        <Big v={String(late.length)} l={`delayed of ${today.length} filed`} tone={late.length ? "warn" : undefined} />
        <Big v={`${delayed.length ? Math.round((nfs / delayed.length) * 100) : 0}%`} l="of 7-day delays in NFS's control" />
      </div>
      <Section title="Delayed today">
        {late.length === 0 ? <p className="flex items-center gap-1.5 text-sm text-green-800"><Check className="size-4" /> Every filed flight left on time.</p> : null}
        <div className="space-y-1.5">
          {late.map((g) => <FlightRow key={g.id} g={g} sub={`${g.delayCause ?? "Cause not given"}${isNfsCause(g.delayCause) ? " · NFS" : " · outside NFS"}`} right={<Badge tone="warn">+{g.delayMinutes}m</Badge>} />)}
        </div>
      </Section>
      <Section title="On time, last 7 days"><Trend days={days} values={trend} suffix="%" /></Section>
      {causeRows.length ? <Section title="Why flights were late (7 days)"><Bars rows={causeRows.map(([k, v]) => ({ label: k, value: v }))} tone="warn" /></Section> : null}
      <Section title="Patterns">
        <div className="space-y-1.5">
          {causeRows[0] ? <Insight>Most common cause this week: <b>{causeRows[0][0]}</b> ({causeRows[0][1]} of {delayed.length} delays).</Insight> : null}
          {worst ? <Insight>Lowest on-time this week: <b>{airlineName(worst[0])}</b>, {Math.round((worst[1].ok / worst[1].n) * 100)}% of {worst[1].n} flights.</Insight> : null}
          {delayed.length ? <Insight>{nfs} of {delayed.length} delays were in NFS&apos;s control; the rest were airline, ATC, weather or late inbound aircraft.</Insight> : null}
        </div>
      </Section>
    </>
  );
}
function Big({ v, l, tone }: { v: string; l: string; tone?: "warn" | "bad" }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className={cn("font-display text-2xl font-semibold tabular", tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-red-700" : "text-fg")}>{v}</p>
      <p className="text-[11px] leading-tight text-muted">{l}</p>
    </div>
  );
}

/* ---------------- SLA ---------------- */
function Sla() {
  const hub = useHub();
  const { filed, airlines } = useWeek();
  const short = (g: GateLog) => !slaMet(g, airlines.get(g.airline)!);
  const today = filed.filter((g) => g.date === hub.today);
  const todayShort = today.filter(short);
  const pos = new Map<string, number>();
  for (const g of filed.filter(short)) for (const s of teamShortfall(g, airlines.get(g.airline)!)) {
    const k = s.split(" ")[0];
    pos.set(k, (pos.get(k) ?? 0) + 1);
  }
  const byAirline = [...hub.ds.airlines].map((a) => {
    const l = filed.filter((g) => g.airline === a.code);
    return { a, n: l.length, met: l.filter((g) => !short(g)).length };
  }).filter((x) => x.n);
  return (
    <>
      <div className="grid grid-cols-2 gap-2 text-center">
        <Big v={`${today.length - todayShort.length}/${today.length}`} l="filed flights met the SLA team today" />
        <Big v={String(filed.filter(short).length)} l="flights short this week" tone={filed.some(short) ? "warn" : undefined} />
      </div>
      <Section title="Short today">
        {todayShort.length === 0 ? <p className="flex items-center gap-1.5 text-sm text-green-800"><Check className="size-4" /> Every flight had its full team.</p> : null}
        <div className="space-y-1.5">{todayShort.map((g) => <FlightRow key={g.id} g={g} sub={`Short: ${teamShortfall(g, airlines.get(g.airline)!).join(", ")}`} right={<Badge tone="warn">Short</Badge>} />)}</div>
      </Section>
      <Section title="SLA met by airline (7 days)">
        <Bars rows={byAirline.map(({ a, n, met }) => ({ label: <span className="inline-flex items-center gap-1.5"><AirlineChip airline={a} />{a.name}</span>, value: Math.round((met / n) * 100), note: `${Math.round((met / n) * 100)}%` }))} />
      </Section>
      {pos.size ? <Section title="Patterns"><Insight>The position most often missing is <b>{[...pos.entries()].sort((a, b) => b[1] - a[1])[0][0]}</b>. Check the roster has enough agents trained on it at that time of day.</Insight></Section> : null}
    </>
  );
}

/* ---------------- Gaps ---------------- */
function Gaps({ onFix }: { onFix: (c: CoverageCell) => void }) {
  const hub = useHub();
  const input = useEngineInput();
  const ctx = React.useMemo(() => new CoverageContext(input), [input]);
  const week = React.useMemo(() => coverageGrid(input, hub.today, 7, ctx), [input, hub.today, ctx]);
  const today = week.filter((c) => c.date === hub.today && (c.level === "red" || c.level === "amber"));
  const ahead = week.filter((c) => c.date > hub.today && (c.level === "red" || c.level === "amber"));
  const name = (c: string) => hub.ds.airlines.find((a) => a.code === c);
  // Why: who on the team isn't there, moved away, or can't be counted
  const why = (c: CoverageCell): string[] => {
    const a = name(c.airline);
    const core = hub.ds.people.filter((p) => p.coreAirline === c.airline && p.role === "agent" && p.active !== false);
    const out: string[] = [];
    const away = core.filter((p) => hub.absenceOn(p.id, c.date));
    if (away.length) out.push(`${away.length} away: ${away.map((p) => `${p.firstName} (${ABSENCE_TYPES[hub.absenceOn(p.id, c.date)!.type].label.toLowerCase()})`).join(", ")}`);
    if (c.pulledOut.length) out.push(`${c.pulledOut.length} moved to cover another airline`);
    const blocked = a ? core.filter((p) => ctx.shift(p.id, c.date) === c.shift && !eligibleFor(p, a, c.date).ok) : [];
    if (blocked.length) out.push(`${blocked.length} on shift but training expired: ${blocked.map((p) => p.firstName).join(", ")}`);
    if (!out.length) out.push(c.required > c.assigned ? `Rostered ${c.assigned}, the flights need ${c.required}` : "No lead on duty for part of the shift");
    return out;
  };
  const repeat = new Map<string, number>();
  for (const c of [...today, ...ahead]) repeat.set(`${c.airline}|${c.shift}`, (repeat.get(`${c.airline}|${c.shift}`) ?? 0) + 1);
  const repeats = [...repeat.entries()].filter(([, n]) => n >= 3);
  return (
    <>
      <Section title="Today">
        {today.length === 0 ? <p className="flex items-center gap-1.5 text-sm text-green-800"><Check className="size-4" /> Every airline and shift is at SLA.</p> : null}
        <div className="space-y-2">
          {today.map((c) => {
            const a = name(c.airline);
            return (
              <div key={`${c.airline}${c.shift}`} className={cn("rounded-xl border p-3", c.level === "red" ? "border-red-200 bg-bad-soft/50" : "border-amber-200 bg-warn-soft/50")}>
                <div className="flex items-center gap-2.5">
                  {a ? <AirlineChip airline={a} size="lg" /> : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{a?.name} · {c.shift === "E" ? "Early" : "Late"} shift</p>
                    <p className="text-xs text-muted">{c.assigned} of {c.required} agents{c.leadsRequired ? ` · lead ${c.leadsAssigned}/${c.leadsRequired}` : ""}{c.gaps[0] ? ` · short ${c.gaps.map((g) => `${g.from}–${g.to}`).join(", ")}` : ""}</p>
                  </div>
                  <Badge tone={c.level === "red" ? "bad" : "warn"}>{c.level === "red" ? "Critical" : "Short"}</Badge>
                </div>
                <ul className="mt-2 space-y-0.5 text-xs">
                  {why(c).map((w) => <li key={w} className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-700" /> {w}</li>)}
                </ul>
                <Button size="sm" className="mt-2.5 h-10 w-full sm:h-8 sm:w-auto" onClick={() => onFix(c)}><Wrench className="size-4" /> See fixes</Button>
              </div>
            );
          })}
        </div>
      </Section>
      <Section title="Next 6 days" action={<Link href="/coverage" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700">SLA coverage <ArrowRight className="size-3.5" /></Link>}>
        {ahead.length === 0 ? <p className="text-sm text-muted">No gaps predicted from the roster.</p> : null}
        <div className="space-y-1.5">
          {ahead.slice(0, 8).map((c) => {
            const a = name(c.airline);
            return (
              <button key={`${c.date}${c.airline}${c.shift}`} type="button" onClick={() => onFix(c)} className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-line p-2.5 text-left transition-colors hover:border-brand-400 hover:bg-brand-50">
                <span className="w-14 shrink-0 text-xs font-semibold">{day(c.date)}</span>
                {a ? <AirlineChip airline={a} /> : null}
                <span className="min-w-0 flex-1 truncate text-sm">{a?.name} · {c.shift === "E" ? "Early" : "Late"}</span>
                <Badge tone={c.level === "red" ? "bad" : "warn"}>{c.assigned}/{c.required}</Badge>
              </button>
            );
          })}
          {ahead.length > 8 ? <p className="text-xs text-muted">+{ahead.length - 8} more on SLA coverage.</p> : null}
        </div>
      </Section>
      {repeats.length ? (
        <Section title="Patterns">
          <div className="space-y-1.5">
            {repeats.map(([k, n]) => {
              const [code, s] = k.split("|");
              return <Insight key={k}><b>{name(code)?.name} {s === "E" ? "early" : "late"}</b> is short on {n} of the next 7 days. That&apos;s a roster problem rather than a bad day: add a trained agent to the team or move a line.</Insight>;
            })}
          </div>
        </Section>
      ) : null}
    </>
  );
}

/* ---------------- Discrepancies ---------------- */
function Issues() {
  const hub = useHub();
  const { days, filed } = useWeek();
  const logs = hub.gateLogs.filter((g) => g.date >= days[0] && g.date <= hub.today);
  const today = hub.gateLogs.filter((g) => g.date === hub.today).flatMap((g) => g.discrepancies.map((d) => ({ g, d })));
  const all = logs.flatMap((g) => g.discrepancies.map((d) => ({ g, d })));
  const byType = new Map<string, number>();
  for (const { d } of all) byType.set(d.type, (byType.get(d.type) ?? 0) + 1);
  const byAirline = new Map<string, number>();
  for (const { g } of all) byAirline.set(g.airline, (byAirline.get(g.airline) ?? 0) + 1);
  const trend = days.map((d) => logs.filter((g) => g.date === d).reduce((n, g) => n + g.discrepancies.length, 0));
  const offloads = all.filter(({ d }) => d.bags && d.rampHandoff);
  const types = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  const topAirline = [...byAirline.entries()].sort((a, b) => b[1] - a[1])[0];
  const per100 = filed.length ? Math.round((all.length / filed.length) * 100) : 0;
  return (
    <>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Big v={String(today.length)} l="logged today" />
        <Big v={String(all.length)} l="last 7 days" />
        <Big v={String(per100)} l="per 100 flights" />
      </div>
      <Section title="Today">
        {today.length === 0 ? <p className="text-sm text-muted">None so far today.</p> : null}
        <div className="space-y-1.5">
          {today.map(({ g, d }) => (
            <FlightRow key={d.id} g={g} sub={`${d.type} at ${d.at}${d.note ? ` · ${d.note}` : ""}`} right={d.bags ? <Badge tone="warn"><Luggage className="size-3" /> {d.bags}</Badge> : undefined} />
          ))}
        </div>
      </Section>
      <Section title="Last 7 days"><Trend days={days} values={trend} good="low" /></Section>
      {types.length ? <Section title="By type (7 days)"><Bars rows={types.map(([k, v]) => ({ label: k, value: v }))} tone="warn" /></Section> : null}
      <Section title="Patterns">
        <div className="space-y-1.5">
          {types[0] ? <Insight>Most frequent: <b>{types[0][0]}</b>, {types[0][1]} times this week.</Insight> : null}
          {topAirline ? <Insight>Most logged on <b>{hub.ds.airlines.find((a) => a.code === topAirline[0])?.name}</b> ({topAirline[1]}). Worth raising with their station manager.</Insight> : null}
          {offloads.length ? <Insight>{offloads.length} bag offload{offloads.length > 1 ? "s" : ""} handed to the ramp in Rampline this week.</Insight> : null}
        </div>
      </Section>
    </>
  );
}

/* ---------------- Training ---------------- */
export function trainingDue(people: ReturnType<typeof useHub>["ds"]["people"], today: string) {
  const staff = people.filter((p) => (p.role === "agent" || p.role === "lead") && p.active !== false);
  const expired = staff.flatMap((p) => p.training.filter((t) => t.expires < today && p.trainedAirlines.includes(t.airline)).map((t) => ({ p, t })));
  const soon = staff.flatMap((p) => expiringSoon(p, today, 30).map((t) => ({ p, t })));
  return { expired, soon };
}

function Training() {
  const hub = useHub();
  const { expired, soon } = trainingDue(hub.ds.people, hub.today);
  const [sent, setSent] = React.useState(false);
  const air = (c: string) => hub.ds.airlines.find((a) => a.code === c) as Airline | undefined;
  // Impact: core agents who can't currently work their own airline
  const blockedCore = hub.ds.people.filter((p) => p.role === "agent" && p.active !== false && p.coreAirline && air(p.coreAirline) && !eligibleFor(p, air(p.coreAirline)!, hub.today).ok);
  const byCourse = new Map<string, number>();
  for (const { t } of [...expired, ...soon]) byCourse.set(t.course, (byCourse.get(t.course) ?? 0) + 1);
  const remind = () => {
    for (const { p, t } of [...expired, ...soon]) {
      hub.remindOnce(`train-${p.id}-${t.airline}-${t.course}-${t.expires}`.replace(/\s+/g, "_"), {
        to: [p.id],
        kind: "team",
        title: t.expires < hub.today ? `Training expired: ${t.course}` : `Training due: ${t.course}`,
        body: `${t.expires < hub.today ? "Expired" : "Expires"} ${formatDate(t.expires, { day: "numeric", month: "short" })}. Book with the training department.`,
        href: "/me",
      });
    }
    setSent(true);
  };
  const Row = ({ p, t, bad }: { p: (typeof expired)[number]["p"]; t: (typeof expired)[number]["t"]; bad: boolean }) => (
    <Link href={`/agents/${p.id}`} className="flex items-center gap-2.5 rounded-xl border border-line p-2.5 transition-colors hover:border-brand-400 hover:bg-brand-50">
      {air(t.airline) ? <AirlineChip airline={air(t.airline)!} /> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{p.firstName} {p.lastName}</span>
        <span className="block truncate text-xs text-muted">{t.course}{p.coreAirline === t.airline ? " · core airline" : ""}</span>
      </span>
      <Badge tone={bad ? "bad" : "warn"}>{bad ? "Expired" : "Due"} {formatDate(t.expires, { day: "numeric", month: "short" })}</Badge>
    </Link>
  );
  return (
    <>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Big v={String(expired.length)} l="records expired" tone={expired.length ? "bad" : undefined} />
        <Big v={String(soon.length)} l="due in 30 days" tone={soon.length ? "warn" : undefined} />
        <Big v={String(blockedCore.length)} l="agents can't work their own airline" tone={blockedCore.length ? "bad" : undefined} />
      </div>
      <div className="mt-3">
        <Button variant="outline" className="h-10 w-full sm:h-9 sm:w-auto" disabled={sent || !(expired.length + soon.length)} onClick={remind}><BellRing className="size-4" /> {sent ? "Reminders sent" : "Remind everyone affected"}</Button>
      </div>
      {blockedCore.length ? <div className="mt-3"><Insight><b>{blockedCore.length}</b> core agent{blockedCore.length > 1 ? "s" : ""} won&apos;t count toward their airline&apos;s cover until renewed. That feeds straight into coverage gaps.</Insight></div> : null}
      {expired.length ? <Section title="Expired"><div className="space-y-1.5">{expired.sort((a, b) => b.t.expires.localeCompare(a.t.expires)).map(({ p, t }) => <Row key={`${p.id}${t.airline}${t.course}`} p={p} t={t} bad />)}</div></Section> : null}
      <Section title="Due in the next 30 days">
        {soon.length === 0 ? <p className="text-sm text-muted">Nothing due.</p> : null}
        <div className="space-y-1.5">{soon.sort((a, b) => a.t.expires.localeCompare(b.t.expires)).map(({ p, t }) => <Row key={`${p.id}${t.airline}${t.course}`} p={p} t={t} bad={false} />)}</div>
      </Section>
      {byCourse.size ? <Section title="By course"><Bars rows={[...byCourse.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v }))} /></Section> : null}
    </>
  );
}
