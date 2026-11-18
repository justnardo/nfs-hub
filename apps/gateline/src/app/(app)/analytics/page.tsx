"use client";
import * as React from "react";
import { Download, FileText, Loader2, Sparkles } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Select, Stat, Table, Td, Th, Tr, cn } from "@nfs/ui";
import { addDays, formatDate, weekStart } from "@nfs/db";
import { useEngineInput, useHub, personName } from "@/lib/store";
import { DatePicker } from "@/components/date-picker";
import { buildReport, reportCsv } from "@/lib/report";
import { downloadBoardReport } from "@/lib/report-pdf";
import { RequirePerm } from "@/components/guard";
import { AirlineChip } from "@/components/ops";
import { NfsWordmark } from "@/components/brand";
import { Pagination, usePaged } from "@/components/pagination";
import { otpTone, pct, slaMet } from "@/lib/metrics";

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
  const engine = useEngineInput();
  const earliest = hub.ds.windowStart;
  const presets: { id: string; label: string; from: string; to: string }[] = [
    { id: "7", label: "Last 7 days", from: addDays(hub.today, -6), to: hub.today },
    { id: "14", label: "Last 14 days", from: addDays(hub.today, -13), to: hub.today },
    { id: "wk", label: "This week", from: weekStart(hub.today), to: hub.today },
    { id: "lwk", label: "Last week", from: addDays(weekStart(hub.today), -7), to: addDays(weekStart(hub.today), -1) },
    { id: "mtd", label: "Month to date", from: `${hub.today.slice(0, 8)}01`, to: hub.today },
    { id: "all", label: "All records", from: earliest, to: hub.today },
  ].map((x) => ({ ...x, from: x.from < earliest ? earliest : x.from }));
  const [preset, setPreset] = React.useState("14");
  const [custom, setCustom] = React.useState({ from: addDays(hub.today, -13), to: hub.today });
  const range = preset === "custom" ? custom : presets.find((x) => x.id === preset)!;
  const [terminal, setTerminal] = React.useState<"" | "US" | "INTL">("");
  const [airlineFilter, setAirlineFilter] = React.useState("");
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const airlines = React.useMemo(() => new Map(hub.ds.airlines.map((a) => [a.code, a])), [hub.ds]);

  const rep = React.useMemo(
    () => buildReport({ from: range.from, to: range.to, terminal, airline: airlineFilter, logs: hub.gateLogs, flights: hub.ds.flights, airlines: hub.ds.airlines, people: hub.ds.people, absences: hub.absences, reassignments: hub.reassignments, feedback: hub.feedback, engine }),
    [range.from, range.to, terminal, airlineFilter, hub.gateLogs, hub.ds, hub.absences, hub.reassignments, hub.feedback, engine],
  );
  const s = rep.summary;
  const prev = rep.previous;
  const days = rep.days;
  const trend = rep.trend.map((t) => ({ day: formatDate(t.date, { day: "numeric", month: "short" }), D0: t.d0, D15: t.d15, flights: t.flights, Passengers: t.pax, Wheelchairs: t.wheelchairs }));
  const byAirline = rep.airlines.map((a) => ({ code: a.code, name: a.name, d0: a.d0, sla: a.sla, flights: a.flights, board: a.boarding, disc: a.issuesPer100, pax: a.pax }));
  const causes = rep.causes.map((c) => ({ cause: c.cause, nfs: c.nfs ? c.n : 0, other: c.nfs ? 0 : c.n, n: c.n }));
  const leads = rep.leads.map((l) => ({ p: l.person, flights: l.flights, d0: l.d0, nfs: l.nfs, other: l.other, sla: l.sla }));
  const leadPage = usePaged(leads, 8, [range.from, range.to, terminal, airlineFilter]);
  const logs = hub.gateLogs.filter((l) => l.status === "filed" && l.date >= rep.from && l.date <= rep.to);

  const delta = (a: number, b: number) => {
    if (!prev.flights) return "no earlier records to compare";
    const d = Math.round(a - b);
    return d === 0 ? "level with previous period" : `${d > 0 ? "▲" : "▼"} ${Math.abs(d)} pts vs previous ${days} days`;
  };
  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      await downloadBoardReport(rep, hub.session?.name ?? "Gateline");
    } finally {
      setPdfBusy(false);
    }
  };
  const downloadCsv = () => {
    const scoped = logs.filter((l) => (!terminal || airlines.get(l.airline)?.terminal === terminal) && (!airlineFilter || l.airline === airlineFilter));
    const blob = new Blob([reportCsv(rep, scoped, hub.ds.flights, hub.people)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `NFS-flight-records-${rep.from}-to-${rep.to}.csv`;
    a.click();
  };

  return (
    <>
      <div className="hidden print:block mb-4"><NfsWordmark /></div>
      <PageHeader
        eyebrow="Performance analytics"
        title="Above-the-wing performance"
        description={`${formatDate(rep.from, { day: "numeric", month: "short" })} – ${formatDate(rep.to, { day: "numeric", month: "short", year: "numeric" })} · ${rep.scope} · ${s.flights} filed flight records`}
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={downloadCsv}><Download /> Data (CSV)</Button>
            <Button onClick={downloadPdf} disabled={pdfBusy || !s.flights}>{pdfBusy ? <Loader2 className="animate-spin" /> : <FileText />} Board report (PDF)</Button>
          </div>
        }
      />

      <Card className="no-print mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="flex flex-wrap gap-1">
          {[...presets, { id: "custom", label: "Custom" }].map((x) => (
            <button key={x.id} onClick={() => setPreset(x.id)} className={cn("h-9 cursor-pointer rounded-lg px-3 text-xs font-semibold transition-colors", preset === x.id ? "bg-brand-500 text-white" : "text-muted hover:bg-brand-50 hover:text-brand-700")}>{x.label}</button>
          ))}
        </div>
        {preset === "custom" ? (
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <DatePicker value={custom.from} onChange={(d) => setCustom({ from: d, to: custom.to < d ? d : custom.to })} min={earliest} max={hub.today} today={hub.today} />
            to
            <DatePicker value={custom.to} onChange={(d) => setCustom({ from: custom.from > d ? d : custom.from, to: d })} min={earliest} max={hub.today} today={hub.today} />
          </div>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-2">
          <Select value={terminal} onChange={(e) => { setTerminal(e.target.value as "" | "US" | "INTL"); setAirlineFilter(""); }} aria-label="Terminal">
            <option value="">Both terminals</option>
            <option value="US">US Departures</option>
            <option value="INTL">International</option>
          </Select>
          <Select value={airlineFilter} onChange={(e) => setAirlineFilter(e.target.value)} aria-label="Airline">
            <option value="">All airlines</option>
            {hub.ds.airlines.filter((a) => !terminal || a.terminal === terminal).map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
          </Select>
        </div>
      </Card>

      {rep.highlights.length ? (
        <Card className="mb-5 border-brand-100 bg-brand-50/50 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-800"><Sparkles className="size-4" /> What stands out</p>
          <ul className="mt-2 grid gap-x-8 gap-y-1.5 text-sm text-ink-900 @4xl/main:grid-cols-2">
            {rep.highlights.map((h) => <li key={h} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-500" />{h}</li>)}
          </ul>
        </Card>
      ) : (
        <Card className="mb-5 p-5 text-sm text-muted">No filed flight records in this period yet.</Card>
      )}

      <div className="grid grid-cols-2 gap-3 @xl/main:grid-cols-3 @4xl/main:grid-cols-6">
        <Stat label="On-time departure (D0)" value={pct(s.d0)} tone={otpTone(s.d0)} sub={delta(s.d0, prev.d0)} />
        <Stat label="Within 15 min (D15)" value={pct(s.d15)} tone={otpTone(s.d15)} sub={delta(s.d15, prev.d15)} />
        <Stat label="Team met SLA" value={pct(s.slaCompliance)} tone={s.slaCompliance >= 90 ? "ok" : "warn"} sub={delta(s.slaCompliance, prev.slaCompliance)} />
        <Stat label="Passengers boarded" value={rep.pax.toLocaleString("en-US")} sub={rep.wheelchairs ? `${rep.wheelchairs} wheelchair assists` : `${s.flights} flights`} />
        <Stat label="Avg boarding time" value={`${Math.round(s.avgBoarding)} min`} sub={rep.avgDelayMin ? `avg delay ${Math.round(rep.avgDelayMin)} min when late` : "boarding start → close"} />
        <Stat label="Delays caused by NFS" value={`${s.nfsDelays}`} tone={s.nfsDelays ? "warn" : "ok"} sub={`of ${s.nfsDelays + s.otherDelays} delays · rest outside NFS control`} />
      </div>

      <div className="mt-5 grid gap-5 @5xl/main:grid-cols-[1.4fr_1fr]">
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

      <div className="mt-5 grid gap-5 @3xl/main:grid-cols-2">
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
              <thead><tr><Th>Airline</Th><Th>Flights</Th><Th>D0</Th><Th>SLA met</Th><Th className="hidden @xl/tbl:table-cell">Boarding</Th><Th className="hidden @xl/tbl:table-cell">Issues /100</Th></tr></thead>
              <tbody>
                {byAirline.map((r) => (
                  <Tr key={r.code}>
                    <Td><AirlineChip airline={airlines.get(r.code)!} size="md" /></Td>
                    <Td className="tabular">{r.flights}</Td>
                    <Td><Badge tone={otpTone(r.d0)}>{r.d0}%</Badge></Td>
                    <Td><Badge tone={r.sla >= 90 ? "ok" : r.sla >= 75 ? "warn" : "bad"}>{r.sla}%</Badge></Td>
                    <Td className="hidden @xl/tbl:table-cell tabular">{r.board} min</Td>
                    <Td className="hidden @xl/tbl:table-cell tabular">{Math.round(r.disc)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 @5xl/main:grid-cols-3">
        <Card className="@5xl/main:col-span-1">
          <CardHeader><div><CardTitle>Staffing and attendance</CardTitle><CardDescription>Rostered trained agents against SLA, absences and covers</CardDescription></div></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Shifts fully covered" v={rep.staffing.shifts ? `${rep.staffing.shiftsAtSla} of ${rep.staffing.shifts} · ${Math.round((rep.staffing.shiftsAtSla / rep.staffing.shifts) * 100)}%` : "—"} />
            <Row k="Critically short shifts" v={String(rep.staffing.red)} tone={rep.staffing.red ? "text-bad" : undefined} />
            <Row k="Sick call-outs" v={String(rep.staffing.callOuts)} />
            <Row k="Days lost to sickness / no-show" v={String(rep.staffing.sickDays)} />
            <Row k="All time away (days)" v={String(rep.staffing.absenceDays)} />
            <Row k="Covers placed between teams" v={`${rep.staffing.covers}${rep.staffing.overrides ? ` · ${rep.staffing.overrides} override` : ""}`} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Passengers and assistance</CardTitle><CardDescription>Boarded per day; wheelchair assists on top</CardDescription></div></CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer>
              <BarChart data={trend} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="day" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "rgb(14 154 167 / 0.06)" }} />
                <Bar dataKey="Passengers" fill={C1} radius={[4, 4, 0, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Issues and feedback</CardTitle><CardDescription>Logged at the gate · from station managers</CardDescription></div></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {rep.discrepancies.slice(0, 6).map((d) => <Row key={d.type} k={d.type} v={String(d.n)} />)}
            {rep.discrepancies.length === 0 ? <p className="text-muted">No issues logged.</p> : null}
            <div className="mt-2 flex gap-2 border-t border-line pt-3">
              <Badge tone="ok">{rep.feedback.praise} compliments</Badge>
              <Badge tone="bad">{rep.feedback.complaints} complaints</Badge>
              {rep.feedback.open ? <Badge tone="warn">{rep.feedback.open} open</Badge> : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader><div><CardTitle>Lead performance</CardTitle><CardDescription>Flights led in the period. Delays are split by recorded cause so leads aren't marked down for late inbounds or weather.</CardDescription></div></CardHeader>
        <CardContent className="px-2 sm:px-5">
          <Table>
            <thead><tr><Th>Lead</Th><Th className="hidden @4xl/main:table-cell">Core</Th><Th>Flights led</Th><Th>On-time D0</Th><Th>Team met SLA</Th><Th>NFS-caused delays</Th><Th className="hidden @4xl/main:table-cell">Other delays</Th></tr></thead>
            <tbody>
              {leadPage.rows.map((r) => (
                <Tr key={r.p.id}>
                  <Td className="font-semibold">{personName(r.p)}</Td>
                  <Td className="hidden @4xl/main:table-cell">{r.p.coreAirline ? <AirlineChip airline={airlines.get(r.p.coreAirline)!} /> : "—"}</Td>
                  <Td className="tabular">{r.flights}</Td>
                  <Td><span className={cn("font-semibold tabular", r.d0 >= 85 ? "text-ok" : r.d0 >= 70 ? "text-warn" : "text-bad")}>{pct(r.d0)}</span></Td>
                  <Td className="tabular">{pct(r.sla)}</Td>
                  <Td className="tabular">{r.nfs}</Td>
                  <Td className="hidden @4xl/main:table-cell tabular text-muted">{r.other}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pagination paged={leadPage} noun="leads" sizes={[8, 16]} className="mx-1 mt-1" />
        </CardContent>
      </Card>
      <p className="mt-4 text-[11px] text-muted">SLA compliance compares the logged team on each flight to the airline&apos;s minimums ({logs.filter((l) => airlines.get(l.airline) && !slaMet(l, airlines.get(l.airline)!)).length} flights short in the period). SLA figures are placeholders until NFS confirms them. The board report PDF uses exactly these numbers.</p>
    </>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className={cn("font-semibold tabular", tone)}>{v}</span>
    </div>
  );
}
