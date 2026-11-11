"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Camera, Check, Link2, Printer } from "lucide-react";
import { Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@nfs/ui";
import { GATE_EVENT_LABEL, GATE_EVENT_ORDER, formatDate, toMinutes, type TeamPosition } from "@nfs/db";
import { useHub, personName } from "@/lib/store";
import { RequirePerm } from "@/components/guard";
import { AirlineChip } from "@/components/ops";
import { FirstGlanceCredit, NfsWordmark } from "@/components/brand";
import { isNfsCause, slaMet, teamShortfall } from "@/lib/metrics";

const POS: Record<TeamPosition, string> = { lead: "Lead", gate: "Gate", jetBridge: "Jet bridge", counter: "Counter" };

export default function RecordPage() {
  return (
    <RequirePerm perm="staff.view">
      <Record />
    </RequirePerm>
  );
}

function Record() {
  const { id } = useParams<{ id: string }>();
  const hub = useHub();
  const [copied, setCopied] = React.useState(false);
  const log = hub.gateLogs.find((g) => g.id === decodeURIComponent(id));
  if (!log) return <p className="text-sm text-muted">Record not found.</p>;
  const f = hub.ds.flights.find((x) => x.id === log.flightId)!;
  const a = hub.ds.airlines.find((x) => x.code === log.airline)!;
  const std = toMinutes(f.std);
  const sla = slaMet(log, a);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild><Link href="/records"><ArrowLeft /> Records</Link></Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(window.location.href);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check /> : <Link2 />} {copied ? "Copied" : "Copy link"}
          </Button>
          <Button size="sm" onClick={() => window.print()}><Printer /> Print / PDF</Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-6">
          <div>
            <NfsWordmark />
            <h1 className="mt-4 flex items-center gap-2 text-2xl font-semibold"><AirlineChip airline={a} size="md" /> {f.flightNo}</h1>
            <p className="mt-1 text-sm text-muted">{formatDate(f.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · NAS → {f.destinationName} ({f.destination}) · {f.aircraft} · Gate {f.gate}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Flight record</p>
            <p className="font-mono text-xs text-muted">{log.id}</p>
            <div className="mt-2 flex justify-end gap-1.5">
              {log.delayMinutes === 0 ? <Badge tone="ok">On time</Badge> : <Badge tone={isNfsCause(log.delayCause) ? "warn" : "neutral"}>+{log.delayMinutes} min · {log.delayCause}</Badge>}
              <Badge tone={sla ? "ok" : "warn"}>{sla ? "Team met SLA" : `Short: ${teamShortfall(log, a).join(", ")}`}</Badge>
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-6 md:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-semibold">Timeline <span className="font-normal text-muted">· STD {f.std}</span></h3>
            <ol className="relative space-y-3 border-l-2 border-line pl-5">
              {GATE_EVENT_ORDER.map((ev) => {
                const at = log.events[ev];
                const rel = at ? toMinutes(at) - std : null;
                return (
                  <li key={ev} className="relative">
                    <span className={`absolute -left-[27px] top-1 size-3 rounded-full border-2 border-card ${at ? "bg-brand-500" : "bg-line"}`} />
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{GATE_EVENT_LABEL[ev]}</span>
                      <span className="tabular"><span className="font-semibold">{at ?? "—"}</span>{rel !== null ? <span className="ml-1.5 text-xs text-muted">{rel === 0 ? "STD" : `${rel > 0 ? "+" : ""}${rel}m`}</span> : null}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="space-y-5">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Team</h3>
              <div className="space-y-1.5">
                {[...new Set(log.team.map((t) => t.personId))].map((pid) => {
                  const roles = log.team.filter((t) => t.personId === pid).map((t) => t.position);
                  return (
                    <div key={pid} className="flex items-center gap-2 text-sm">
                      <Avatar name={personName(hub.people.get(pid))} className="size-7" tone={roles.includes("lead") ? "dark" : "brand"} />
                      <span className="flex-1">{personName(hub.people.get(pid))}</span>
                      <span className="flex gap-1">{roles.map((r) => <Badge key={r}>{POS[r]}</Badge>)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-surface p-2"><div className="font-display text-lg font-semibold tabular">{f.paxBooked}</div><div className="text-[10px] font-semibold uppercase text-muted">Booked</div></div>
              <div className="rounded-lg bg-surface p-2"><div className="font-display text-lg font-semibold tabular">{log.paxBoarded ?? "—"}</div><div className="text-[10px] font-semibold uppercase text-muted">Boarded</div></div>
            </div>
          </div>
        </div>

        <Card className="mx-6 mb-6 shadow-none">
          <CardHeader><CardTitle>Passenger discrepancies & issues</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {log.discrepancies.length === 0 ? <p className="text-sm text-muted">None recorded.</p> : null}
            {log.discrepancies.map((d) => (
              <div key={d.id} className="rounded-lg border border-line p-2.5 text-sm">
                <p className="font-semibold">{d.type} <span className="font-normal text-muted">· {d.at}</span>{d.hasPhoto ? <Camera className="ml-1 inline size-3.5 text-muted" /> : null}</p>
                <p className="text-xs text-muted">{d.note}</p>
              </div>
            ))}
            {log.notes ? <p className="rounded-lg bg-surface p-2.5 text-sm">{log.notes}</p> : null}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface px-6 py-3 text-[11px] text-muted">
          <span>Filed by {personName(hub.people.get(log.leadId))}{log.filedAt ? ` at ${log.filedAt}` : ""} · {log.source === "device" ? "logged on device" : "historical record"}</span>
          <FirstGlanceCredit />
        </div>
      </Card>
    </div>
  );
}
