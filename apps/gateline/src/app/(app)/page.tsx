"use client";
import * as React from "react";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, BadgeCheck, Clock, GraduationCap, PlaneTakeoff, Users } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Stat, Table, Td, Th, Tr, cn } from "@nfs/ui";
import { GATE_EVENT_LABEL, formatDate, type GateEventType } from "@nfs/db";
import { coverageGrid, expiringSoon, type CoverageCell } from "@nfs/rules";
import { deriveStatus } from "@nfs/flights";
import { useHub, personName } from "@/lib/store";
import { RequirePerm } from "@/components/guard";
import { AirlineChip, FlightStatusBadge, LEVEL_STYLE, PersonLink, ReassignDialog } from "@/components/ops";
import { pct, summarise } from "@/lib/metrics";

export default function TodayPage() {
  return (
    <RequirePerm perm="analytics.view">
      <Today />
    </RequirePerm>
  );
}

function Today() {
  const hub = useHub();
  const [cell, setCell] = React.useState<CoverageCell | null>(null);
  const airlines = React.useMemo(() => new Map(hub.ds.airlines.map((a) => [a.code, a])), [hub.ds]);
  const flights = hub.ds.flights.filter((f) => f.date === hub.today);
  const statuses = flights.map((f) => ({ f, s: deriveStatus(f, hub.logByFlight.get(f.id), hub.today, hub.nowMin), log: hub.logByFlight.get(f.id) }));
  const todayLogs = hub.gateLogs.filter((g) => g.date === hub.today);
  const sum = summarise(todayLogs, airlines);
  const departed = statuses.filter((x) => x.s.status === "Departed").length;

  const cells = coverageGrid({ airlines: hub.ds.airlines, people: hub.ds.people, flights: hub.ds.flights, roster: hub.ds.roster, reassignments: hub.reassignments }, hub.today, 1);
  const liveCell = cell ? cells.find((c) => c.airline === cell.airline && c.shift === cell.shift) ?? null : null;
  const gaps = cells.filter((c) => c.level === "red" || c.level === "amber");
  const openDisc = todayLogs.flatMap((l) => l.discrepancies.map((d) => ({ d, l })));
  const expiring = hub.ds.people
    .filter((p) => p.role === "agent" || p.role === "lead")
    .map((p) => ({ p, recs: expiringSoon(p, hub.today, 30) }))
    .filter((x) => x.recs.length)
    .slice(0, 6);
  const feed = [...hub.events].reverse().slice(0, 8);
  const upcoming = statuses.filter((x) => x.s.status !== "Departed").slice(0, 1)[0];

  return (
    <>
      <PageHeader
        eyebrow={`${formatDate(hub.today, { weekday: "long", day: "numeric", month: "long" })} · LPIA`}
        title="Today above the wing"
        description="Live position for passenger services: departures, gate progress, coverage against SLA and anything that needs a manager."
        actions={
          <>
            <Button variant="outline" asChild><Link href="/analytics">Analytics</Link></Button>
            <Button asChild><Link href="/coverage">Coverage heatmap <ArrowRight /></Link></Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Departures today" value={`${departed}/${flights.length}`} sub={upcoming ? `Next: ${upcoming.f.flightNo} at ${upcoming.f.std}` : "All departed"} icon={<PlaneTakeoff />} />
        <Stat label="On-time (D0)" value={sum.flights ? pct(sum.d0) : "—"} tone={sum.d0 >= 85 ? "ok" : sum.d0 >= 70 ? "warn" : "bad"} sub={`${sum.flights} filed records`} icon={<Clock />} />
        <Stat label="SLA team met" value={sum.flights ? pct(sum.slaCompliance) : "—"} tone={sum.slaCompliance >= 90 ? "ok" : "warn"} sub="per filed flight" icon={<BadgeCheck />} />
        <Stat label="Coverage gaps" value={gaps.length} tone={gaps.some((g) => g.level === "red") ? "bad" : gaps.length ? "warn" : "ok"} sub={gaps.length ? gaps.map((g) => `${g.airline} ${g.shift}`).join(" · ") : "all shifts at SLA"} icon={<Users />} />
        <Stat label="Discrepancies" value={openDisc.length} sub="logged at the gate today" icon={<AlertTriangle />} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <div><CardTitle>Departures</CardTitle><CardDescription>Status from gate logs as leads tap · Flightradar24 and FlightAware feeds connect during the trial</CardDescription></div>
            <Button variant="ghost" size="sm" asChild><Link href="/flights">All flights</Link></Button>
          </CardHeader>
          <CardContent className="px-2 sm:px-5">
            <Table>
              <thead>
                <tr><Th>Flight</Th><Th>STD</Th><Th>Gate</Th><Th>Lead</Th><Th>Progress</Th><Th>Status</Th></tr>
              </thead>
              <tbody>
                {statuses.map(({ f, s, log }) => {
                  const a = airlines.get(f.airline)!;
                  const done = log ? Object.keys(log.events).length : 0;
                  return (
                    <Tr key={f.id}>
                      <Td>
                        <Link href={log ? `/records/${log.id}` : `/gate/${f.id}`} className="flex items-center gap-2 transition-colors hover:text-brand-600">
                          <AirlineChip airline={a} />
                          <span className="font-semibold tabular">{f.flightNo}</span>
                          <span className="hidden text-xs text-muted sm:inline">{f.destination}</span>
                        </Link>
                      </Td>
                      <Td className="tabular">{f.std}</Td>
                      <Td className="tabular">{f.gate}</Td>
                      <Td className="text-xs">{log ? <PersonLink p={hub.people.get(log.leadId)} /> : <span className="text-muted">—</span>}</Td>
                      <Td>
                        <div className="flex gap-0.5">
                          {Array.from({ length: 7 }).map((_, i) => <span key={i} className={cn("h-1.5 w-3 rounded-full", i < done ? "bg-brand-500" : "bg-line")} />)}
                        </div>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <FlightStatusBadge status={s.status} />
                          {log && log.delayMinutes > 0 ? <span className="text-[11px] font-semibold text-bad tabular">+{log.delayMinutes}m</span> : null}
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader><div><CardTitle>Coverage today</CardTitle><CardDescription>Trained agents on shift vs SLA · tap to fix</CardDescription></div></CardHeader>
            <CardContent>
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 gap-y-1.5">
                <span />
                <span className="w-16 text-center text-[10px] font-bold uppercase text-muted">Early</span>
                <span className="w-16 text-center text-[10px] font-bold uppercase text-muted">Late</span>
                {hub.ds.airlines.map((a) => (
                  <React.Fragment key={a.code}>
                    <AirlineChip airline={a} size="md" />
                    {(["E", "L"] as const).map((s) => {
                      const c = cells.find((x) => x.airline === a.code && x.shift === s)!;
                      return (
                        <button
                          key={s}
                          disabled={c.level === "none"}
                          onClick={() => setCell(c)}
                          className={cn("h-9 w-16 rounded-md border text-xs font-bold tabular transition-colors", LEVEL_STYLE[c.level], c.level !== "none" && "cursor-pointer")}
                        >
                          {c.level === "none" ? "·" : `${c.assigned}/${c.required}`}
                        </button>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Live gate activity</CardTitle><CardDescription>Events from leads' phones, shared with Rampline</CardDescription></div><Activity className="size-4 text-brand-500" /></CardHeader>
            <CardContent className="space-y-2">
              {feed.length === 0 ? <p className="text-sm text-muted">Waiting for the first tap from a gate. Open the gate log on a phone to see events land here.</p> : null}
              {feed.map((e) => {
                const f = hub.ds.flights.find((x) => x.id === e.payload.flightId);
                const label = e.type === "gate.event" ? GATE_EVENT_LABEL[e.payload.event as GateEventType] : e.type === "agent.reassigned" ? "Cover placed" : e.type === "gate.filed" ? "Record filed" : e.type === "gate.discrepancy" ? "Discrepancy logged" : e.type === "gate.team" ? "Team set" : e.type;
                if (e.type === "gate.door_close" || e.type === "gate.pushback") return null;
                return (
                  <div key={e.id} className="flex items-center gap-2 text-sm">
                    <span className="size-1.5 shrink-0 rounded-full bg-brand-500" />
                    <span className="font-semibold tabular">{f?.flightNo ?? (e.payload.toAirline as string) ?? ""}</span>
                    <span className="flex-1 truncate text-muted">{label}{e.payload.at ? ` · ${e.payload.at}` : ""}</span>
                    <span className="text-[11px] text-ink-400 tabular">{new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Nassau" })}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>Discrepancies logged today</CardTitle><CardDescription>Captured at the gate with notes and photos</CardDescription></div></CardHeader>
          <CardContent className="space-y-2">
            {openDisc.length === 0 ? <p className="text-sm text-muted">None so far today.</p> : null}
            {openDisc.slice(0, 6).map(({ d, l }) => {
              const f = hub.ds.flights.find((x) => x.id === l.flightId)!;
              return (
                <Link key={d.id} href={`/records/${l.id}`} className="flex items-start gap-3 rounded-lg border border-line px-3 py-2 transition-colors hover:border-brand-400 hover:bg-brand-50">
                  <AirlineChip airline={airlines.get(f.airline)!} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{d.type} <span className="font-normal text-muted">· {f.flightNo} · {d.at}</span></p>
                    <p className="truncate text-xs text-muted">{d.note}</p>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Training expiring in 30 days</CardTitle><CardDescription>From TakeFlight records · expired training blocks assignment</CardDescription></div><GraduationCap className="size-4 text-brand-500" /></CardHeader>
          <CardContent className="space-y-2">
            {expiring.map(({ p, recs }) => (
              <div key={p.id} className="flex items-center gap-3 text-sm">
                <PersonLink p={p} />
                <span className="flex-1 truncate text-xs text-muted">{recs[0].course}</span>
                <Badge tone="warn">{formatDate(recs[0].expires, { day: "numeric", month: "short" })}</Badge>
              </div>
            ))}
            {expiring.length === 0 ? <p className="text-sm text-muted">Nothing expiring.</p> : null}
          </CardContent>
        </Card>
      </div>
      <p className="mt-6 text-center text-[11px] text-muted">Times are Nassau local. Now {String(Math.floor(hub.nowMin / 60)).padStart(2, "0")}:{String(hub.nowMin % 60).padStart(2, "0")} · {personName(hub.me)}</p>
      <ReassignDialog cell={liveCell} open={!!cell} onOpenChange={(v) => !v && setCell(null)} />
    </>
  );
}
