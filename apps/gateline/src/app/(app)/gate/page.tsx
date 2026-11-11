"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronRight, Smartphone } from "lucide-react";
import { Badge, Card, PageHeader, TabsList, TabsTrigger, Tabs, cn } from "@nfs/ui";
import { formatDate, shiftForStd, toMinutes } from "@nfs/db";
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
  const myShift = hub.ds.roster.find((r) => r.personId === me?.id && r.date === hub.today)?.shift;
  const [scope, setScope] = React.useState<"mine" | "all">(me?.role === "lead" ? "mine" : "all");
  const flights = hub.ds.flights
    .filter((f) => f.date === hub.today)
    .filter((f) => scope === "all" || (me?.trainedAirlines.includes(f.airline) ?? true));
  const airlines = new Map(hub.ds.airlines.map((a) => [a.code, a]));
  const nextUp = flights.find((f) => !hub.logByFlight.get(f.id)?.events.pushback && toMinutes(f.std) >= hub.nowMin - 30);

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        eyebrow={formatDate(hub.today, { weekday: "long", day: "numeric", month: "short" })}
        title="Gate log"
        description={me ? `${me.firstName}, ${myShift === "E" ? "you're on the early shift" : myShift === "L" ? "you're on the late shift" : "you're not rostered today"} · trained on ${me.trainedAirlines.join(", ")}` : undefined}
      />
      <Tabs value={scope} onValueChange={(v) => setScope(v as "mine" | "all")} className="mb-4">
        <TabsList className="w-full">
          <TabsTrigger value="mine" className="flex-1">My airlines</TabsTrigger>
          <TabsTrigger value="all" className="flex-1">All departures</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-2.5">
        {flights.map((f) => {
          const log = hub.logByFlight.get(f.id);
          const s = deriveStatus(f, log, hub.today, hub.nowMin);
          const a = airlines.get(f.airline)!;
          const tapped = log ? Object.keys(log.events).length : 0;
          const isNext = nextUp?.id === f.id;
          return (
            <Link key={f.id} href={`/gate/${f.id}`}>
              <Card className={cn("flex items-center gap-3 p-3.5 transition-colors hover:border-brand-400 hover:bg-brand-50", isNext && "border-brand-500 ring-2 ring-brand-100")}>
                <div className="grid w-14 shrink-0 place-items-center">
                  <span className="font-display text-lg font-semibold tabular">{f.std}</span>
                  <span className="text-[10px] font-semibold uppercase text-muted">{shiftForStd(f.std) === "E" ? "early" : "late"}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <AirlineChip airline={a} />
                    <span className="font-semibold tabular">{f.flightNo}</span>
                    {isNext ? <Badge tone="brand">Next</Badge> : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">{f.destinationName} · Gate {f.gate} · {f.aircraft}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <FlightStatusBadge status={s.status} />
                    <span className="text-[11px] text-muted">{tapped}/7 logged{log?.status === "filed" ? " · filed" : ""}</span>
                  </div>
                </div>
                <ChevronRight className="size-5 text-ink-400" />
              </Card>
            </Link>
          );
        })}
        {flights.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted"><Smartphone className="mx-auto mb-2 size-6 text-ink-300" />No departures for your airlines today.</Card>
        ) : null}
      </div>
    </div>
  );
}
