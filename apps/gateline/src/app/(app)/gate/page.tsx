"use client";
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, FileCheck2, Siren, Smartphone } from "lucide-react";
import { Badge, Button, Card, PageHeader, TabsList, TabsTrigger, Tabs, cn } from "@nfs/ui";
import { addDays, formatDate, shiftForStd, toMinutes } from "@nfs/db";
import { DatePicker } from "@/components/date-picker";
import { timingsFor } from "@nfs/db";
import { deriveStatus } from "@nfs/flights";
import { useHub } from "@/lib/store";
import { RequirePerm } from "@/components/guard";
import { AirlineChip, FlightStatusBadge } from "@/components/ops";

export default function GateListPage() {
  return (
    <RequirePerm perm="gate.log">
      <GateList />
    </RequirePerm>
  );
}

function GateList() {
  const hub = useHub();
  const me = hub.me;
  const [date, setDate] = React.useState(hub.today);
  React.useEffect(() => {
    // Deep link: /gate?date=2026-11-12
    const d = new URLSearchParams(window.location.search).get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setDate(d);
  }, []);
  const entry = hub.ds.roster.find((r) => r.personId === me?.id && r.date === date);
  const [scope, setScope] = React.useState<"onteam" | "mine" | "all">(me?.role === "lead" ? "mine" : "all");
  const onTeam = (fid: string) => !!me && !!hub.logByFlight.get(fid)?.team.some((t) => t.personId === me.id);
  const dayFlights = hub.ds.flights.filter((f) => f.date === date && f.kind !== "arrival");
  const flights = dayFlights.filter((f) => (scope === "all" ? true : scope === "onteam" ? onTeam(f.id) : me?.trainedAirlines.includes(f.airline) ?? true));
  const airlines = new Map(hub.ds.airlines.map((a) => [a.code, a]));
  const isToday = date === hub.today;
  const past = date < hub.today;
  const nextUp = isToday ? flights.find((f) => !hub.logByFlight.get(f.id)?.events.pushback && toMinutes(f.std) >= hub.nowMin - 30) : undefined;
  // Days I worked a flight: dotted on the calendar so a lead can find their own logs
  const myDays = React.useMemo(() => new Set(me ? hub.gateLogs.filter((g) => g.team.some((t) => t.personId === me.id)).map((g) => g.date) : []), [hub.gateLogs, me]);
  const logs = flights.map((f) => hub.logByFlight.get(f.id)).filter((g): g is NonNullable<typeof g> => !!g);
  const filed = logs.filter((g) => g.status === "filed");
  const onTime = filed.filter((g) => !g.delayMinutes).length;
  const issues = logs.reduce((n, g) => n + g.discrepancies.length, 0);
  const unfiled = past ? flights.filter((f) => hub.logByFlight.get(f.id)?.status !== "filed" && (!f.ops || f.ops.status === "delayed" || !!hub.logByFlight.get(f.id))) : [];
  const shiftText = !entry || entry.shift === "O" ? "not rostered" : entry.shift === "V" ? "away" : `on the ${entry.shift === "E" ? "early" : entry.shift === "L" ? "late" : "mid"} shift${entry.time ? ` (${entry.time.replace("-", "–")})` : ""}`;

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        eyebrow={formatDate(date, { weekday: "long", day: "numeric", month: "short" })}
        title="Gate log"
        description={me ? `${me.firstName}, ${isToday ? "you're" : past ? "you were" : "you'll be"} ${shiftText} · trained on ${me.trainedAirlines.join(", ")}` : undefined}
      />

      {/* Any day: arrows for the day either side, or the calendar for any date */}
      <div className="mb-3 flex items-center gap-2">
        <Button variant="outline" size="icon" className="size-11 shrink-0" aria-label="Previous day" disabled={date <= hub.ds.windowStart} onClick={() => setDate(addDays(date, -1))}><ChevronLeft /></Button>
        <div className="min-w-0 flex-1"><DatePicker value={date} onChange={setDate} min={hub.ds.windowStart} max={hub.ds.horizonEnd} today={hub.today} marks={myDays} markLabel="Your flights" /></div>
        <Button variant="outline" size="icon" className="size-11 shrink-0" aria-label="Next day" disabled={date >= hub.ds.horizonEnd} onClick={() => setDate(addDays(date, 1))}><ChevronRight /></Button>
      </div>
      {!isToday ? (
        <button type="button" onClick={() => setDate(hub.today)} className="mb-3 w-full cursor-pointer rounded-lg bg-brand-50 py-2 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100">Back to today</button>
      ) : null}

      {/* The day at a glance */}
      <div className="mb-3 grid grid-cols-4 gap-1.5 text-center">
        {[
          ["Flights", String(flights.length)],
          ["Filed", `${filed.length}/${flights.length}`],
          ["On time", filed.length ? `${Math.round((onTime / filed.length) * 100)}%` : "–"],
          ["Issues", String(issues)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-card py-2"><p className="font-display text-lg font-semibold tabular leading-tight">{v}</p><p className="text-[10px] font-semibold uppercase text-muted">{k}</p></div>
        ))}
      </div>
      {unfiled.length ? (
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-warn-soft px-3 py-2 text-xs text-amber-900"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {unfiled.length} flight{unfiled.length > 1 ? "s" : ""} from this day {unfiled.length > 1 ? "weren't" : "wasn't"} filed: {unfiled.map((f) => f.flightNo).join(", ")}. Open {unfiled.length > 1 ? "them" : "it"} to finish the record.</p>
      ) : null}

      <Tabs value={scope} onValueChange={(v) => setScope(v as "onteam" | "mine" | "all")} className="mb-4">
        <TabsList className="w-full">
          <TabsTrigger value="onteam" className="flex-1">My flights</TabsTrigger>
          <TabsTrigger value="mine" className="flex-1">My airlines</TabsTrigger>
          <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-2.5">
        {flights.map((f) => {
          const log = hub.logByFlight.get(f.id);
          const s = deriveStatus(f, log, hub.today, hub.nowMin, timingsFor(hub.ds.airlines.find((a) => a.code === f.airline)));
          const a = airlines.get(f.airline)!;
          const tapped = log ? Object.keys(log.events).length : 0;
          const isNext = nextUp?.id === f.id;
          return (
            <Link key={f.id} href={log?.status === "filed" && past ? `/records/${log.id}` : `/gate/${f.id}`}>
              <Card className={cn("flex items-center gap-3 p-3.5 transition-colors hover:border-brand-400 hover:bg-brand-50", isNext && "border-brand-500 ring-2 ring-brand-100")}>
                <div className="grid w-14 shrink-0 place-items-center">
                  <span className="font-display text-lg font-semibold tabular">{f.std}</span>
                  <span className="text-[10px] font-semibold uppercase text-muted">{shiftForStd(f.std) === "E" ? "early" : "late"}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <AirlineChip airline={a} />
                    <span className="font-semibold tabular">{f.flightNo}</span>{hub.alertsFor(f.id).length ? <Siren aria-label="Inbound alert from Rampline" className="size-4 shrink-0 text-bad" /> : null}
                    {isNext ? <Badge tone="brand">Next</Badge> : null}
                    {onTeam(f.id) ? <Badge tone="brand">You&apos;re on it</Badge> : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">{f.destinationName} · Gate {f.gateFrom ? <span className="font-semibold text-gold-700">{f.gate} (was {f.gateFrom})</span> : f.gate} · {f.aircraft}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <FlightStatusBadge status={s.status} />
                    <span className="text-[11px] text-muted">{tapped}/7 logged{log?.status === "filed" ? " · filed" : ""}{log && log.delayMinutes ? ` · +${log.delayMinutes} min` : ""}{log?.discrepancies.length ? ` · ${log.discrepancies.length} issue${log.discrepancies.length > 1 ? "s" : ""}` : ""}</span>
                    {log?.status === "filed" ? <FileCheck2 className="size-4 text-green-700" aria-label="Filed" /> : null}
                  </div>
                </div>
                <ChevronRight className="size-5 text-ink-400" />
              </Card>
            </Link>
          );
        })}
        {flights.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted"><Smartphone className="mx-auto mb-2 size-6 text-ink-300" />{scope === "onteam" ? `You weren't on a flight team ${isToday ? "today" : "this day"}.` : `No departures ${scope === "mine" ? "for your airlines " : ""}${isToday ? "today" : "this day"}.`}</Card>
        ) : null}
      </div>
    </div>
  );
}
