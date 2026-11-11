"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge, Card, PageHeader, Progress } from "@nfs/ui";
import { addDays } from "@nfs/db";
import { useHub } from "@/lib/store";
import { RequirePerm } from "@/components/guard";
import { AirlineChip } from "@/components/ops";
import { otpTone, pct, summarise } from "@/lib/metrics";

export default function AirlinesPage() {
  return (
    <RequirePerm perm="staff.view">
      <Airlines />
    </RequirePerm>
  );
}

function Airlines() {
  const hub = useHub();
  const map = new Map(hub.ds.airlines.map((a) => [a.code, a]));
  const since = addDays(hub.today, -14);
  return (
    <>
      <PageHeader eyebrow="Airline profiles" title="Airlines above the wing" description="Each carrier's SLA minimums, training requirements, core team and station manager expectations. Airline-specific teams are the core unit." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {hub.ds.airlines.map((a) => {
          const core = hub.ds.people.filter((p) => p.coreAirline === a.code);
          const backup = hub.ds.people.filter((p) => p.coreAirline !== a.code && p.trainedAirlines.includes(a.code) && (p.role === "agent" || p.role === "lead"));
          const s = summarise(hub.gateLogs.filter((g) => g.airline === a.code && g.date >= since), map);
          const daily = hub.ds.flights.filter((f) => f.airline === a.code && f.date >= hub.today && f.date < addDays(hub.today, 7)).length;
          return (
            <Link key={a.code} href={`/airlines/${a.code}`} className="group">
              <Card className="h-full p-5 transition-colors group-hover:border-brand-400">
                <div className="flex items-start justify-between">
                  <AirlineChip airline={a} size="md" />
                  <Badge tone={a.terminal === "US" ? "dark" : "neutral"}>{a.terminal === "US" ? "US Departures" : "International"}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {[
                    ["Counter", a.sla.counter],
                    ["Gate", a.sla.gate],
                    ["Jet bridge", a.sla.jetBridge],
                    ["Lead", a.sla.lead],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-surface py-2">
                      <div className="font-display text-lg font-semibold tabular">{v}</div>
                      <div className="text-[10px] font-semibold uppercase text-muted">{k}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-1.5 text-sm">
                  <Row k="Core team" v={`${core.filter((p) => p.role === "lead").length} leads · ${core.filter((p) => p.role === "agent").length} agents`} />
                  <Row k="Qualified backup" v={`${backup.length} staff`} />
                  <Row k="Departures next 7 days" v={String(daily)} />
                </div>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs"><span className="font-semibold text-muted">On-time (D0), 14 days</span><span className="font-semibold tabular">{pct(s.d0)}</span></div>
                  <Progress value={s.d0} tone={otpTone(s.d0)} />
                </div>
                <div className="mt-4 flex items-center justify-between">
                  {!a.slaConfirmed ? <Badge tone="gold">SLA pending NFS</Badge> : <span />}
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 transition-colors group-hover:text-brand-700">Profile <ArrowRight className="size-3.5" /></span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  );
}
