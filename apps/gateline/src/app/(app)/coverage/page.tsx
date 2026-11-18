"use client";
import * as React from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { can } from "@nfs/auth";
import { WeekStrip, type WeekState } from "@/components/week-strip";
import { periodEnd, withPeriod } from "@/lib/periods";
import { applyAbsences } from "@/lib/absence";
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
  const maxWs = weekStart(hub.ds.horizonEnd);
  const editable = can(hub.session?.role, "roster.edit");
  const [withDrafts, setWithDrafts] = React.useState(true);
  const baseEnd = hub.ds.windowDays[hub.ds.windowDays.length - 1];
  const covers = (status: "draft" | "published", w: string) => hub.periods.filter((p) => p.status === status && p.start <= addDays(w, 6) && periodEnd(p) >= w);
  const weekList = React.useMemo(() => {
    const out: { ws: string; state: WeekState }[] = [];
    for (let w = hub.ds.windowStart; w <= maxWs; w = addDays(w, 7)) {
      const state: WeekState = addDays(w, 6) < hub.today ? "past" : covers("published", w).length ? "published" : covers("draft", w).length && editable ? "draft" : w <= baseEnd ? "rostered" : "none";
      out.push({ ws: w, state });
    }
    return out;
  }, [hub.periods, hub.ds.windowStart, maxWs, hub.today, baseEnd, editable]); // eslint-disable-line react-hooks/exhaustive-deps
  const drafts = editable ? covers("draft", ws) : [];
  const state = weekList.find((w) => w.ws === ws)?.state ?? "rostered";
  const notRostered = state === "none" && !(withDrafts && drafts.length);
  const mode = addDays(ws, 6) < hub.today ? "history" : ws > hub.today ? "predicted" : "live";

  const cells = React.useMemo(() => {
    let input = { airlines: hub.ds.airlines, people: hub.ds.people, flights: hub.ds.flights, roster: hub.ds.roster, reassignments: hub.reassignments };
    if (withDrafts) for (const d of drafts) input = applyAbsences(withPeriod(input, d), hub.absences);
    return coverageGrid(input, ws, 7);
  }, [hub.ds, hub.reassignments, ws, withDrafts, drafts.map((d) => d.id).join(), hub.absences]); // eslint-disable-line react-hooks/exhaustive-deps
  // keep the open dialog in sync with the latest coverage after a placement
  const liveCell = cell ? cells.find((c) => c.airline === cell.airline && c.date === cell.date && c.shift === cell.shift) ?? null : null;

  const active = cells.filter((c) => c.level !== "none");
  // Airlines with nobody rostered this week: their red is "no roster yet", not a real shortfall
  const unrosteredAirlines = mode === "predicted" && !notRostered
    ? hub.ds.airlines.filter((a) => !a.charter && cells.some((c) => c.airline === a.code && c.level !== "none") && cells.filter((c) => c.airline === a.code).every((c) => c.assigned === 0))
    : [];
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
        actions={<Button variant="secondary" size="sm" onClick={() => setWs(weekStart(hub.today))}>This week</Button>}
      />
      <div className="mb-4"><WeekStrip weeks={weekList} value={ws} onChange={setWs} today={hub.today} /></div>
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 text-sm">
        <Badge tone={mode === "history" ? "neutral" : mode === "live" ? "brand" : "gold"}>{mode === "history" ? "History" : mode === "live" ? "This week · live" : "Predicted"}</Badge>
        <p className="min-w-0 flex-1 text-muted">
          {mode === "history"
            ? "How coverage actually stood: the roster as worked, including sick calls and covers placed."
            : mode === "live"
              ? "Live: changes, absences and covers update this as they happen."
              : notRostered
                ? "No roster yet for this week, so there's nothing to predict from. Create one to see predicted coverage."
                : `Predicted from the ${state === "published" ? "published roster" : drafts.length && withDrafts ? "draft roster" : "engine roster"} against the flight schedule.${unrosteredAirlines.length ? ` Not rostered yet for this week: ${unrosteredAirlines.map((a) => a.code).join(", ")}, so they show as empty.` : ""}`}
        </p>
        {drafts.length ? (
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={withDrafts} onChange={(e) => setWithDrafts(e.target.checked)} className="size-4 accent-[var(--color-brand-500)]" /> Include draft{drafts.length > 1 ? "s" : ""} ({drafts.length})</label>
        ) : null}
        {notRostered && editable ? <Button size="sm" asChild><Link href={`/rosters?week=${ws}`}>Create roster</Link></Button> : null}
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 @2xl/main:grid-cols-4">
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

      <div className="mt-5 grid gap-5 @3xl/main:grid-cols-2">
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
