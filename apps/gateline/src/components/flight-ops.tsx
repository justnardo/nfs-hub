"use client";
import * as React from "react";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { Button, Dialog, DialogContent, Input, Label, Select, Textarea, cn } from "@nfs/ui";
import { OPS_REASONS, addDays, formatDate, type Flight, type FlightOps } from "@nfs/db";
import { useHub } from "@/lib/store";
import { flash } from "./flash";

type Choice = "schedule" | FlightOps["status"];
const CHOICES: { v: Choice; label: string; hint: string }[] = [
  { v: "schedule", label: "On schedule", hint: "Operating as planned" },
  { v: "delayed", label: "Delayed", hint: "New departure time today" },
  { v: "cancelled", label: "Cancelled", hint: "Not operating today" },
  { v: "ron", label: "Remain overnight", hint: "Aircraft stays; departs another day" },
];

/** Button + dialog for duty staff to cancel, delay or keep a flight overnight (and undo it). */
export function FlightOpsButton({ flight, size = "icon" }: { flight: Flight; size?: "icon" | "sm" }) {
  const [open, setOpen] = React.useState(false);
  if (flight.kind === "arrival") return null;
  return (
    <>
      {size === "icon" ? (
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={`Update status of ${flight.flightNo}`} title="Cancel, delay or RON"><CalendarClock /></Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}><CalendarClock /> Flight status</Button>
      )}
      {open ? <FlightOpsDialog flight={flight} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function FlightOpsDialog({ flight, onClose }: { flight: Flight; onClose: () => void }) {
  const hub = useHub();
  const cur = flight.ops;
  const [choice, setChoice] = React.useState<Choice>(cur?.status ?? "schedule");
  const [reason, setReason] = React.useState<string>(cur?.reason ?? "Weather");
  const [newStd, setNewStd] = React.useState(cur?.newStd ?? flight.std);
  const [newDate, setNewDate] = React.useState(cur?.newDate ?? addDays(flight.date, 1));
  const [note, setNote] = React.useState(cur?.note ?? "");
  const log = hub.logByFlight.get(flight.id);
  const started = !!log && (Object.keys(log.events).length > 0 || (log.paxCheckedIn ?? 0) > 0);
  const valid = choice === "schedule" || (choice === "delayed" ? /^\d{2}:\d{2}$/.test(newStd) && newStd > flight.std : choice === "ron" ? newDate > flight.date && /^\d{2}:\d{2}$/.test(newStd) : true);

  const save = () => {
    if (choice === "schedule") {
      hub.setFlightOps(flight.id, null);
      flash({ title: `${flight.flightNo} back on schedule`, body: "The team has been told." , tone: "ok" });
    } else {
      hub.setFlightOps(flight.id, {
        status: choice,
        reason,
        note: note.trim() || undefined,
        ...(choice === "delayed" ? { newStd } : {}),
        ...(choice === "ron" ? { newDate, newStd } : {}),
      });
      flash({
        title: choice === "cancelled" ? `${flight.flightNo} cancelled` : choice === "delayed" ? `${flight.flightNo} delayed to ${newStd}` : `${flight.flightNo} remaining overnight`,
        body: choice === "cancelled"
          ? started ? "Taken out of staffing. The lead will close out the gate log with what happened to passengers." : "Taken out of staffing and coverage. No gate log needed."
          : choice === "delayed" ? "Coverage now plans the gate team for the new time. The team has been told."
          : `Departs ${formatDate(newDate, { weekday: "short", day: "numeric", month: "short" })} at ${newStd}. It's added to that day's flights and staffing.`,
        tone: choice === "delayed" ? "warn" : undefined,
      }, 9000);
    }
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-lg"
        title={`${flight.flightNo} · ${formatDate(flight.date, { weekday: "short", day: "numeric", month: "short" })}`}
        description={`STD ${flight.std} to ${flight.destination || "—"} · gate ${flight.gate}. Changes go to the team on shift and the change log.`}
        footer={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={!valid || (choice === "schedule" && !cur)} variant={choice === "cancelled" ? "danger" : "primary"}>Save</Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          {CHOICES.map((c) => (
            <button
              key={c.v}
              type="button"
              onClick={() => setChoice(c.v)}
              aria-pressed={choice === c.v}
              className={cn(
                "cursor-pointer rounded-xl border p-3 text-left transition-colors",
                choice === c.v ? (c.v === "cancelled" ? "border-red-300 bg-bad-soft" : "border-brand-400 bg-brand-50") : "border-line hover:border-brand-300 hover:bg-brand-50/50",
              )}
            >
              <p className="text-sm font-semibold">{c.label}</p>
              <p className="text-xs text-muted">{c.hint}</p>
            </button>
          ))}
        </div>
        {choice !== "schedule" ? (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Reason</Label>
                <Select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full">{OPS_REASONS.map((r) => <option key={r}>{r}</option>)}</Select>
              </div>
              {choice === "delayed" ? (
                <div><Label className="text-xs">New departure time</Label><Input type="time" value={newStd} onChange={(e) => setNewStd(e.target.value)} className="mt-1" /></div>
              ) : null}
            </div>
            {choice === "ron" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label className="text-xs">Departs on</Label><Input type="date" value={newDate} min={addDays(flight.date, 1)} max={hub.ds.horizonEnd} onChange={(e) => setNewDate(e.target.value)} className="mt-1" /></div>
                <div><Label className="text-xs">At</Label><Input type="time" value={newStd} onChange={(e) => setNewStd(e.target.value)} className="mt-1" /></div>
              </div>
            ) : null}
            <div><Label className="text-xs">Note (optional)</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" placeholder="e.g. Hotel block at the airport hotel; rebooking desk at counter 12" /></div>
            {started && choice !== "delayed" ? (
              <p className="flex gap-2 rounded-lg bg-warn-soft p-2.5 text-xs text-amber-900">
                <AlertTriangle className="size-4 shrink-0" />
                Passenger work has started on this flight. The lead will be asked to close out the gate log: passengers checked in and what happened to them.
              </p>
            ) : null}
          </div>
        ) : cur ? <p className="mt-3 text-xs text-muted">Currently {cur.status === "ron" ? "remaining overnight" : cur.status} · set by {cur.by}. Saving puts it back on the schedule.</p> : null}
      </DialogContent>
    </Dialog>
  );
}
