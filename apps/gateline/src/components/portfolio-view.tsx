"use client";
import * as React from "react";
import Link from "next/link";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Avatar, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Stat, Table, Td, Th, Tr } from "@nfs/ui";
import { ROLE_LABEL } from "@nfs/auth";
import { NFS_CONTROLLABLE, formatDate, rangeDays, type Person, type TeamPosition } from "@nfs/db";
import { eligibleFor } from "@nfs/rules";
import { useHub, personName } from "@/lib/store";
import { AirlineChip, PersonLink, ShiftChip } from "@/components/ops";
import { buildPortfolio } from "@/lib/portfolio";
import { pct } from "@/lib/metrics";

const POS: Record<TeamPosition, string> = { lead: "Lead", gate: "Gate", jetBridge: "Jet bridge", counter: "Counter" };

export function PortfolioView({ p }: { p: Person }) {
  const hub = useHub();
  const map = new Map(hub.ds.airlines.map((a) => [a.code, a]));
  const flightById = React.useMemo(() => new Map(hub.ds.flights.map((f) => [f.id, f])), [hub.ds]);
  const pf = buildPortfolio(p.id, hub.gateLogs, flightById);
  const week = rangeDays(hub.today, 7);
  const roster = new Map(hub.ds.roster.filter((r) => r.personId === p.id).map((r) => [r.date, r.shift]));
  const airlineData = Object.entries(pf.byAirline).map(([code, n]) => ({ code, n })).sort((a, b) => b.n - a.n);
  const totalDelays = pf.delays.reduce((s, d) => s + d.n, 0);
  const nfsDelays = pf.delays.filter((d) => d.nfs).reduce((s, d) => s + d.n, 0);

  return (
    <>
      <PageHeader
        eyebrow={`${p.staffNo} · ${p.homeTerminal === "US" ? "US Departures Terminal" : "International Terminal"} · since ${p.hireYear}`}
        title={personName(p)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="dark">{ROLE_LABEL[p.role]}</Badge>
            {p.coreAirline ? <>Core <AirlineChip airline={map.get(p.coreAirline)!} size="md" /></> : <Badge tone="brand">Float pool</Badge>}
            <span className="text-muted">· qualified to cover</span>
            {p.trainedAirlines.filter((c) => c !== p.coreAirline).map((c) => <AirlineChip key={c} airline={map.get(c)!} />)}
          </span>
        }
        actions={<Avatar name={personName(p)} tone="gold" className="size-14 text-base" />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Flights worked · 28 days" value={pf.flights.length} sub={`${pf.asLead} as lead`} />
        <Stat label="On-time (D0) on their flights" value={pf.flights.length ? pct(pf.d0) : "—"} tone={pf.d0 >= 85 ? "ok" : "warn"} />
        <Stat label="Delays on their flights" value={totalDelays} sub={totalDelays ? `${nfsDelays} NFS-related · ${totalDelays - nfsDelays} other causes` : "none"} tone={nfsDelays ? "warn" : "ok"} />
        <Stat label="Discrepancies handled" value={pf.discrepancies} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader><div><CardTitle>Airlines worked</CardTitle></div></CardHeader>
          <CardContent className="h-44">
            <ResponsiveContainer>
              <BarChart data={airlineData} layout="vertical" margin={{ left: 0, right: 12 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="code" width={40} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "rgb(14 154 167 / 0.06)" }} />
                <Bar dataKey="n" name="Flights" fill="#0e9aa7" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Positions</CardTitle><CardDescription>Gate, check-in, jet bridge, lead</CardDescription></div></CardHeader>
          <CardContent className="space-y-2">
            {(Object.keys(pf.byPosition) as TeamPosition[]).map((k) => (
              <div key={k} className="flex items-center justify-between text-sm"><span className="text-muted">{POS[k]}</span><span className="font-semibold tabular">{pf.byPosition[k]}</span></div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Worked most with</CardTitle></div></CardHeader>
          <CardContent className="space-y-2">
            {pf.teammates.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm"><PersonLink p={hub.people.get(t.id)} /><span className="text-xs text-muted tabular">{t.n} flights</span></div>
            ))}
            {pf.teammates.length === 0 ? <p className="text-sm text-muted">No flights yet.</p> : null}
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader><div><CardTitle>Assignment history</CardTitle><CardDescription>Every filed flight, with outcome and recorded cause</CardDescription></div></CardHeader>
          <CardContent className="px-2 sm:px-5">
            <Table>
              <thead><tr><Th>Date</Th><Th>Flight</Th><Th>Position</Th><Th>Door close</Th><Th>Outcome</Th></tr></thead>
              <tbody>
                {pf.flights.slice(0, 15).map(({ log, flight, position }) => (
                  <Tr key={log.id}>
                    <Td className="whitespace-nowrap text-xs">{formatDate(flight.date)}</Td>
                    <Td><Link href={`/records/${log.id}`} className="flex items-center gap-1.5 font-semibold transition-colors hover:text-brand-600"><AirlineChip airline={map.get(flight.airline)!} />{flight.flightNo}</Link></Td>
                    <Td>{POS[position]}</Td>
                    <Td className="tabular">{log.events.door_close ?? "—"}</Td>
                    <Td>{log.delayMinutes === 0 ? <Badge tone="ok">On time</Badge> : <Badge tone={log.delayCause && NFS_CONTROLLABLE.includes(log.delayCause) ? "warn" : "neutral"}>+{log.delayMinutes}m · {log.delayCause}</Badge>}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader><div><CardTitle>Next 7 days</CardTitle></div></CardHeader>
            <CardContent className="grid grid-cols-7 gap-1 text-center">
              {week.map((d) => (
                <div key={d}>
                  <div className="mb-1 text-[10px] font-semibold text-muted">{formatDate(d, { weekday: "short" })}</div>
                  <ShiftChip shift={roster.get(d) ?? "O"} />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Training records</CardTitle><CardDescription>From TakeFlight</CardDescription></div></CardHeader>
            <CardContent className="space-y-2">
              {p.training.map((t) => {
                const expired = t.expires < hub.today;
                const ok = eligibleFor(p, map.get(t.airline)!, hub.today).ok;
                return (
                  <div key={t.airline + t.course} className="flex items-center gap-2 text-sm">
                    <AirlineChip airline={map.get(t.airline)!} />
                    <span className="flex-1 truncate">{t.course}</span>
                    <Badge tone={expired ? "bad" : ok ? "ok" : "warn"}>{expired ? "Expired" : "to"} {formatDate(t.expires, { day: "numeric", month: "short", year: "2-digit" })}</Badge>
                  </div>
                );
              })}
              {p.training.length === 0 ? <p className="text-sm text-muted">No training on file.</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
