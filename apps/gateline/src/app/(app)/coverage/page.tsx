"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Stat } from "@nfs/ui";
import { addDays, formatDate, rangeDays, weekStart } from "@nfs/db";
import { coverageGrid, type CoverageCell } from "@nfs/rules";
import { useHub, personName } from "@/lib/store";
import { AirlineChip, CoverageHeatmap, ReassignDialog } from "@/components/ops";

export default function CoveragePage() {
  const hub = useHub();
  const [ws, setWs] = React.useState(() => weekStart(hub.today));
  const [cell, setCell] = React.useState<CoverageCell | null>(null);
  const days = rangeDays(ws, 7);
  const minWs = hub.ds.windowStart;
  const maxWs = addDays(hub.ds.windowStart, 21);

  const cells = React.useMemo(
    () => coverageGrid({ airlines: hub.ds.airlines, people: hub.ds.people, flights: hub.ds.flights, roster: hub.ds.roster, reassignments: hub.reassignments }, ws, 7),
    [hub.ds, hub.reassignments, ws],
  );
  // keep the open dialog in sync with the latest coverage after a placement
  const liveCell = cell ? cells.find((c) => c.airline === cell.airline && c.date === cell.date && c.shift === cell.shift) ?? null : null;

  const active = cells.filter((c) => c.level !== "none");
  const count = (l: string) => active.filter((c) => c.level === l).length;
  const upcomingGaps = active
    .filter((c) => c.level !== "green" && c.date >= hub.today)
    .sort((a, b) => (a.date + a.shift).localeCompare(b.date + b.shift))
    .slice(0, 8);
  const weekMoves = hub.reassignments.filter((r) => days.includes(r.date));

  return (
    <>
      <PageHeader
        eyebrow="Protected coverage"
        title="SLA coverage heatmap"
        description="Trained, rostered agents per airline and shift against the airline's SLA peak demand. Untrained or expired staff never count, and agents helping another team don't count for their own."
        actions={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" disabled={ws <= minWs} onClick={() => setWs(addDays(ws, -7))} aria-label="Previous week"><ChevronLeft /></Button>
            <span className="min-w-40 text-center text-sm font-semibold tabular">{formatDate(ws, { day: "numeric", month: "short" })} – {formatDate(addDays(ws, 6), { day: "numeric", month: "short" })}</span>
            <Button variant="outline" size="icon" disabled={ws >= maxWs} onClick={() => setWs(addDays(ws, 7))} aria-label="Next week"><ChevronRight /></Button>
            <Button variant="secondary" size="sm" onClick={() => setWs(weekStart(hub.today))}>This week</Button>
          </div>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Shifts at SLA" value={count("green")} tone="ok" sub={`of ${active.length} operating shifts`} />
        <Stat label="Short (amber)" value={count("amber")} tone="warn" sub="within 25% or no lead" />
        <Stat label="Critical (red)" value={count("red")} tone="bad" sub="below 75% of SLA" />
        <Stat label="Covers placed" value={weekMoves.length} tone="brand" sub={weekMoves.filter((m) => m.overrideReason).length ? `${weekMoves.filter((m) => m.overrideReason).length} with manager override` : "no overrides"} />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Week of {formatDate(ws, { day: "numeric", month: "long" })}</CardTitle>
            <CardDescription>Tap an amber or red cell to see who can cover. Core agents are protected; untrained agents are blocked.</CardDescription>
          </div>
          <Badge tone="gold">SLA figures pending NFS confirmation</Badge>
        </CardHeader>
        <CardContent>
          <CoverageHeatmap cells={cells} days={days} onCell={setCell} />
        </CardContent>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>Next gaps to fix</CardTitle><CardDescription>From today forward, in time order</CardDescription></div></CardHeader>
          <CardContent className="space-y-1.5">
            {upcomingGaps.length === 0 ? <p className="text-sm text-muted">Every remaining shift this week meets SLA.</p> : null}
            {upcomingGaps.map((c) => {
              const a = hub.ds.airlines.find((x) => x.code === c.airline)!;
              return (
                <button key={c.airline + c.date + c.shift} onClick={() => setCell(c)} className="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2 text-left transition-colors hover:border-brand-400 hover:bg-brand-50 cursor-pointer">
                  <AirlineChip airline={a} />
                  <span className="flex-1 text-sm">{formatDate(c.date)} · {c.shift === "E" ? "Early" : "Late"}</span>
                  <Badge tone={c.level === "red" ? "bad" : "warn"}>{c.assigned}/{c.required}{c.leadsAssigned < c.leadsRequired ? " · no lead" : ""}</Badge>
                </button>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Reassignment log</CardTitle><CardDescription>Every move is recorded and published to the hub event log</CardDescription></div><ShieldCheck className="size-5 text-brand-500" /></CardHeader>
          <CardContent className="space-y-2">
            {weekMoves.length === 0 ? <p className="text-sm text-muted">No covers placed this week yet.</p> : null}
            {weekMoves.map((m) => (
              <div key={m.id} className="rounded-lg border border-line px-3 py-2 text-sm">
                <span className="font-semibold">{personName(hub.people.get(m.personId))}</span> {m.fromAirline} → {m.toAirline} · {formatDate(m.date)} {m.shift === "E" ? "early" : "late"}
                <div className="text-xs text-muted">Approved by {m.approvedBy}{m.overrideReason ? ` · Override: ${m.overrideReason}` : ""}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <ReassignDialog cell={liveCell} open={!!cell} onOpenChange={(v) => !v && setCell(null)} />
    </>
  );
}
