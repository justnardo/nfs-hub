"use client";
import * as React from "react";
import Link from "next/link";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Avatar, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Stat, Table, Td, Th, Tr, cn } from "@nfs/ui";
import { ROLE_LABEL, can } from "@nfs/auth";
import { BadgeCheck, ChevronLeft, ChevronRight, UserMinus, UserX, Pencil, UserCog } from "lucide-react";
import { LeaverDialog, RoleDialog } from "./staff-dialogs";
import { AssignmentDialog } from "./assignment-dialog";
import { NFS_CONTROLLABLE, addDays, formatDate, rangeDays, type Person, type TeamPosition } from "@nfs/db";
import { eligibleFor } from "@nfs/rules";
import { AbsenceChip, AbsenceDialog } from "./absence";
import { ABSENCE_TYPES, type Absence } from "@/lib/absence";
import { useHub, personName } from "@/lib/store";
import { AirlineChip, PersonLink } from "@/components/ops";
import { buildPortfolio } from "@/lib/portfolio";
import { pct } from "@/lib/metrics";
import { CrewList, useCrew } from "@/components/agent-panels";
import { isWork } from "@nfs/rules";

const POS: Record<TeamPosition, string> = { lead: "Lead", gate: "Gate", jetBridge: "Jet bridge", counter: "Counter" };

