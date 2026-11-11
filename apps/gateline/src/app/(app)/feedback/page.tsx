"use client";
import * as React from "react";
import Link from "next/link";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Badge, Button, Card, PageHeader, Select, Stat, cn } from "@nfs/ui";
import { can } from "@nfs/auth";
import { formatDate } from "@nfs/db";
import { useHub, personName } from "@/lib/store";
import { RequirePerm } from "@/components/guard";
import { AirlineChip } from "@/components/ops";

export default function FeedbackPage() {
  return (
    <RequirePerm perm="analytics.view">
      <Feedback />
    </RequirePerm>
  );
}

function Feedback() {
  const hub = useHub();
  const [airline, setAirline] = React.useState("");
  const [kind, setKind] = React.useState("");
  const map = new Map(hub.ds.airlines.map((a) => [a.code, a]));
  const items = hub.feedback.filter((f) => (!airline || f.airline === airline) && (!kind || f.kind === kind));
  const manage = can(hub.session?.role, "feedback.manage");

  return (
    <>
      <PageHeader eyebrow="Airline feedback log" title="Station manager feedback" description="Complaints and praise from airline station managers, tied to the flight record so every comment has the facts beside it." />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Praise" value={hub.feedback.filter((f) => f.kind === "praise").length} tone="ok" icon={<ThumbsUp />} />
        <Stat label="Complaints" value={hub.feedback.filter((f) => f.kind === "complaint").length} tone="bad" icon={<ThumbsDown />} />
        <Stat label="Open" value={hub.feedback.filter((f) => f.status === "open").length} tone="warn" />
      </div>
      <Card className="mb-4 flex flex-wrap gap-2 p-3">
        <Select value={airline} onChange={(e) => setAirline(e.target.value)} aria-label="Airline"><option value="">All airlines</option>{hub.ds.airlines.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</Select>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type"><option value="">Praise and complaints</option><option value="praise">Praise</option><option value="complaint">Complaints</option></Select>
      </Card>
      <div className="space-y-2.5">
        {items.map((f) => {
          const log = f.flightId ? hub.logByFlight.get(f.flightId) : undefined;
          const flight = hub.ds.flights.find((x) => x.id === f.flightId);
          return (
            <Card key={f.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", f.kind === "praise" ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad")}>
                {f.kind === "praise" ? <ThumbsUp className="size-4" /> : <ThumbsDown className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <AirlineChip airline={map.get(f.airline)!} />
                  <span>{formatDate(f.date)}</span>
                  <span>· from {f.from}</span>
                  {flight && log ? <Link href={`/records/${log.id}`} className="font-semibold text-brand-600 transition-colors hover:text-brand-700">{flight.flightNo} record</Link> : null}
                  <span>· lead {personName(hub.people.get(f.personIds[0]))}</span>
                </div>
                <p className="mt-1 text-sm">{f.summary}</p>
                {log ? <p className="mt-0.5 text-xs text-muted">Record: {log.delayMinutes ? `+${log.delayMinutes} min, ${log.delayCause}` : "on time"} · door close {log.events.door_close}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={f.status === "open" ? "warn" : f.status === "reviewed" ? "brand" : "neutral"}>{f.status}</Badge>
                {manage && f.status !== "closed" ? (
                  <Button variant="outline" size="sm" onClick={() => hub.setFeedbackStatus(f.id, f.status === "open" ? "reviewed" : "closed")}>{f.status === "open" ? "Mark reviewed" : "Close"}</Button>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
