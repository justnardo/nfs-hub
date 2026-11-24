"use client";
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Ban, CheckCircle2, Lock, ShieldAlert, Undo2 } from "lucide-react";
import { Avatar, Badge, Button, Dialog, DialogContent, Label, Textarea, cn } from "@nfs/ui";
import { can } from "@nfs/auth";
import { SHIFTS, formatDate, type Airline, type FlightStatus, type Person } from "@nfs/db";
import { checkReassignment, gapText, suggestFixes, type CoverageCell, type CoverageLevel } from "@nfs/rules";
import type { CellChange } from "@/lib/periods";
import { flash, markChanged } from "./flash";
import { slaMet } from "@/lib/metrics";
import { ABSENCE_TYPES } from "@/lib/absence";
import { useHub, useEngineInput, personName } from "@/lib/store";

export function AirlineChip({ airline, size = "sm" }: { airline: Airline; size?: "sm" | "md" | "lg" }) {
  const [failed, setFailed] = React.useState(false);
  const tile =
    airline.logoUrl && !failed ? (
      <span
        title={airline.name}
        className={cn("inline-grid shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-white", size === "lg" ? "h-11 w-14 p-1.5" : size === "md" ? "h-8 w-12 p-1" : "h-6 w-9 p-0.5")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={airline.logoUrl} alt={airline.name} loading="lazy" onError={() => setFailed(true)} className="max-h-full max-w-full object-contain" />
      </span>
    ) : (
      <span title={airline.name} className={cn("inline-grid shrink-0 place-items-center rounded-md font-display font-bold text-white", size === "lg" ? "h-11 min-w-14 px-2 text-sm" : size === "md" ? "h-7 min-w-9 px-1.5 text-[11px]" : "h-5 min-w-7 px-1 text-[9.5px]")} style={{ background: airline.colour }}>
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
  "Check-in closed": "neutral",
  Boarding: "gold",
  "Final call": "gold",
  "Door closed": "dark",
  Departed: "ok",
  Delayed: "bad",
  Cancelled: "bad",
  "Remain overnight": "dark",
  Arriving: "brand",
  Arrived: "ok",
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

/** "07:00-15:00" → "07–15" for a roster cell; keeps minutes when they aren't on the hour. */
export function shortSpan(time: string) {
  const [a, b] = time.split("-");
  const f = (t: string) => (t.endsWith(":00") ? t.slice(0, 2) : t);
  return `${f(a)}–${f(b)}`;
}

export function ShiftChip({ shift, time }: { shift: string; time?: string }) {
  const styles: Record<string, string> = {
    E: "bg-brand-100 text-brand-800",
    L: "bg-ink-800 text-white",
    M: "bg-brand-50 text-brand-700",
    O: "bg-transparent text-ink-300",
    V: "bg-gold-100 text-gold-700",
  };
  const label: Record<string, string> = { E: "E", L: "L", M: "M", O: "off", V: "VAC" };
  return <span title={time ? time.replace("-", "–") : undefined} className={cn("inline-grid h-7 min-w-9 place-items-center rounded-md px-1.5 font-bold tabular-nums", time ? "text-[10.5px]" : "text-[11px]", styles[shift] ?? "")}>{time ? shortSpan(time) : label[shift] ?? shift}</span>;
}

/* ---------------- Coverage heatmap ---------------- */
export function CoverageHeatmap({ cells, days, onCell, compact = false }: { cells: CoverageCell[]; days: string[]; onCell?: (c: CoverageCell) => void; compact?: boolean }) {
  const { ds, today } = useHub();
  const get = (a: string, d: string, s: "E" | "L") => cells.find((c) => c.airline === a && c.date === d && c.shift === s);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[3px]">
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
                        title={`${a.name} · ${formatDate(d)} · ${SHIFTS[s].label}: ${c.assigned}/${c.required} agents, lead ${c.leadsAssigned}/${c.leadsRequired}${d < today ? " · past, view only" : ""}`}
                        className={cn(
                          "relative flex h-10 w-full min-w-11 flex-col items-center justify-center rounded-md border text-[11px] font-bold tabular transition-colors",
                          LEVEL_STYLE[c.level],
                          onCell && c.level !== "none" ? "cursor-pointer" : "cursor-default",
                          d < today && c.level !== "none" && "opacity-60 saturate-50 hover:opacity-100",
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
        {days.some((d) => d < today) ? <span className="inline-flex items-center gap-1"><Lock className="size-3" /> Faded days have passed: view only</span> : null}
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
/** Ranked fixes for one gap — the engine proposes, a manager approves. */
export function ReassignDialog({ cell, open, onOpenChange }: { cell: CoverageCell | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const hub = useHub();
  const input = useEngineInput();
  const [chosen, setChosen] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [showBlocked, setShowBlocked] = React.useState(false);
  // What was applied while this window is open, so the manager sees it land and can undo it
  const [done, setDone] = React.useState<{ title: string; before: CoverageCell; refId?: string; cells: CellChange[]; undone?: boolean }[]>([]);
  React.useEffect(() => {
    setChosen(null);
    setReason("");
    setShowBlocked(false);
    setDone([]);
  }, [cell?.airline, cell?.date, cell?.shift]);

  const past = !!cell && cell.date < hub.today;
  const fixes = React.useMemo(() => (cell && open && !past ? suggestFixes(input, { airline: cell.airline, date: cell.date, shift: cell.shift }, hub.rules) : []), [cell, open, past, input, hub.rules]);
  if (!cell) return null;
  // The past is a record: show what happened, no fixes
  if (past) return <CoverageSummaryDialog cell={cell} open={open} onOpenChange={onOpenChange} />;
  const airline = hub.ds.airlines.find((a) => a.code === cell.airline)!;
  const flights = hub.ds.flights.filter((f) => cell.flightIds.includes(f.id));
  const placed = hub.reassignments.filter((r) => r.date === cell.date && r.shift === cell.shift && r.toAirline === airline.code);
  const role = hub.session?.role;
  const canApprove = can(role, "reassign.approve");
  const canOverride = can(role, "reassign.override");
  const canEdit = can(role, "roster.edit");
  const fix = fixes.find((f) => f.id === chosen);
  const offered = new Set(fixes.map((f) => f.personId).filter(Boolean));
  const blocked = hub.ds.people
    .filter((p) => (p.role === "agent" || p.role === "lead") && p.coreAirline !== airline.code && !offered.has(p.id))
    .filter((p) => {
      const s = hub.ds.roster.find((r) => r.personId === p.id && r.date === cell.date)?.shift;
      return s === cell.shift || s === "M";
    })
    .map((p) => ({ p, check: checkReassignment(input, p, airline, cell.date, cell.shift) }))
    .filter((x) => x.check.verdict === "block");
  const allowedToApply = (f: (typeof fixes)[number]) => {
    if (f.kind === "leave-empty") return true;
    if (f.edits.length && !canEdit) return false;
    if (f.reassignment && !can(role, "reassign.request")) return false;
    if (f.needsOverride && !canOverride) return false;
    return true;
  };
  const closesAny = fixes.some((f) => f.closes && !f.newHard.length);
  const covered = cell.assigned >= cell.required && cell.leadsAssigned >= cell.leadsRequired;
  const last = done.filter((d) => !d.undone).at(-1);
  const shiftName = `${airline.code} ${SHIFTS[cell.shift].label.toLowerCase()}`;
  const apply = (f: (typeof fixes)[number]) => {
    const before = cell;
    const res = hub.applyFix(f, f.needsOverride ? reason.trim() : null);
    const keys = [...res.cells.map((c) => `${c.personId}|${c.date}`), ...(f.reassignment ? [`${f.reassignment.personId}|${f.reassignment.date}`] : [])];
    markChanged(keys);
    setDone((d) => [...d, { title: f.title, before, refId: res.refId, cells: res.cells }]);
    setChosen(null);
    setReason("");
    const a = f.after;
    flash({
      title: f.closes ? `Gap closed · ${shiftName}` : `Fix applied · ${shiftName}`,
      body: `${f.title}.${a ? ` Now ${a.assigned}/${a.required} agents${a.gaps ? `, still short ${a.gaps}` : ""}.` : ""}`,
    });
  };
  const undo = (i: number) => {
    const d = done[i];
    if (d.refId) hub.removeReassignment(d.refId);
    if (d.cells.length) hub.setCells(d.cells.map((c) => ({ personId: c.personId, date: c.date, shift: c.from ?? "O" })), { source: "fix", title: `Undid: ${d.title}` });
    markChanged(d.cells.map((c) => `${c.personId}|${c.date}`));
    setDone((all) => all.map((x, j) => (j === i ? { ...x, undone: true } : x)));
    flash({ title: "Fix undone", body: `${d.title} was reversed.`, tone: "warn" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        title={`${airline.name} · ${formatDate(cell.date, { weekday: "long", day: "numeric", month: "short" })} · ${SHIFTS[cell.shift].label}`}
        description={`${cell.assigned} of ${cell.required} agents against SLA · lead ${cell.leadsAssigned}/${cell.leadsRequired}${cell.gaps.length ? ` · gap ${cell.gaps.map((g) => `${g.from}–${g.to}`).join(", ")}` : ""} · ${flights.map((f) => `${f.flightNo} ${f.std}`).join(", ") || "no departures"}`}
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

        {last ? (
          <div className={cn("mb-4 rounded-xl border p-3.5", covered ? "border-emerald-200 bg-ok-soft" : "border-brand-100 bg-brand-50")}>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className={cn("mt-0.5 size-5 shrink-0", covered ? "text-ok" : "text-brand-600")} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{covered ? "Gap closed" : "Fix applied"}: {last.title}</p>
                <p className="mt-0.5 text-sm">
                  {shiftName} was <span className="font-semibold">{last.before.assigned}/{last.before.required}</span>, now{" "}
                  <span className={cn("font-semibold", covered ? "text-ok" : "text-brand-700")}>{cell.assigned}/{cell.required}</span> agents
                  {cell.leadsRequired ? ` · lead ${cell.leadsAssigned}/${cell.leadsRequired}` : ""}.
                  {!covered ? <> {cell.required - cell.assigned > 0 ? `${cell.required - cell.assigned} still short` : "Lead still needed"}{gapText(cell) ? <> (<span className="font-semibold">{gapText(cell)}</span>)</> : null}; pick another fix below.</> : null}
                </p>
                <p className="mt-1 text-xs text-muted">The roster, coverage and Today are already updated{done.filter((d) => !d.undone).length > 1 ? ` · ${done.filter((d) => !d.undone).length} fixes applied here` : ""}.</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" className="h-10 sm:h-8" onClick={() => undo(done.lastIndexOf(last))}><Undo2 className="size-4" /> Undo</Button>
              {covered ? <Button size="sm" className="h-10 sm:h-8" onClick={() => onOpenChange(false)}>Done</Button> : null}
            </div>
          </div>
        ) : null}

        {covered && last ? null : (<>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Suggested fixes · best first</p>
          {!closesAny && fixes.length > 1 ? <Badge tone="warn">No single move closes this gap</Badge> : null}
        </div>
        <div className="max-h-[44vh] space-y-1.5 overflow-y-auto pr-1">
          {fixes.map((f) => {
            const p = f.personId ? hub.people.get(f.personId) : null;
            const ok = allowedToApply(f);
            return (
              <button
                key={f.id}
                disabled={!ok}
                onClick={() => setChosen(f.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border p-2.5 text-left transition-colors",
                  ok ? "cursor-pointer border-line bg-card hover:border-brand-400 hover:bg-brand-50" : "cursor-not-allowed border-line bg-surface opacity-60",
                  chosen === f.id && "border-brand-500 bg-brand-50 ring-2 ring-brand-100",
                )}
              >
                {p ? <Avatar name={personName(p)} src={p.photoUrl} /> : <span className="grid size-8 place-items-center rounded-full bg-surface text-muted"><Ban className="size-4" /></span>}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                    {f.title}
                    <Badge tone={f.kind === "pull" ? "brand" : f.kind === "overtime" ? "gold" : "neutral"}>{FIX_LABEL[f.kind]}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{f.detail}</p>
                  {f.effect && f.kind !== "leave-empty" ? <p className={cn("mt-0.5 text-xs font-semibold", f.closes ? "text-ok" : "text-brand-700")}>{f.effect}</p> : null}
                  {[...f.newHard, ...f.newSoft].slice(0, 2).map((v) => (
                    <p key={v.ruleId + v.date + v.message} className={cn("mt-0.5 text-xs", v.severity === "hard" ? "text-bad" : "text-amber-700")}>{v.severity === "hard" ? "Breaks: " : "Note: "}{v.message.replace(/^[^:]+: /, "")}</p>
                  ))}
                </div>
                {f.kind !== "leave-empty" ? <FixVerdict closes={f.closes} improves={f.improves} hard={f.newHard.length} override={f.needsOverride} /> : null}
              </button>
            );
          })}
        </div>

        {blocked.length ? (
          <div className="mt-3">
            <button onClick={() => setShowBlocked((v) => !v)} className="text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700 cursor-pointer">
              {showBlocked ? "Hide" : "Show"} {blocked.length} on shift who can't cover {airline.code}
            </button>
            {showBlocked ? (
              <ul className="mt-2 space-y-1">
                {blocked.map(({ p, check }) => (
                  <li key={p.id} className="flex items-center gap-2 text-xs text-muted"><Ban className="size-3.5 text-bad" /> <span className="font-semibold text-fg">{personName(p)}</span> — {check.notes[0]}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {fixes.length === 1 ? <p className="mt-2 rounded-lg bg-surface p-3 text-xs text-muted">Nobody on shift can help this gap without breaking a rule. Cover from another team, overtime approval, or a roster change for the week is needed.</p> : null}
        </>)}

        {fix && fix.kind !== "leave-empty" ? (
          <div className="mt-4 space-y-3 border-t border-line pt-4">
            {fix.needsOverride ? (
              <div className="rounded-lg border border-amber-200 bg-warn-soft p-3 text-sm text-amber-900">
                <p className="flex items-center gap-1.5 font-semibold"><ShieldAlert className="size-4" /> Protected core agent</p>
                <p className="mt-1 text-xs">{fix.detail} The reason is recorded against the move.</p>
              </div>
            ) : null}
            {fix.needsOverride ? (
              <div>
                <Label htmlFor="reason">Override reason</Label>
                <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. UA flight delayed 2h, core team released early" className="mt-1" />
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setChosen(null)}>Cancel</Button>
              <Button
                disabled={fix.needsOverride && reason.trim().length < 4}
                onClick={() => apply(fix)}
              >
                {fix.needsOverride ? "Override and apply" : "Apply fix"}
              </Button>
            </div>
          </div>
        ) : fix?.kind === "leave-empty" ? (
          <div className="mt-4 flex justify-end border-t border-line pt-4"><Button variant="outline" onClick={() => onOpenChange(false)}>Leave as is</Button></div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const FIX_LABEL: Record<string, string> = { pull: "Move", swap: "Swap shift", dayoff: "Day-off move", overtime: "Overtime", "leave-empty": "Leave" };

function FixVerdict({ closes, improves, hard, override }: { closes: boolean; improves: boolean; hard: number; override: boolean }) {
  if (hard) return <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-bad"><Ban className="size-4" /> Breaks rule</span>;
  if (closes && !override) return <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-ok"><CheckCircle2 className="size-4" /> Closes gap</span>;
  if (closes) return <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-warn"><AlertTriangle className="size-4" /> Closes · override</span>;
  if (improves) return <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-600"><CheckCircle2 className="size-4" /> Helps</span>;
  return <span className="text-xs text-muted">No change</span>;
}

export function PersonLink({ p }: { p?: Person | null }) {
  if (!p) return <span className="text-muted">—</span>;
  return (
    <Link href={`/agents/${p.id}`} className="font-medium text-fg transition-colors hover:text-brand-600">
      {personName(p)}
    </Link>
  );
}

/** Read-only summary of a shift that has already happened: who was there, what changed, how the flights went. */
export function CoverageSummaryDialog({ cell, open, onOpenChange }: { cell: CoverageCell; open: boolean; onOpenChange: (v: boolean) => void }) {
  const hub = useHub();
  const airline = hub.ds.airlines.find((a) => a.code === cell.airline);
  if (!airline) return null;
  const met = cell.assigned >= cell.required && cell.leadsAssigned >= cell.leadsRequired;
  const flights = hub.ds.flights.filter((f) => cell.flightIds.includes(f.id)).sort((a, b) => a.std.localeCompare(b.std));
  const coversIn = hub.reassignments.filter((r) => r.date === cell.date && r.shift === cell.shift && r.toAirline === airline.code);
  const coversOut = hub.reassignments.filter((r) => r.date === cell.date && r.shift === cell.shift && r.fromAirline === airline.code);
  const outIds = new Set(coversOut.map((r) => r.personId));
  const absent = hub.absences
    .filter((a) => a.from <= cell.date && a.to >= cell.date)
    .map((a) => ({ a, p: hub.people.get(a.personId) }))
    .filter((x) => x.p?.coreAirline === airline.code);
  const absentIds = new Set(absent.map((x) => x.a.personId));
  const onShift = hub.ds.roster
    .filter((r) => r.date === cell.date && (r.shift === cell.shift || r.shift === "M") && !outIds.has(r.personId) && !absentIds.has(r.personId))
    .map((r) => hub.people.get(r.personId))
    .filter((p): p is Person => !!p && p.coreAirline === airline.code && (p.role === "agent" || p.role === "lead"))
    .concat(coversIn.map((r) => hub.people.get(r.personId)).filter((p): p is Person => !!p))
    .sort((a, b) => (a.role === "lead" ? 0 : 1) - (b.role === "lead" ? 0 : 1));
  const short = cell.required - cell.assigned;
  const nothing = !coversIn.length && !coversOut.length && !absent.length;
  const label = "mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        title={`${airline.name} · ${formatDate(cell.date, { weekday: "long", day: "numeric", month: "short" })} · ${SHIFTS[cell.shift].label}`}
        description="This shift has already happened, so its coverage can't be changed. Here's how it went."
        footer={<div className="flex justify-end"><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></div>}
      >
        <div className={cn("flex items-start gap-3 rounded-xl border p-3.5", met ? "border-green-200 bg-ok-soft" : cell.level === "red" ? "border-red-200 bg-bad-soft" : "border-amber-200 bg-warn-soft")}>
          {met ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" /> : <AlertTriangle className={cn("mt-0.5 size-5 shrink-0", cell.level === "red" ? "text-bad" : "text-amber-600")} />}
          <div className="min-w-0 text-sm">
            <p className="font-semibold">{met ? "Covered: SLA met" : short > 0 ? `Ran ${short} agent${short === 1 ? "" : "s"} short` : "Ran without a lead"}</p>
            <p className="mt-0.5 text-muted">
              {cell.assigned} of {cell.required} agents · lead {cell.leadsAssigned}/{cell.leadsRequired}
              {!met && gapText(cell) ? ` · short ${gapText(cell)}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className={label}>Rostered for this shift</p>
            {onShift.length === 0 ? <p className="text-sm text-muted">Nobody from the team was rostered.</p> : null}
            <ul className="space-y-1 text-sm">
              {onShift.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{personName(p)}</span>
                  {p.role === "lead" ? <Badge tone="dark">Lead</Badge> : null}
                  {coversIn.some((r) => r.personId === p.id) ? <Badge tone="brand">Cover</Badge> : null}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className={label}>What changed on the day</p>
            {nothing ? <p className="text-sm text-muted">Worked as rostered: no sick calls or covers.</p> : null}
            <ul className="space-y-1.5 text-sm">
              {absent.map(({ a, p }) => (
                <li key={a.id}><span className="font-semibold">{personName(p)}</span> <span className="text-muted">· {ABSENCE_TYPES[a.type]?.label ?? a.type}</span></li>
              ))}
              {coversIn.map((r) => (
                <li key={r.id}><span className="font-semibold">{personName(hub.people.get(r.personId))}</span> <span className="text-muted">covered from {r.fromAirline} · approved by {r.approvedBy}{r.overrideReason ? ` · override: ${r.overrideReason}` : ""}</span></li>
              ))}
              {coversOut.map((r) => (
                <li key={r.id}><span className="font-semibold">{personName(hub.people.get(r.personId))}</span> <span className="text-muted">helped {r.toAirline} instead</span></li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4">
          <p className={label}>Flights</p>
          {flights.length === 0 ? <p className="text-sm text-muted">No departures in this shift.</p> : null}
          {flights.length ? (
            <div className="divide-y divide-line rounded-lg border border-line">
              {flights.map((f) => {
                const log = hub.logByFlight.get(f.id);
                return (
                  <div key={f.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className="w-20 font-semibold">{f.flightNo}</span>
                    <span className="text-muted tabular">STD {f.std}</span>
                    <span className="flex-1" />
                    {log?.status === "filed" ? (
                      <>
                        <Badge tone={log.delayMinutes <= 0 ? "ok" : log.delayMinutes <= 15 ? "warn" : "bad"}>{log.delayMinutes <= 0 ? "On time" : `+${log.delayMinutes} min`}</Badge>
                        <Badge tone={slaMet(log, airline) ? "ok" : "warn"}>{slaMet(log, airline) ? "Full team" : "Team short"}</Badge>
                        <Link href={`/records/${log.id}`} className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700">Record <ArrowRight className="size-3.5" /></Link>
                      </>
                    ) : (
                      <Badge tone="neutral">Not filed</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted"><Lock className="size-3.5" /> Past shifts are read only. If something was recorded wrong, correct it in the flight record.</p>
      </DialogContent>
    </Dialog>
  );
}