export function PortfolioView({ p }: { p: Person }) {
  const hub = useHub();
  const [editing, setEditing] = React.useState(false);
  const [absence, setAbsence] = React.useState<Absence | "new" | null>(null);
  const canAbsence = can(hub.session?.role, "roster.edit") && p.active !== false;
  const isManager = hub.session?.role === "manager" || hub.session?.role === "admin";
  const [roleOpen, setRoleOpen] = React.useState(false);
  const [leaverOpen, setLeaverOpen] = React.useState(false);
  const former = p.active === false;
  const mine = hub.absences.filter((a) => a.personId === p.id);
  const manage = can(hub.session?.role, "staff.assign");
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
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {canAbsence ? <Button variant="outline" onClick={() => setAbsence("new")}><UserX /> Sick or leave</Button> : null}
            {manage && !former ? <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit assignment</Button> : null}
            {isManager && !former && ["agent", "lead", "supervisor"].includes(p.role) ? <Button variant="outline" onClick={() => setRoleOpen(true)}><BadgeCheck /> Change role</Button> : null}
            {isManager && !former && hub.me?.id !== p.id ? <Button variant="ghost" className="text-bad hover:bg-bad-soft hover:text-red-800" onClick={() => setLeaverOpen(true)}><UserMinus /> No longer at NFS</Button> : null}
            {isManager && former ? <Button variant="outline" onClick={() => hub.savePerson(p.id, { active: true, leftOn: undefined, leaving: undefined }, true, "reinstated")}>Reinstate</Button> : null}
            {hub.me?.id === p.id ? <Button variant="outline" asChild><Link href="/profile"><UserCog /> My profile</Link></Button> : null}
            <Avatar name={personName(p)} src={p.photoUrl} tone="gold" className="size-14 text-base max-sm:hidden" />
          </div>
        }
      />

      {editing ? <AssignmentDialog person={p} onClose={() => setEditing(false)} /> : null}
      {roleOpen ? <RoleDialog person={p} onClose={() => setRoleOpen(false)} /> : null}
      {leaverOpen ? <LeaverDialog person={p} onClose={() => setLeaverOpen(false)} /> : null}
      {former ? (
        <Card className="mb-5 flex items-center gap-3 border-red-200 bg-bad-soft/60 p-4 text-sm">
          <UserMinus className="size-5 shrink-0 text-bad" />
          <p className="flex-1 text-red-900"><b>No longer at NFS</b>{p.leftOn ? ` · last day ${formatDate(p.leftOn, { day: "numeric", month: "long", year: "numeric" })}` : ""}{p.leaving ? ` · ${p.leaving.reason} · HR confirmed by ${p.leaving.hrContact}${p.leaving.hrRef ? ` (${p.leaving.hrRef})` : ""} · recorded by ${p.leaving.recordedBy}` : ""}. Their history stays below.</p>
        </Card>
      ) : null}
      {absence ? <AbsenceDialog person={p} date={absence === "new" ? hub.today : absence.from} absence={absence === "new" ? undefined : absence} onClose={() => setAbsence(null)} /> : null}
      <div className="grid grid-cols-2 gap-3 @3xl/main:grid-cols-4">
        <Stat label="Flights worked · 28 days" value={pf.flights.length} sub={`${pf.asLead} as lead`} />
        <Stat label="On-time (D0) on their flights" value={pf.flights.length ? pct(pf.d0) : "—"} tone={pf.d0 >= 85 ? "ok" : "warn"} />
        <Stat label="Delays on their flights" value={totalDelays} sub={totalDelays ? `${nfsDelays} NFS-related · ${totalDelays - nfsDelays} other causes` : "none"} tone={nfsDelays ? "warn" : "ok"} />
        <Stat label="Discrepancies handled" value={pf.discrepancies} />
      </div>

      <div className="mt-5 grid gap-5 @3xl/main:grid-cols-3">
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

      <HistoryCalendar p={p} />

      <div className="mt-5 grid gap-5 @5xl/main:grid-cols-[1fr_360px]">
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
            <CardContent>
              <div className="grid grid-cols-7 gap-1 text-center">
                {week.map((d) => {
                  const lk = dayLook(roster.get(d), hub.absenceOn(p.id, d), roster.size > 0);
                  return (
                    <div key={d}>
                      <div className={cn("mb-1 text-[10px] font-semibold", d === hub.today ? "text-brand-700" : "text-muted")}>{d === hub.today ? "Today" : formatDate(d, { weekday: "short" })}</div>
                      <div className={cn("grid h-12 place-items-center rounded-lg border text-[11px] font-bold", lk.cell)} title={lk.title}>{lk.label}</div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted">{roster.size > 0 ? weekSummary(week.map((d) => dayLook(roster.get(d), hub.absenceOn(p.id, d)).kind)) : "Not on the shift roster."}</p>
            </CardContent>
          </Card>
          {canAbsence || mine.length ? (
            <Card>
              <CardHeader><div><CardTitle>Absences</CardTitle><CardDescription>Sick calls, leave and other time away</CardDescription></div></CardHeader>
              <CardContent className="space-y-1.5">
                {mine.length === 0 ? <p className="text-sm text-muted">None recorded.</p> : null}
                {mine.slice(0, 8).map((a) => (
                  <button key={a.id} disabled={!canAbsence} onClick={() => setAbsence(a)} className="flex w-full items-center gap-2 rounded-lg border border-line p-2 text-left text-sm transition-colors enabled:cursor-pointer enabled:hover:border-brand-400 enabled:hover:bg-brand-50">
                    <AbsenceChip a={a} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{ABSENCE_TYPES[a.type].label}</span>
                      <span className="block truncate text-xs text-muted">{a.from === a.to ? formatDate(a.from) : `${formatDate(a.from)} – ${formatDate(a.to)}`}{a.note ? ` · ${a.note}` : ""}</span>
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader><div><CardTitle>Training records</CardTitle><CardDescription>Kept by the training department</CardDescription></div></CardHeader>
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

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const POS_SHORT: Record<TeamPosition, string> = { lead: "Lead", gate: "Gate", jetBridge: "Jet bridge", counter: "Counter" };

/** Month calendar of someone's days: shift, absence and flights worked. Pick a day to see it. */
function HistoryCalendar({ p }: { p: Person }) {
  const hub = useHub();
  const [month, setMonth] = React.useState(hub.today.slice(0, 7));
  const [day, setDay] = React.useState(hub.today);
  const map = new Map(hub.ds.airlines.map((a) => [a.code, a]));
  const shift = new Map(hub.ds.roster.filter((r) => r.personId === p.id).map((r) => [r.date, r.shift]));
  const flightById = new Map(hub.ds.flights.map((f) => [f.id, f]));
  const worked = new Map<string, { flightNo: string; airline: string; pos: TeamPosition; logId: string; filed: boolean; delay: number }[]>();
  for (const g of hub.gateLogs) {
    const m = g.team.find((t) => t.personId === p.id);
    if (!m) continue;
    const f = flightById.get(g.flightId);
    if (!f) continue;
    worked.set(g.date, [...(worked.get(g.date) ?? []), { flightNo: f.flightNo, airline: f.airline, pos: m.position, logId: g.id, filed: g.status === "filed", delay: g.delayMinutes }]);
  }
  const [y, mo] = month.split("-").map(Number);
  const first = `${month}-01`;
  const lead = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
  const daysIn = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)] as (string | null)[];
  const minMonth = hub.ds.windowStart.slice(0, 7);
  const maxMonth = hub.ds.horizonEnd.slice(0, 7);
  const shiftMonth = (n: number) => {
    const d = new Date(Date.UTC(y, mo - 1 + n, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const rostered = shift.size > 0;
  const counts = { work: 0, off: 0, away: 0 };
  for (const d of cells) {
    if (!d || d < hub.ds.windowStart || d > hub.ds.horizonEnd) continue;
    counts[dayLook(shift.get(d), hub.absenceOn(p.id, d)).kind]++;
  }
  const monthSummary = !rostered ? "Not on the shift roster: managers and admin work office hours." : `${counts.work} working day${counts.work === 1 ? "" : "s"} · ${counts.off} off${counts.away ? ` · ${counts.away} away` : ""} this month`;
  const sel = worked.get(day) ?? [];
  const crew = useCrew(p, day);
  const selAbs = hub.absenceOn(p.id, day);
  const selShift = shift.get(day);
  return (
    <Card className="mt-5">
      <CardHeader className="flex-wrap">
        <div className="min-w-48 flex-1"><CardTitle>Day by day</CardTitle><CardDescription>Pick a day to see the shift, any absence and the flights worked</CardDescription></div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" disabled={month <= minMonth} onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft /></Button>
          <span className="min-w-32 text-center text-sm font-semibold">{formatDate(first, { month: "long", year: "numeric" })}</span>
          <Button variant="outline" size="icon" disabled={month >= maxMonth} onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight /></Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 @3xl/main:grid-cols-[1fr_320px]">
        <div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-muted">{DOW.map((d) => <span key={d}>{d}</span>)}</div>
          <div className="mt-1.5 grid grid-cols-7 gap-1.5">
            {cells.map((d, i) => {
              if (!d) return <span key={`x${i}`} />;
              const out = d < hub.ds.windowStart || d > hub.ds.horizonEnd;
              const lk = dayLook(shift.get(d), hub.absenceOn(p.id, d), rostered);
              const n = worked.get(d)?.length ?? 0;
              const on = d === day;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={out}
                  onClick={() => setDay(d)}
                  title={`${formatDate(d, { weekday: "long", day: "numeric", month: "long" })}: ${lk.title}`}
                  aria-pressed={on}
                  className={cn(
                    "relative flex h-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border text-xs transition-[box-shadow,background-color,border-color] disabled:cursor-default disabled:opacity-35",
                    lk.cell,
                    lk.kind === "off" ? "enabled:hover:border-brand-400 enabled:hover:bg-brand-50" : "enabled:hover:ring-2 enabled:hover:ring-brand-400",
                    on && "ring-[3px] ring-gold-500 ring-offset-2 ring-offset-card enabled:hover:ring-gold-500",
                  )}
                >
                  <span className={cn("text-[11px] tabular", d === hub.today ? "rounded-full bg-gold-500 px-1.5 font-bold text-ink-900" : "font-semibold opacity-90")}>{Number(d.slice(8))}</span>
                  <span className="text-[10px] font-bold tracking-wide">{lk.label}</span>
                  {n ? <span className="absolute -right-1.5 -top-1.5 z-10 grid size-[18px] place-items-center rounded-full bg-gold-500 text-[9.5px] font-bold text-ink-900 ring-2 ring-card" aria-label={`${n} flight${n > 1 ? "s" : ""} worked`}>{n}</span> : null}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs font-semibold text-ink-700">{monthSummary}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted">
            <span className="flex items-center gap-1"><span className="size-3 rounded bg-brand-600" /> Early</span>
            <span className="flex items-center gap-1"><span className="size-3 rounded bg-ink-800" /> Late</span>
            <span className="flex items-center gap-1"><span className="size-3 rounded bg-brand-400" /> Mid</span>
            <span className="flex items-center gap-1"><span className="size-3 rounded border border-dashed border-ink-300" /> Off</span>
            <span className="flex items-center gap-1"><span className="size-3 rounded border border-gold-400 bg-gold-100" /> Vacation</span>
            <span className="flex items-center gap-1"><span className="size-3 rounded bg-red-200" /> Sick or absent</span>
            <span className="flex items-center gap-1"><span className="rounded-full bg-gold-500 px-1 text-[9px] font-bold text-ink-900">20</span> Today</span>
            <span className="flex items-center gap-1"><span className="grid size-4 place-items-center rounded-full bg-gold-500 text-[9px] font-bold text-ink-900">2</span> Flights worked</span>
          </div>
        </div>
        <div className="rounded-xl border border-line p-3">
          <p className="text-sm font-semibold">{formatDate(day, { weekday: "long", day: "numeric", month: "long" })}</p>
          <p className="mt-0.5 text-xs text-muted">
            {selAbs ? `${ABSENCE_TYPES[selAbs.type].label}${selAbs.note ? ` · ${selAbs.note}` : ""}` : !selShift || selShift === "O" ? "Day off" : selShift === "V" ? "Vacation" : `${selShift === "E" ? "Early" : selShift === "L" ? "Late" : "Mid"} shift`}
          </p>
          {isWork(crew.shift) && (crew.leads.length || crew.agents.length || crew.supervisors.length) ? (
            <div className="mt-3 rounded-lg bg-surface p-2.5">
              <p className="mb-1.5 text-xs font-semibold">On shift with {hub.me?.id === p.id ? "you" : p.firstName}</p>
              <CrewList crew={crew} compact />
            </div>
          ) : null}
          <div className="mt-3 space-y-1.5">
            {sel.length === 0 ? <p className="text-xs text-muted">{day > hub.today ? "Future day: flights appear once worked." : "No flights logged for them this day."}</p> : null}
            {sel.map((w) => (
              <Link key={w.logId} href={w.filed ? `/records/${w.logId}` : `/gate/${w.logId.replace(/^log-/, "")}`} className="flex items-center gap-2 rounded-lg border border-line p-2 text-sm transition-colors hover:border-brand-400 hover:bg-brand-50">
                {map.get(w.airline) ? <AirlineChip airline={map.get(w.airline)!} /> : null}
                <span className="font-semibold">{w.flightNo}</span>
                <span className="flex-1 text-xs text-muted">{POS_SHORT[w.pos]}</span>
                {w.delay > 0 ? <Badge tone="warn">+{w.delay}m</Badge> : w.filed ? <Badge tone="ok">On time</Badge> : <Badge tone="brand">Open</Badge>}
              </Link>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type DayKind = "work" | "off" | "away";
/** One look for a day on someone's schedule: working days solid, days off outlined, time away tinted. */
function dayLook(shift: string | undefined, ab: Absence | undefined | null, rostered = true): { kind: DayKind; cell: string; label: string; title: string } {
  if (!rostered && !ab) return { kind: "off", cell: "border-line bg-card text-ink-400", label: "", title: "Not on the shift roster" };
  if (ab) return { kind: "away", cell: `${ABSENCE_TYPES[ab.type].tone} border-transparent`, label: ABSENCE_TYPES[ab.type].short, title: ABSENCE_TYPES[ab.type].label };
  switch (shift) {
    case "E": return { kind: "work", cell: "bg-brand-600 text-white border-brand-600", label: "EARLY", title: "Early shift" };
    case "L": return { kind: "work", cell: "bg-ink-800 text-white border-ink-800", label: "LATE", title: "Late shift" };
    case "M": return { kind: "work", cell: "bg-brand-400 text-white border-brand-400", label: "MID", title: "Mid shift" };
    case "V": return { kind: "away", cell: "bg-gold-100 text-gold-700 border-gold-400", label: "VAC", title: "Vacation" };
    default: return { kind: "off", cell: "border-dashed border-ink-300 bg-card text-ink-400", label: "OFF", title: "Day off" };
  }
}
function weekSummary(kinds: DayKind[]) {
  const w = kinds.filter((k) => k === "work").length;
  const o = kinds.filter((k) => k === "off").length;
  const a = kinds.length - w - o;
  return `${w} working · ${o} off${a ? ` · ${a} away` : ""}`;
}
