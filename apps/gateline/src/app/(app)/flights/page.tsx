"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Siren, ChevronLeft, ChevronRight, Pencil, Plus, Radar } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Table, Td, Th, Tr, cn } from "@nfs/ui";
import { can } from "@nfs/auth";
import { addDays, formatDate, type Terminal } from "@nfs/db";
import type { Charter } from "@nfs/demo";
import { timingsFor } from "@nfs/db";
import { deriveStatus, flightaware, flightradar24 } from "@nfs/flights";
import { useHub } from "@/lib/store";
import { RequirePerm } from "@/components/guard";
import { AirlineChip, FlightStatusBadge, PersonLink } from "@/components/ops";
import { DatePicker } from "@/components/date-picker";
import { CharterBadge, CharterDialog } from "@/components/charter-dialog";

export default function FlightsPage() {
  return (
    <RequirePerm perm="staff.view">
      <React.Suspense fallback={null}>
        <Flights />
      </React.Suspense>
    </RequirePerm>
  );
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function Flights() {
  const hub = useHub();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const min = hub.ds.windowStart;
  const max = hub.ds.horizonEnd;
  const q = params.get("date");
  const date = q && DATE_RE.test(q) && q >= min && q <= max ? q : hub.today;
  const focus = params.get("focus");
  const setDate = React.useCallback(
    (d: string) => router.replace(d === hub.today ? pathname : `${pathname}?date=${d}`, { scroll: false }),
    [router, pathname, hub.today],
  );
  const [charter, setCharter] = React.useState<Charter | "new" | null>(null);
  const manage = can(hub.session?.role, "roster.edit");

  const map = new Map(hub.ds.airlines.map((a) => [a.code, a]));
  const flights = hub.ds.flights.filter((f) => f.date === date);
  const cancelled = hub.charters.filter((c) => c.date === date && c.status === "cancelled");
  const charterDays = React.useMemo(() => new Set(hub.charters.filter((c) => c.status !== "cancelled").map((c) => c.date)), [hub.charters]);
  const upcoming = hub.charters.filter((c) => c.date >= hub.today && c.date <= addDays(hub.today, 30) && c.status !== "cancelled");
  const live = flightradar24.configured() || flightaware.configured();
  const past = date < hub.today;

  React.useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(`flight-${focus}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focus, date]);

  return (
    <>
      <PageHeader
        eyebrow="Flight tracking"
        title="Above-the-wing departures"
        description="US Departures and International terminals. Status comes from gate logs as leads tap, shared with Rampline."
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="icon" disabled={date <= min} onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><ChevronLeft /></Button>
            <DatePicker value={date} onChange={setDate} min={min} max={max} today={hub.today} marks={charterDays} />
            <Button variant="outline" size="icon" disabled={date >= max} onClick={() => setDate(addDays(date, 1))} aria-label="Next day"><ChevronRight /></Button>
            {date !== hub.today ? <Button variant="secondary" size="sm" onClick={() => setDate(hub.today)}>Today</Button> : null}
            {manage ? <Button size="sm" onClick={() => setCharter("new")} className="ml-1"><Plus /> Add charter</Button> : null}
          </div>
        }
      />
      {charter ? <CharterDialog charter={charter === "new" ? undefined : charter} date={date} onClose={() => setCharter(null)} /> : null}

      <Card className="mb-5 flex items-center gap-3 border-brand-100 bg-brand-50 p-4">
        <Radar className="size-5 shrink-0 text-brand-600" />
        <p className="flex-1 text-sm text-brand-800">
          {past
            ? `Viewing ${formatDate(date, { weekday: "long", day: "numeric", month: "long" })}: filed gate records, times and delays as they happened. Open a flight for its full record.`
            : live
              ? "Live feeds connected."
              : "Flightradar24 and FlightAware connectors are built in (shared with Rampline) and switch on with the trial API keys. Until then, status is derived from the schedule and gate logs."}
        </p>
        <Badge tone={past ? "neutral" : live ? "ok" : "brand"}>{past ? "History" : live ? "Live" : "Schedule + gate log"}</Badge>
      </Card>

      {(["US", "INTL"] as Terminal[]).map((t) => {
        const list = flights.filter((f) => f.terminal === t);
        return (
          <Card key={t} className="mb-5">
            <CardHeader><div><CardTitle>{t === "US" ? "US Departures Terminal" : "International Terminal"}</CardTitle><CardDescription>{list.length} departures{list.some((f) => f.adhoc) ? ` · ${list.filter((f) => f.adhoc).length} charter` : ""}</CardDescription></div></CardHeader>
            <CardContent className="px-2 sm:px-5">
              {list.length === 0 ? <p className="px-2 pb-2 text-sm text-muted">No departures from this terminal on {formatDate(date)}.</p> : (
                <Table>
                  <thead><tr><Th>Flight</Th><Th>Destination</Th><Th className="hidden @5xl/main:table-cell">Aircraft</Th><Th className="hidden @4xl/main:table-cell">Inbound STA</Th><Th>STD</Th><Th>Gate</Th><Th className="hidden @4xl/main:table-cell">Lead</Th><Th className="hidden @5xl/main:table-cell">Pax</Th><Th>Status</Th></tr></thead>
                  <tbody>
                    {list.map((f) => {
                      const log = hub.logByFlight.get(f.id);
                      const s = deriveStatus(f, log, hub.today, hub.nowMin, timingsFor(hub.ds.airlines.find((a) => a.code === f.airline)));
                      const ch = f.adhoc ? hub.charters.find((c) => c.id === f.adhoc!.id) : undefined;
                      return (
                        <Tr key={f.id} id={`flight-${f.id}`} className={cn(focus === f.id && "bg-gold-100/60")}>
                          <Td>
                            <Link href={log?.status === "filed" ? `/records/${log.id}` : `/gate/${f.id}`} className="flex items-center gap-2 whitespace-nowrap font-semibold transition-colors hover:text-brand-600"><AirlineChip airline={map.get(f.airline)!} />{f.flightNo}{hub.alertsFor(f.id).length ? <Siren aria-label="Inbound alert from Rampline" className="size-4 shrink-0 text-bad" /> : null}</Link>
                          </Td>
                          <Td>
                            {f.destinationName} <span className="text-xs text-muted">{f.destination}</span>
                            {f.adhoc ? (
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                                <CharterBadge status={f.adhoc.status} />
                                <span className="truncate">{f.adhoc.operator}</span>
                                {manage && ch ? <button onClick={() => setCharter(ch)} className="cursor-pointer rounded p-0.5 text-muted transition-colors hover:text-brand-600" aria-label={`Edit charter ${f.flightNo}`}><Pencil className="size-3" /></button> : null}
                              </div>
                            ) : null}
                          </Td>
                          <Td className="hidden @5xl/main:table-cell text-xs">{f.aircraft}</Td>
                          <Td className="hidden @4xl/main:table-cell tabular">{log?.events.door_open ? <span title="Door open logged">{f.sta} <span className="text-xs text-muted">· door {log.events.door_open}</span></span> : f.sta}</Td>
                          <Td className="tabular font-semibold">{f.std}</Td>
                          <Td className="tabular">{f.gateFrom ? <span title={`Gate changed from ${f.gateFrom}`} className="inline-flex items-center gap-1 rounded-md bg-gold-100 px-1.5 py-0.5 font-semibold text-gold-700">{f.gate}<span className="text-[10px] font-medium line-through opacity-70">{f.gateFrom}</span></span> : f.gate}</Td>
                          <Td className="hidden @4xl/main:table-cell text-xs">{log ? <PersonLink p={hub.people.get(log.leadId)} /> : "—"}</Td>
                          <Td className="hidden @5xl/main:table-cell tabular text-xs">{log?.paxBoarded ?? "—"}/{log?.paxBooked ?? (f.adhoc ? f.paxBooked : "—")}</Td>
                          <Td><div className="flex items-center gap-1.5"><FlightStatusBadge status={s.status} />{log && log.delayMinutes > 0 ? <span className="text-[11px] font-semibold text-bad">+{log.delayMinutes}m</span> : null}</div></Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })}

      {cancelled.length ? (
        <Card className="mb-5">
          <CardHeader><div><CardTitle>Cancelled charters</CardTitle><CardDescription>Kept for the record; not counted in coverage</CardDescription></div></CardHeader>
          <CardContent className="space-y-2">
            {cancelled.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-lg border border-line p-2.5 text-sm">
                <span className="font-semibold text-muted line-through">{c.flightNo}</span>
                <span className="flex-1 truncate text-muted">{c.operator} · {c.destName} · STD {c.std}</span>
                <CharterBadge status="cancelled" />
                {manage ? <Button variant="ghost" size="icon" onClick={() => setCharter(c)} aria-label={`Edit ${c.flightNo}`}><Pencil /></Button> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div><CardTitle>Charters and ad-hoc flights · next 30 days</CardTitle><CardDescription>One-off flights outside the schedule. Gold dots on the calendar mark charter days.</CardDescription></div>
          {manage ? <Button variant="secondary" size="sm" onClick={() => setCharter("new")}><Plus /> Add charter</Button> : null}
        </CardHeader>
        <CardContent className="px-2 sm:px-5">
          {upcoming.length === 0 ? <p className="px-2 pb-2 text-sm text-muted">No charters booked in the next 30 days.</p> : (
            <Table>
              <thead><tr><Th>Date</Th><Th>Flight</Th><Th>Operator</Th><Th className="hidden @4xl/main:table-cell">To</Th><Th>STD</Th><Th className="hidden @4xl/main:table-cell">Pax</Th><Th>Status</Th>{manage ? <Th /> : null}</tr></thead>
              <tbody>
                {upcoming.map((c) => (
                  <Tr key={c.id}>
                    <Td className="whitespace-nowrap"><button onClick={() => setDate(c.date)} className="cursor-pointer font-semibold transition-colors hover:text-brand-600">{formatDate(c.date)}</button></Td>
                    <Td className="whitespace-nowrap font-semibold">{c.flightNo}</Td>
                    <Td className="max-w-56 truncate text-sm">{c.operator}{c.source === "rampline" ? <span className="ml-1.5 text-[11px] text-muted">via Rampline</span> : null}</Td>
                    <Td className="hidden @4xl/main:table-cell">{c.destName} <span className="text-xs text-muted">{c.dest}</span></Td>
                    <Td className="tabular">{c.std}</Td>
                    <Td className="hidden @4xl/main:table-cell tabular text-xs">{c.pax}</Td>
                    <Td><CharterBadge status={c.status} /></Td>
                    {manage ? <Td><Button variant="ghost" size="icon" onClick={() => setCharter(c)} aria-label={`Edit ${c.flightNo}`}><Pencil /></Button></Td> : null}
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
