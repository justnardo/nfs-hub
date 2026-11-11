"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Radar } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Table, Td, Th, Tr } from "@nfs/ui";
import { addDays, formatDate, type Terminal } from "@nfs/db";
import { deriveStatus, flightaware, flightradar24 } from "@nfs/flights";
import { useHub } from "@/lib/store";
import { RequirePerm } from "@/components/guard";
import { AirlineChip, FlightStatusBadge, PersonLink } from "@/components/ops";

export default function FlightsPage() {
  return (
    <RequirePerm perm="staff.view">
      <Flights />
    </RequirePerm>
  );
}

function Flights() {
  const hub = useHub();
  const [date, setDate] = React.useState(hub.today);
  const map = new Map(hub.ds.airlines.map((a) => [a.code, a]));
  const flights = hub.ds.flights.filter((f) => f.date === date);
  const live = flightradar24.configured() || flightaware.configured();

  return (
    <>
      <PageHeader
        eyebrow="Flight tracking"
        title="Above-the-wing departures"
        description="US Departures and International terminals. Status comes from gate logs as leads tap, shared with Rampline."
        actions={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" disabled={date <= hub.ds.windowStart} onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><ChevronLeft /></Button>
            <span className="min-w-36 text-center text-sm font-semibold">{formatDate(date, { weekday: "short", day: "numeric", month: "short" })}</span>
            <Button variant="outline" size="icon" disabled={date >= hub.ds.windowDays[hub.ds.windowDays.length - 1]} onClick={() => setDate(addDays(date, 1))} aria-label="Next day"><ChevronRight /></Button>
            {date !== hub.today ? <Button variant="secondary" size="sm" onClick={() => setDate(hub.today)}>Today</Button> : null}
          </div>
        }
      />
      <Card className="mb-5 flex items-center gap-3 border-brand-100 bg-brand-50 p-4">
        <Radar className="size-5 shrink-0 text-brand-600" />
        <p className="flex-1 text-sm text-brand-800">
          {live ? "Live feeds connected." : "Flightradar24 and FlightAware connectors are built in (shared with Rampline) and switch on with the trial API keys. Until then, status is derived from the schedule and gate logs."}
        </p>
        <Badge tone={live ? "ok" : "brand"}>{live ? "Live" : "Schedule + gate log"}</Badge>
      </Card>
      {(["US", "INTL"] as Terminal[]).map((t) => {
        const list = flights.filter((f) => f.terminal === t);
        return (
          <Card key={t} className="mb-5">
            <CardHeader><div><CardTitle>{t === "US" ? "US Departures Terminal" : "International Terminal"}</CardTitle><CardDescription>{list.length} departures</CardDescription></div></CardHeader>
            <CardContent className="px-2 sm:px-5">
              <Table>
                <thead><tr><Th>Flight</Th><Th>Destination</Th><Th>Aircraft</Th><Th>Inbound STA</Th><Th>STD</Th><Th>Gate</Th><Th>Lead</Th><Th>Pax</Th><Th>Status</Th></tr></thead>
                <tbody>
                  {list.map((f) => {
                    const log = hub.logByFlight.get(f.id);
                    const s = deriveStatus(f, log, hub.today, hub.nowMin);
                    return (
                      <Tr key={f.id}>
                        <Td><Link href={log?.status === "filed" ? `/records/${log.id}` : `/gate/${f.id}`} className="flex items-center gap-2 font-semibold transition-colors hover:text-brand-600"><AirlineChip airline={map.get(f.airline)!} />{f.flightNo}</Link></Td>
                        <Td>{f.destinationName} <span className="text-xs text-muted">{f.destination}</span></Td>
                        <Td className="text-xs">{f.aircraft}</Td>
                        <Td className="tabular">{log?.events.door_open ? <span title="Door open logged">{f.sta} <span className="text-xs text-muted">· door {log.events.door_open}</span></span> : f.sta}</Td>
                        <Td className="tabular font-semibold">{f.std}</Td>
                        <Td className="tabular">{f.gate}</Td>
                        <Td className="text-xs">{log ? <PersonLink p={hub.people.get(log.leadId)} /> : "—"}</Td>
                        <Td className="tabular text-xs">{log?.paxBoarded ?? "—"}/{f.paxBooked}</Td>
                        <Td><div className="flex items-center gap-1.5"><FlightStatusBadge status={s.status} />{log && log.delayMinutes > 0 ? <span className="text-[11px] font-semibold text-bad">+{log.delayMinutes}m</span> : null}</div></Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
