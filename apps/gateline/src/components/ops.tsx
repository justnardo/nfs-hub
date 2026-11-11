"use client";
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Ban, CheckCircle2, ShieldAlert } from "lucide-react";
import { Avatar, Badge, Button, Dialog, DialogContent, Label, Textarea, cn } from "@nfs/ui";
import { can } from "@nfs/auth";
import { SHIFTS, formatDate, type Airline, type FlightStatus, type Person } from "@nfs/db";
import { checkReassignment, type CoverageCell, type CoverageLevel, type ReassignCheck } from "@nfs/rules";
import { useHub, personName } from "@/lib/store";

export function AirlineChip({ airline, size = "sm" }: { airline: Airline; size?: "sm" | "md" }) {
  const [failed, setFailed] = React.useState(false);
  const tile =
    airline.logoUrl && !failed ? (
      <span
        title={airline.name}
        className={cn("inline-grid shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-white", size === "md" ? "h-8 w-12 p-1" : "h-6 w-9 p-0.5")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={airline.logoUrl} alt={airline.name} loading="lazy" onError={() => setFailed(true)} className="max-h-full max-w-full object-contain" />
      </span>
    ) : (
      <span title={airline.name} className={cn("inline-grid shrink-0 place-items-center rounded-md font-display font-bold text-white", size === "md" ? "h-7 min-w-9 px-1.5 text-[11px]" : "h-5 min-w-7 px-1 text-[9.5px]")} style={{ background: airline.colour }}>
        {airline.code}
      </span>
    );
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold", size === "md" ? "text-sm" : "text-xs")}>
      {tile}
      {size === "md" ? airline.name : null}
    </span>
  );
}

