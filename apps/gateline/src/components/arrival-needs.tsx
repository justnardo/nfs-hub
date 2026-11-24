"use client";
import * as React from "react";
import { Accessibility, Minus, Plus, UserRoundCheck } from "lucide-react";
import { Button, Dialog, DialogContent, Label, Textarea } from "@nfs/ui";
import { arrivalDateOf, arrivalSla, flightArrivalNeed, formatDate, visitEndsHere, type Airline, type ArrivalNeeds, type Flight } from "@nfs/db";
import { useHub } from "@/lib/store";
import { flash } from "./flash";

/** Short summary of arrival requests, e.g. "♿ 2 · Meet 1". */
export function ArrivalRequests({ n }: { n?: ArrivalNeeds }) {
  if (!n || !(n.wheelchairs || n.meetGreet || n.special)) return <span className="text-xs text-muted">—</span>;
  return (
    <span className="flex flex-wrap gap-1.5 text-xs">
      {n.wheelchairs ? <span className="inline-flex items-center gap-0.5 rounded bg-brand-50 px-1.5 py-0.5 font-semibold text-brand-700"><Accessibility className="size-3" />{n.wheelchairs}</span> : null}
      {n.meetGreet ? <span className="rounded bg-gold-100 px-1.5 py-0.5 font-semibold text-gold-700">Meet {n.meetGreet}</span> : null}
      {n.special ? <span className="rounded bg-ink-100 px-1.5 py-0.5 font-semibold text-ink-700">Special {n.special}</span> : null}
    </span>
  );
}

function Stepper({ label, hint, value, onChange }: { label: string; hint: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label={`Fewer ${label}`} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}><Minus /></Button>
        <span className="w-6 text-center font-display text-lg font-semibold tabular">{value}</span>
        <Button variant="outline" size="icon" aria-label={`More ${label}`} onClick={() => onChange(Math.min(30, value + 1))}><Plus /></Button>
      </div>
    </div>
  );
}

/** Record wheelchairs, meet & greet and special services for an inbound; shows how many agents it needs. */
export function ArrivalNeedsDialog({ flight, airline, onClose }: { flight: Flight; airline: Airline; onClose: () => void }) {
  const hub = useHub();
  const saved = hub.adviceFor(flight.id).arrivalNeeds;
  const [n, setN] = React.useState<ArrivalNeeds>(saved ?? flight.arrivalNeeds ?? { wheelchairs: 0, meetGreet: 0, special: 0 });
  const s = arrivalSla(airline);
  const base = visitEndsHere(flight) ? s.meet : 0;
  const total = flightArrivalNeed({ ...flight, arrivalNeeds: n }, airline);
  const alertW = (flight.arrivalNeeds?.wheelchairs ?? 0) > (saved?.wheelchairs ?? 0) ? flight.arrivalNeeds!.wheelchairs : 0;
  const save = () => {
    const empty = !n.wheelchairs && !n.meetGreet && !n.special && !n.note?.trim();
    hub.setArrivalNeeds(flight.id, empty ? null : { ...n, note: n.note?.trim() || undefined });
    flash({ title: `${flight.inboundNo ?? flight.flightNo} arrival updated`, body: `${total} agent${total === 1 ? "" : "s"} needed to meet it. Coverage for that shift now includes them.`, tone: "ok" });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-lg"
        title={`Meet ${flight.inboundNo ?? `${flight.flightNo} inbound`}`}
        description={`${formatDate(arrivalDateOf(flight) ?? flight.date, { weekday: "short", day: "numeric", month: "short" })} · arrives ${flight.sta}${flight.origin ? ` from ${flight.origin}` : ""} · gate ${flight.gate || "TBA"}`}
        footer={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save}><UserRoundCheck /> Save</Button>
          </div>
        }
      >
        <div className="space-y-2">
          <Stepper label="Wheelchairs" hint={`+${s.perWheelchair} agent each (WCHR/WCHS/WCHC)`} value={n.wheelchairs} onChange={(v) => setN({ ...n, wheelchairs: v })} />
          <Stepper label="Meet & greet" hint={`+${s.perService} agent each`} value={n.meetGreet} onChange={(v) => setN({ ...n, meetGreet: v })} />
          <Stepper label="Special services" hint={`+${s.perService} agent each · minors, medical, VIP, escorts`} value={n.special} onChange={(v) => setN({ ...n, special: v })} />
        </div>
        {alertW ? <p className="mt-2 text-xs text-muted">Rampline flagged {alertW} wheelchair{alertW === 1 ? "" : "s"} on this inbound; the higher number is used.</p> : null}
        <Label className="mt-3 block text-xs">Note for the team</Label>
        <Textarea value={n.note ?? ""} onChange={(e) => setN({ ...n, note: e.target.value })} className="mt-1" placeholder="Names, seat numbers, who's meeting them" />
        <div className="mt-3 rounded-lg bg-surface p-3 text-sm">
          <p><span className="font-display text-lg font-semibold tabular">{total}</span> agent{total === 1 ? "" : "s"} to meet this flight</p>
          <p className="text-xs text-muted">
            {base ? `${base} because the aircraft ${flight.kind === "arrival" ? "ends its day here" : "remains overnight"} (${airline.code} SLA)` : "No base requirement: the gate team is there for the turnaround"}
            {total > base ? ` · ${total - base} for requests` : ""}. Counted from 15 min before landing to 30 min after.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
