"use client";
import * as React from "react";
import Link from "next/link";
import { Siren, AlertTriangle, ArrowRight, BadgeCheck, Clock, GraduationCap, PlaneTakeoff, Users } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Stat, Table, Td, Th, Tr, cn } from "@nfs/ui";
import { formatDate } from "@nfs/db";
import { coverageGrid, expiringSoon, type CoverageCell } from "@nfs/rules";
import { timingsFor } from "@nfs/db";
import { deriveStatus } from "@nfs/flights";
import { useHub, personName } from "@/lib/store";
import { RequirePerm } from "@/components/guard";
import { AirlineChip, FlightStatusBadge, LEVEL_STYLE, PersonLink, ReassignDialog } from "@/components/ops";
import { pct, summarise } from "@/lib/metrics";
import { Pagination, usePaged } from "@/components/pagination";
import { LiveActivity } from "@/components/live-activity";

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
  const statuses = flights.map((f) => ({ f, s: deriveStatus(f, hub.logByFlight.get(f.id), hub.today, hub.nowMin, timingsFor(hub.ds.airlines.find((a) => a.code === f.airline))), log: hub.logByFlight.get(f.id) }));
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
  const depPage = usePaged(statuses, 8);
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

      <div className="grid grid-cols-2 gap-3 @xl/main:grid-cols-3 @4xl/main:grid-cols-5">
        <Stat label="Departures today" value={`${departed}/${flights.length}`} sub={upcoming ? `Next: ${upcoming.f.flightNo} at ${upcoming.f.std}` : "All departed"} icon={<PlaneTakeoff />} />
        <Stat label="On-time (D0)" value={sum.flights ? pct(sum.d0) : "—"} tone={sum.d0 >= 85 ? "ok" : sum.d0 >= 70 ? "warn" : "bad"} sub={`${sum.flights} filed records`} icon={<Clock />} />
        <Stat label="SLA team met" value={sum.flights ? pct(sum.slaCompliance) : "—"} tone={sum.slaCompliance >= 90 ? "ok" : "warn"} sub="per filed flight" icon={<BadgeCheck />} />
        <Stat label="Coverage gaps" value={gaps.length} tone={gaps.some((g) => g.level === "red") ? "bad" : gaps.length ? "warn" : "ok"} sub={gaps.length ? gaps.map((g) => `${g.airline} ${g.shift}`).join(" · ") : "all shifts at SLA"} icon={<Users />} />
        <Stat label="Discrepancies" value={openDisc.length} sub="logged at the gate today" icon={<AlertTriangle />} />
      </div>

      {/* On phones and narrow screens the live feed sits right under the tiles, not at the bottom. */}
      <LiveActivity className="mt-5 @5xl/main:hidden" perPage={5} />

      <div className="mt-5 grid gap-5 @5xl/main:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <div><CardTitle>Departures</CardTitle><CardDescription>Status from gate logs as leads tap · Flightradar24 and FlightAware feeds connect during the trial</CardDescription></div>
            <Button variant="ghost" size="sm" asChild><Link href="/flights">All flights</Link></Button>
          </CardHeader>
          <CardContent className="px-2 sm:px-5">
            <Table>
              <thead>
                <tr><Th>Flight</Th><Th>STD</Th><Th>Gate</Th><Th className="hidden @3xl/main:table-cell">Lead</Th><Th className="hidden @4xl/main:table-cell">Progress</Th><Th>Status</Th></tr>
              </thead>
              <tbody>
                {depPage.rows.map(({ f, s, log }) => {
                  const a = airlines.get(f.airline)!;
                  const done = log ? Object.keys(log.events).length : 0;
                  return (
                    <Tr key={f.id}>
                      <Td>
                        <Link href={log ? `/records/${log.id}` : `/gate/${f.id}`} className="flex items-center gap-2 transition-colors hover:text-brand-600">
                          <AirlineChip airline={a} />
                          <span className="leading-tight">
                            <span className="flex items-center gap-1 whitespace-nowrap font-semibold tabular">{f.flightNo}{hub.alertsFor(f.id).length ? <Siren aria-label="Inbound alert from Rampline" className="size-4 shrink-0 text-bad" /> : null}</span>
                            <span className="block text-[11px] text-muted">{f.destination}</span>
                          </span>
                        </Link>
                      </Td>
                      <Td className="tabular">{f.std}</Td>
                      <Td className="tabular">{f.gateFrom ? <span title={`Gate changed from ${f.gateFrom}`} className="rounded-md bg-gold-100 px-1.5 py-0.5 font-semibold text-gold-700">{f.gate}</span> : f.gate}</Td>
                      <Td className="hidden text-xs @3xl/main:table-cell">{log ? <PersonLink p={hub.people.get(log.leadId)} /> : <span className="text-muted">—</span>}</Td>
                      <Td className="hidden @4xl/main:table-cell">
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
            <Pagination paged={depPage} noun="departures" sizes={[8, 16]} className="mx-1 mt-1" />
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

          <LiveActivity className="hidden @5xl/main:block" />
        </div>
      </div>

      <div className="mt-5 grid gap-5 @3xl/main:grid-cols-2">
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
          <CardHeader><div><CardTitle>Training expiring in 30 days</CardTitle><CardDescription>Expired training blocks assignment</CardDescription></div><GraduationCap className="size-4 text-brand-500" /></CardHeader>
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