const STATUS_TONE: Record<FlightStatus, "neutral" | "brand" | "ok" | "warn" | "bad" | "gold" | "dark"> = {
  Scheduled: "neutral",
  "Check-in open": "brand",
  Boarding: "gold",
  "Final call": "gold",
  "Door closed": "dark",
  Departed: "ok",
  Delayed: "bad",
  Cancelled: "bad",
};
export function FlightStatusBadge({ status }: { status: FlightStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>;
}

export const LEVEL_STYLE: Record<CoverageLevel, string> = {
  green: "bg-ok-soft text-green-900 border-green-200 hover:border-green-500",
  amber: "bg-warn-soft text-amber-900 border-amber-200 hover:border-amber-500",
  red: "bg-bad-soft text-red-900 border-red-200 hover:border-red-500",
  none: "bg-surface text-ink-300 border-line",
};

export function ShiftChip({ shift }: { shift: string }) {
  const styles: Record<string, string> = {
    E: "bg-brand-100 text-brand-800",
    L: "bg-ink-800 text-white",
    M: "bg-brand-50 text-brand-700",
    O: "bg-transparent text-ink-300",
    V: "bg-gold-100 text-gold-700",
  };
  const label: Record<string, string> = { E: "E", L: "L", M: "M", O: "off", V: "VAC" };
  return <span className={cn("inline-grid h-7 min-w-9 place-items-center rounded-md px-1.5 text-[11px] font-bold", styles[shift] ?? "")}>{label[shift] ?? shift}</span>;
}

/* ---------------- Coverage heatmap ---------------- */
export function CoverageHeatmap({ cells, days, onCell, compact = false }: { cells: CoverageCell[]; days: string[]; onCell?: (c: CoverageCell) => void; compact?: boolean }) {
  const { ds, today } = useHub();
  const get = (a: string, d: string, s: "E" | "L") => cells.find((c) => c.airline === a && c.date === d && c.shift === s);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="w-36 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">Airline</th>
            {days.map((d) => (
              <th key={d} colSpan={2} className={cn("pb-1 text-center text-[11px] font-semibold", d === today ? "text-brand-600" : "text-muted")}>
                {formatDate(d, compact ? { weekday: "short" } : { weekday: "short", day: "numeric" })}
                {d === today ? <span className="ml-1 rounded bg-brand-500 px-1 text-[9px] text-white">TODAY</span> : null}
                <div className="mt-0.5 grid grid-cols-2 text-[9.5px] font-medium text-ink-400"><span>E</span><span>L</span></div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ds.airlines.map((a) => (
            <tr key={a.code}>
              <td className="pr-2"><AirlineChip airline={a} size={compact ? "sm" : "md"} /></td>
              {days.flatMap((d) =>
                (["E", "L"] as const).map((s) => {
                  const c = get(a.code, d, s);
                  if (!c) return <td key={d + s} />;
                  const leadGap = c.leadsAssigned < c.leadsRequired;
                  return (
                    <td key={d + s} className="p-0">
                      <button
                        disabled={c.level === "none" || !onCell}
                        onClick={() => onCell?.(c)}
                        title={`${a.name} · ${formatDate(d)} · ${SHIFTS[s].label}: ${c.assigned}/${c.required} agents, lead ${c.leadsAssigned}/${c.leadsRequired}`}
                        className={cn(
                          "relative flex h-10 w-full min-w-11 flex-col items-center justify-center rounded-md border text-[11px] font-bold tabular transition-colors",
                          LEVEL_STYLE[c.level],
                          onCell && c.level !== "none" ? "cursor-pointer" : "cursor-default",
                        )}
                      >
                        {c.level === "none" ? "·" : `${c.assigned}/${c.required}`}
                        {c.coversIn.length ? <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-brand-500" /> : null}
                        {leadGap && c.level !== "none" ? <span className="text-[8.5px] font-semibold leading-none opacity-80">no lead</span> : null}
                      </button>
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-muted">
        <Legend cls="bg-ok-soft border-green-200" label="SLA met" />
        <Legend cls="bg-warn-soft border-amber-200" label="Short by up to 25% or no lead" />
        <Legend cls="bg-bad-soft border-red-200" label="Below 75% of SLA" />
        <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-brand-500" /> Cover placed</span>
        <span>Cells show trained agents on shift ÷ SLA peak demand</span>
      </div>
    </div>
  );
}
function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-3 rounded border", cls)} /> {label}
    </span>
  );
}

/* ---------------- Protected reassignment ---------------- */
export function ReassignDialog({ cell, open, onOpenChange }: { cell: CoverageCell | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const hub = useHub();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    setSelected(null);
    setReason("");
  }, [cell]);
  if (!cell) return null;
  const airline = hub.ds.airlines.find((a) => a.code === cell.airline)!;
  const input = { airlines: hub.ds.airlines, people: hub.ds.people, flights: hub.ds.flights, roster: hub.ds.roster, reassignments: hub.reassignments };
  const flights = hub.ds.flights.filter((f) => cell.flightIds.includes(f.id));

  // candidates: everyone rostered on this shift who isn't on this airline's core team
  const onShift = new Set(hub.ds.roster.filter((r) => r.date === cell.date && r.shift === cell.shift).map((r) => r.personId));
  const already = new Set(hub.reassignments.filter((r) => r.date === cell.date && r.shift === cell.shift).map((r) => r.personId));
  const candidates = hub.ds.people
    .filter((p) => (p.role === "agent" || p.role === "lead") && onShift.has(p.id) && p.coreAirline !== airline.code && !already.has(p.id))
    .map((p) => ({ p, check: checkReassignment(input, p, airline, cell.date, cell.shift) }))
    .sort((a, b) => order(a.check) - order(b.check) || Number(!!a.p.coreAirline) - Number(!!b.p.coreAirline));

  const placed = hub.reassignments.filter((r) => r.date === cell.date && r.shift === cell.shift && r.toAirline === airline.code);
  const chosen = candidates.find((c) => c.p.id === selected);
  const role = hub.session?.role;
  const needsOverride = chosen?.check.verdict === "warn";
  const canOverride = can(role, "reassign.override");
  const canApprove = can(role, "reassign.approve");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        title={`${airline.name} · ${formatDate(cell.date, { weekday: "long", day: "numeric", month: "short" })} · ${SHIFTS[cell.shift].label}`}
        description={`${cell.assigned} of ${cell.required} agents against SLA · lead ${cell.leadsAssigned}/${cell.leadsRequired} · ${flights.map((f) => `${f.flightNo} ${f.std}`).join(", ") || "no departures"}`}
      >
        {placed.length ? (
          <div className="mb-4 rounded-lg border border-brand-100 bg-brand-50 p-3">
            <p className="text-xs font-semibold text-brand-800">Cover already placed</p>
            {placed.map((r) => (
              <div key={r.id} className="mt-1.5 flex items-center justify-between text-sm">
                <span>{personName(hub.people.get(r.personId))} from {r.fromAirline}{r.overrideReason ? <span className="text-xs text-muted"> · override: {r.overrideReason}</span> : null}</span>
                {canApprove ? <Button variant="ghost" size="sm" onClick={() => hub.removeReassignment(r.id)}>Undo</Button> : null}
              </div>
            ))}
          </div>
        ) : null}

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Who can cover · on shift, ranked by impact</p>
        <div className="max-h-[42vh] space-y-1.5 overflow-y-auto pr-1">
          {candidates.length === 0 ? <p className="text-sm text-muted">Nobody else is rostered on this shift.</p> : null}
          {candidates.map(({ p, check }) => (
            <button
              key={p.id}
              disabled={check.verdict === "block"}
              onClick={() => setSelected(p.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-2.5 text-left transition-colors",
                check.verdict === "block" ? "cursor-not-allowed border-line bg-surface opacity-60" : "cursor-pointer border-line bg-card hover:border-brand-400 hover:bg-brand-50",
                selected === p.id && "border-brand-500 bg-brand-50 ring-2 ring-brand-100",
              )}
            >
              <Avatar name={personName(p)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                  {personName(p)}
                  <Badge tone={p.coreAirline ? "neutral" : "brand"}>{p.coreAirline ? `Core ${p.coreAirline}` : "Float pool"}</Badge>
                  {p.role === "lead" ? <Badge tone="dark">Lead</Badge> : null}
                </div>
                <ul className="mt-0.5 space-y-0.5">
                  {check.notes.map((n) => <li key={n} className="text-xs text-muted">{n}</li>)}
                </ul>
              </div>
              <Verdict check={check} />
            </button>
          ))}
        </div>

        {chosen ? (
          <div className="mt-4 space-y-3 border-t border-line pt-4">
            {needsOverride ? (
              <div className="rounded-lg border border-amber-200 bg-warn-soft p-3 text-sm text-amber-900">
                <p className="flex items-center gap-1.5 font-semibold"><ShieldAlert className="size-4" /> Protected core agent</p>
                <p className="mt-1 text-xs">Moving {chosen.p.firstName} leaves {chosen.p.coreAirline} below SLA. {canOverride ? "A manager override with a reason is recorded against this move." : "Only a manager can override — send as a request."}</p>
              </div>
            ) : null}
            {needsOverride && canOverride ? (
              <div>
                <Label htmlFor="reason">Override reason</Label>
                <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. UA flight delayed 2h, core team released early" className="mt-1" />
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
              <Button
                disabled={(needsOverride && (!canOverride || reason.trim().length < 4)) || !can(role, "reassign.request")}
                onClick={() => {
                  hub.addReassignment({
                    date: cell.date,
                    shift: cell.shift,
                    personId: chosen.p.id,
                    fromAirline: chosen.p.coreAirline ?? "POOL",
                    toAirline: airline.code,
                    overrideReason: needsOverride ? reason.trim() : null,
                    approvedBy: hub.session?.name ?? "",
                  });
                  setSelected(null);
                }}
              >
                {needsOverride ? "Override and place cover" : `Place ${chosen.p.firstName} on ${airline.code}`}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function order(c: ReassignCheck) {
  return c.verdict === "allow" ? 0 : c.verdict === "warn" ? 1 : 2;
}

function Verdict({ check }: { check: ReassignCheck }) {
  if (check.verdict === "allow") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-ok"><CheckCircle2 className="size-4" /> Safe</span>;
  if (check.verdict === "warn") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-warn"><AlertTriangle className="size-4" /> Warn</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-semibold text-bad"><Ban className="size-4" /> Blocked</span>;
}

export function PersonLink({ p }: { p?: Person | null }) {
  if (!p) return <span className="text-muted">—</span>;
  return (
    <Link href={`/agents/${p.id}`} className="font-medium text-fg transition-colors hover:text-brand-600">
      {personName(p)}
    </Link>
  );
}
