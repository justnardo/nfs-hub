"use client";
import * as React from "react";
import { Printer } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Select, Stat, Table, Td, Th, Tr, cn } from "@nfs/ui";
import { addDays, formatDate, rangeDays, type DelayCause } from "@nfs/db";
import { useHub, personName } from "@/lib/store";
import { RequirePerm } from "@/components/guard";
import { AirlineChip } from "@/components/ops";
import { NfsWordmark } from "@/components/brand";
import { isNfsCause, otpTone, pct, slaMet, summarise } from "@/lib/metrics";

// Validated pair (scripts/validate_palette.js): teal slot 1, violet slot 2.
const C1 = "#0e9aa7";
const C2 = "#6c5ce7";
const GRID = "#e2e8ee";
const AXIS = { fontSize: 11, fill: "#5b6b7b" };

export default function AnalyticsPage() {
  return (
    <RequirePerm perm="analytics.view">
      <Analytics />
    </RequirePerm>
  );
}

function Analytics() {
  const hub = useHub();
  const [days, setDays] = React.useState(14);
  const [terminal, setTerminal] = React.useState("");
  const from = addDays(hub.today, -(days - 1));
  const airlines = React.useMemo(() => new Map(hub.ds.airlines.map((a) => [a.code, a])), [hub.ds]);
  const shown = hub.ds.airlines.filter((a) => !terminal || a.terminal === terminal);
  const logs = hub.gateLogs.filter((l) => l.status === "filed" && l.date >= from && l.date <= hub.today && airlines.get(l.airline) && (!terminal || airlines.get(l.airline)!.terminal === terminal));
  const s = summarise(logs, airlines);
  const prev = summarise(
    hub.gateLogs.filter((l) => l.status === "filed" && l.date >= addDays(from, -days) && l.date < from && (!terminal || airlines.get(l.airline)!.terminal === terminal)),
    airlines,
  );

  const trend = rangeDays(from, days).map((d) => {
    const x = summarise(logs.filter((l) => l.date === d), airlines);
    return { day: formatDate(d, { day: "numeric", month: "short" }), D0: x.flights ? Math.round(x.d0) : null, D15: x.flights ? Math.round(x.d15) : null, flights: x.flights };
  });
  const byAirline = shown
    .map((a) => {
      const x = summarise(logs.filter((l) => l.airline === a.code), airlines);
      return { code: a.code, name: a.name, d0: Math.round(x.d0), sla: Math.round(x.slaCompliance), flights: x.flights, board: Math.round(x.avgBoarding), disc: x.discrepanciesPer100 };
    })
    .sort((a, b) => b.d0 - a.d0);

  const causeCounts = new Map<DelayCause, number>();
  for (const l of logs) if (l.delayMinutes > 0 && l.delayCause) causeCounts.set(l.delayCause, (causeCounts.get(l.delayCause) ?? 0) + 1);
  const causes = [...causeCounts]
    .map(([cause, n]) => ({ cause, nfs: isNfsCause(cause) ? n : 0, other: isNfsCause(cause) ? 0 : n, n }))
    .sort((a, b) => b.n - a.n);

  const leads = hub.ds.people
    .filter((p) => p.role === "lead")
    .map((p) => {
      const mine = logs.filter((l) => l.leadId === p.id);
      const x = summarise(mine, airlines);
      return { p, flights: mine.length, d0: x.d0, nfs: x.nfsDelays, other: x.otherDelays, sla: x.slaCompliance };
    })
    .filter((r) => r.flights > 0)
    .sort((a, b) => b.d0 - a.d0 || b.flights - a.flights);

  const delta = (a: number, b: number) => {
    const d = Math.round(a - b);
    return d === 0 ? "level with previous period" : `${d > 0 ? "▲" : "▼"} ${Math.abs(d)} pts vs previous ${days} days`;
  };

  return (
    <>
      <div className="hidden print:block mb-4"><NfsWordmark /></div>
      <PageHeader
        eyebrow="Performance analytics"
        title="Above-the-wing performance"
        description={`${formatDate(from, { day: "numeric", month: "short" })} – ${formatDate(hub.today, { day: "numeric", month: "short", year: "numeric" })} · ${s.flights} filed flight records · board-ready, print or save as PDF`}
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <Select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={21}>Last 21 days</option>
            </Select>
            <Select value={terminal} onChange={(e) => setTerminal(e.target.value)} aria-label="Terminal">
              <option value="">Both terminals</option>
              <option value="US">US Departures</option>
              <option value="INTL">International</option>
            </Select>
            <Button onClick={() => window.print()}><Printer /> Board report</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="On-time departure (D0)" value={pct(s.d0)} tone={otpTone(s.d0)} sub={delta(s.d0, prev.d0)} />
        <Stat label="Within 15 min (D15)" value={pct(s.d15)} tone={otpTone(s.d15)} sub={delta(s.d15, prev.d15)} />
        <Stat label="Team met SLA" value={pct(s.slaCompliance)} tone={s.slaCompliance >= 90 ? "ok" : "warn"} sub={delta(s.slaCompliance, prev.slaCompliance)} />
        <Stat label="Avg boarding time" value={`${Math.round(s.avgBoarding)} min`} sub="boarding start → close" />
        <Stat label="Delays caused by NFS" value={`${s.nfsDelays}`} tone={s.nfsDelays ? "warn" : "ok"} sub={`of ${s.nfsDelays + s.otherDelays} delays · rest outside NFS control`} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader><div><CardTitle>On-time trend</CardTitle><CardDescription>Share of departures pushed back on time (D0) and within 15 minutes (D15), by day</CardDescription></div></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <LineChart data={trend} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="day" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
                <YAxis domain={[40, 100]} tick={AXIS} axisLine={false} tickLine={false} unit="%" />
                <Tooltip formatter={(v) => `${v}%`} cursor={{ stroke: "#a9bccb", strokeDasharray: "3 3" }} />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="D15" stroke={C2} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: C2 }} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} connectNulls />
                <Line type="monotone" dataKey="D0" stroke={C1} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: C1 }} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div><CardTitle>Why flights were late</CardTitle><CardDescription>Fair data: every delay carries its recorded cause</CardDescription></div></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <BarChart data={causes} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="cause" width={150} tick={AXIS} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "rgb(14 154 167 / 0.06)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="other" name="Outside NFS control" stackId="c" fill={C1} radius={[0, 4, 4, 0]} barSize={14} />
                <Bar dataKey="nfs" name="NFS passenger services" stackId="c" fill={C2} radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>On-time (D0) by airline</CardTitle><CardDescription>Ranked · one colour, the label carries the airline</CardDescription></div></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <BarChart data={byAirline} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} unit="%" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="code" width={44} tick={AXIS} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => `${v}%`} labelFormatter={(c) => airlines.get(String(c))?.name ?? String(c)} cursor={{ fill: "rgb(14 154 167 / 0.06)" }} />
                <Bar dataKey="d0" name="On-time D0" fill={C1} radius={[0, 4, 4, 0]} barSize={16} label={{ position: "right", fontSize: 11, fill: "#0e1a26", formatter: (v: unknown) => `${v}%` }} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Airline scorecard</CardTitle><CardDescription>Table view of the period</CardDescription></div></CardHeader>
          <CardContent className="px-2 sm:px-5">
            <Table>
              <thead><tr><Th>Airline</Th><Th>Flights</Th><Th>D0</Th><Th>SLA met</Th><Th>Boarding</Th><Th>Issues /100</Th></tr></thead>
              <tbody>
                {byAirline.map((r) => (
                  <Tr key={r.code}>
                    <Td><AirlineChip airline={airlines.get(r.code)!} size="md" /></Td>
                    <Td className="tabular">{r.flights}</Td>
                    <Td><Badge tone={otpTone(r.d0)}>{r.d0}%</Badge></Td>
                    <Td><Badge tone={r.sla >= 90 ? "ok" : r.sla >= 75 ? "warn" : "bad"}>{r.sla}%</Badge></Td>
                    <Td className="tabular">{r.board} min</Td>
                    <Td className="tabular">{Math.round(r.disc)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader><div><CardTitle>Lead performance</CardTitle><CardDescription>Flights led in the period. Delays are split by recorded cause so leads aren't marked down for late inbounds or weather.</CardDescription></div></CardHeader>
        <CardContent className="px-2 sm:px-5">
          <Table>
            <thead><tr><Th>Lead</Th><Th>Core</Th><Th>Flights led</Th><Th>On-time D0</Th><Th>Team met SLA</Th><Th>NFS-caused delays</Th><Th>Other delays</Th></tr></thead>
            <tbody>
              {leads.map((r) => (
                <Tr key={r.p.id}>
                  <Td className="font-semibold">{personName(r.p)}</Td>
                  <Td>{r.p.coreAirline ? <AirlineChip airline={airlines.get(r.p.coreAirline)!} /> : "—"}</Td>
                  <Td className="tabular">{r.flights}</Td>
                  <Td><span className={cn("font-semibold tabular", r.d0 >= 85 ? "text-ok" : r.d0 >= 70 ? "text-warn" : "text-bad")}>{pct(r.d0)}</span></Td>
                  <Td className="tabular">{pct(r.sla)}</Td>
                  <Td className="tabular">{r.nfs}</Td>
                  <Td className="tabular text-muted">{r.other}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>
      <p className="mt-4 text-[11px] text-muted">SLA compliance compares the logged team on each flight to the airline's minimums ({logs.filter((l) => !slaMet(l, airlines.get(l.airline)!)).length} flights short in the period). SLA figures are placeholders until NFS confirms them.</p>
    </>
  );
}
