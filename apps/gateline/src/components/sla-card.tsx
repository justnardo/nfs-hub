"use client";
import * as React from "react";
import { FileCheck2, History, Info, Pencil } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, Input, Label, Textarea, cn } from "@nfs/ui";
import { can } from "@nfs/auth";
import { addDays, formatDate, type Airline, type SlaMinimums } from "@nfs/db";
import { coverageGrid } from "@nfs/rules";
import { useEngineInput, useHub } from "@/lib/store";
import { flash } from "./flash";

type Key = keyof SlaMinimums;
const FIELDS: { k: Key; label: string; short: string; hint: string }[] = [
  { k: "counter", label: "Check-in counter", short: "Counter", hint: "Agents per flight while check-in is open" },
  { k: "gate", label: "Gate", short: "Gate", hint: "Agents per flight at the gate" },
  { k: "jetBridge", label: "Jet bridge", short: "Bridge", hint: "Extra agent on the bridge during boarding" },
  { k: "lead", label: "Lead", short: "Lead", hint: "Passenger service lead on duty" },
  { k: "supervisor", label: "Supervisor", short: "Supervisor", hint: "Kept on record; coverage doesn't count supervisors yet" },
];
const ARRIVAL_FIELDS: { k: Key; label: string; hint: string }[] = [
  { k: "arrival", label: "Meet the aircraft", hint: "Agents for an inbound that ends its day here (arrival only or RON)" },
  { k: "arrivalPerWheelchair", label: "Per wheelchair", hint: "Extra agents for each wheelchair passenger" },
  { k: "arrivalPerService", label: "Per meet & greet / special", hint: "Extra agents for each request" },
];
const DEFAULT_ARRIVAL = { arrival: 1, arrivalPerWheelchair: 1, arrivalPerService: 1 } as const;
const val = (sla: SlaMinimums, k: Key) => sla[k] ?? (DEFAULT_ARRIVAL as Partial<Record<Key, number>>)[k] ?? 0;
const fieldsFor = (a: Airline) => FIELDS.filter((f) => f.k !== "jetBridge" || a.usesJetBridge);
/** The figures the coverage engine actually uses. */
const usedFor = (a: Airline) => fieldsFor(a).filter((f) => f.k !== "supervisor");

/** Plain-language rule the engine applies for this airline. */
export function slaRule(a: Airline, sla: SlaMinimums = a.sla) {
  const gate = sla.gate + (a.usesJetBridge ? sla.jetBridge : 0);
  return [
    `Check-in (3 h to 1 h before departure): ${sla.counter} agent${sla.counter === 1 ? "" : "s"} per flight`,
    `Gate (1 h before to 10 min after departure): ${gate} agent${gate === 1 ? "" : "s"} per flight${a.usesJetBridge && sla.jetBridge ? `, including ${sla.jetBridge} on the jet bridge` : ""}`,
    sla.lead ? "A lead on duty whenever a flight is being worked" : "No lead required",
    `Arrivals (15 min before landing to 30 after): ${val(sla, "arrival")} to meet an aircraft that ends its day here, plus ${val(sla, "arrivalPerWheelchair")} per wheelchair and ${val(sla, "arrivalPerService")} per meet & greet or special service`,
    "Flights at the same time add together, so the busiest moment of a shift sets what it needs",
  ];
}

/** The airline's SLA as Gateline uses it, who agreed it, and the button to record a new agreement. */
export function SlaCard({ airline, autoOpen = false }: { airline: Airline; autoOpen?: boolean }) {
  const hub = useHub();
  const [editing, setEditing] = React.useState(false);
  React.useEffect(() => {
    if (autoOpen) setEditing(true);
  }, [autoOpen]);
  const [showHistory, setShowHistory] = React.useState(false);
  const manage = can(hub.session?.role, "airlines.edit");
  const ag = airline.slaAgreement;
  const history = airline.slaHistory ?? [];

  return (
    <Card id="sla" className="scroll-mt-20">
      <CardHeader>
        <div>
          <CardTitle>SLA agreement</CardTitle>
          <CardDescription className="mt-1 flex flex-wrap items-center gap-1.5">{airline.slaConfirmed ? <Badge tone="ok">Agreed</Badge> : <Badge tone="gold">Placeholder</Badge>} What coverage is measured against</CardDescription>
        </div>
        {manage ? <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil /> Update SLA</Button> : null}
      </CardHeader>
      <CardContent>
        <div className={cn("grid gap-2", airline.usesJetBridge ? "grid-cols-4" : "grid-cols-3")}>
          {usedFor(airline).map((f) => (
            <div key={f.k} className="rounded-lg bg-surface px-1 py-2.5 text-center" title={`${f.label}: ${f.hint}`}>
              <p className="font-display text-xl font-semibold tabular">{airline.sla[f.k]}</p>
              <p className="text-[11px] leading-tight text-muted">{f.short}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-xs">
          <span className="font-semibold">Arrivals:</span> {val(airline.sla, "arrival")} to meet · +{val(airline.sla, "arrivalPerWheelchair")} per wheelchair · +{val(airline.sla, "arrivalPerService")} per meet &amp; greet / special
        </p>
        <ul className="mt-3 space-y-1 text-xs text-muted">
          {slaRule(airline).map((r) => <li key={r} className="flex gap-1.5"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-brand-500" />{r}</li>)}
        </ul>
        <div className="mt-3 rounded-lg border border-line px-3 py-2 text-xs">
          {ag ? (
            <>
              <p><span className="font-semibold">Agreed with {ag.agreedWith}</span> on {formatDate(ag.agreedOn, { day: "numeric", month: "long", year: "numeric" })}</p>
              <p className="text-muted">Recorded by {ag.recordedBy}{ag.note ? ` · ${ag.note}` : ""}</p>
            </>
          ) : airline.slaConfirmed ? (
            <p className="text-muted">Confirmed with the airline.</p>
          ) : (
            <p className="text-muted">These are placeholder figures. Record the agreed SLA so coverage reflects what {airline.name} actually expects.</p>
          )}
        </div>
        {history.length ? (
          <div className="mt-2">
            <button onClick={() => setShowHistory((v) => !v)} className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-brand-700 transition-colors hover:text-brand-500"><History className="size-3.5" />{showHistory ? "Hide" : "Show"} earlier SLAs ({history.length})</button>
            {showHistory ? (
              <ul className="mt-2 space-y-1.5">
                {history.map((h, i) => (
                  <li key={i} className="rounded-md bg-surface px-2.5 py-1.5 text-xs">
                    <span className="font-semibold tabular">{h.sla.counter} counter · {h.sla.gate} gate{airline.usesJetBridge ? ` · ${h.sla.jetBridge} bridge` : ""} · {h.sla.lead} lead</span>
                    <span className="block text-muted">{h.agreedOn ? `Agreed ${formatDate(h.agreedOn, { day: "numeric", month: "short", year: "numeric" })} with ${h.agreedWith}` : h.agreedWith || "Earlier figures"} · replaced {formatDate(h.replacedAt.slice(0, 10), { day: "numeric", month: "short" })}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
      {editing ? <SlaDialog airline={airline} onClose={() => setEditing(false)} /> : null}
    </Card>
  );
}

function SlaDialog({ airline, onClose }: { airline: Airline; onClose: () => void }) {
  const hub = useHub();
  const input = useEngineInput();
  const [sla, setSla] = React.useState<SlaMinimums>({ ...DEFAULT_ARRIVAL, ...airline.sla });
  const [agreedOn, setAgreedOn] = React.useState(hub.today);
  const [agreedWith, setAgreedWith] = React.useState(airline.stationManager.name);
  const [note, setNote] = React.useState("");
  const changed = [...fieldsFor(airline), ...ARRIVAL_FIELDS].some((f) => val(sla, f.k) !== val(airline.sla, f.k));
  const set = (k: Key, v: string) => setSla((x) => ({ ...x, [k]: Math.max(0, Math.min(12, Math.round(Number(v) || 0))) }));

  // What the new figures would do to the next 7 days on the current roster
  const impact = React.useMemo(() => {
    const count = (airlines: Airline[]) => {
      const cells = coverageGrid({ ...input, airlines }, hub.today, 7).filter((c) => c.airline === airline.code && c.level !== "none");
      return { shifts: cells.length, short: cells.filter((c) => c.level !== "green").length };
    };
    const now = count(input.airlines);
    const after = count(input.airlines.map((a) => (a.code === airline.code ? { ...a, sla } : a)));
    return { now, after };
  }, [input, sla, airline.code, hub.today]);

  const save = () => {
    hub.updateSla(airline.code, sla, { agreedOn, agreedWith: agreedWith.trim(), note: note.trim() || undefined });
    flash({ title: `${airline.name} SLA updated`, body: `Coverage, rosters and fixes now use the new figures. ${impact.after.short} short shift${impact.after.short === 1 ? "" : "s"} in the next 7 days.`, tone: "ok" });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-xl"
        title={`Update ${airline.name} SLA`}
        description="Enter the minimums agreed with the airline. Gateline uses them straight away for coverage, rosters and fixes; the old figures are kept in the history."
        footer={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={!agreedWith.trim() || !agreedOn || (!changed && airline.slaConfirmed)}><FileCheck2 /> Save SLA</Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {fieldsFor(airline).map((f) => (
            <div key={f.k}>
              <Label className="text-xs">{f.label}</Label>
              <Input type="number" inputMode="numeric" min={0} max={12} value={sla[f.k]} onChange={(e) => set(f.k, e.target.value)} className={cn("mt-1", sla[f.k] !== airline.sla[f.k] && "border-brand-400 ring-1 ring-brand-200")} />
              <p className="mt-0.5 text-[10.5px] leading-tight text-muted">{f.hint}{sla[f.k] !== airline.sla[f.k] ? ` · was ${airline.sla[f.k]}` : ""}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 mb-1.5 text-xs font-semibold text-brand-700">Meeting arrivals</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ARRIVAL_FIELDS.map((f) => (
            <div key={f.k}>
              <Label className="text-xs">{f.label}</Label>
              <Input type="number" inputMode="numeric" min={0} max={12} value={val(sla, f.k)} onChange={(e) => set(f.k, e.target.value)} className={cn("mt-1", val(sla, f.k) !== val(airline.sla, f.k) && "border-brand-400 ring-1 ring-brand-200")} />
              <p className="mt-0.5 text-[10.5px] leading-tight text-muted">{f.hint}{val(sla, f.k) !== val(airline.sla, f.k) ? ` · was ${val(airline.sla, f.k)}` : ""}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg bg-surface p-3 text-xs">
          <p className="mb-1 flex items-center gap-1.5 font-semibold"><Info className="size-3.5 text-brand-600" /> How Gateline will use this</p>
          <ul className="space-y-0.5 text-muted">{slaRule(airline, sla).map((r) => <li key={r}>· {r}</li>)}</ul>
          <p className="mt-2 border-t border-line pt-2">
            <span className="font-semibold">Next 7 days for {airline.code}, current roster:</span>{" "}
            {impact.now.short} of {impact.now.shifts} shifts short now
            {changed ? <> → <span className={cn("font-semibold", impact.after.short > impact.now.short ? "text-bad" : impact.after.short < impact.now.short ? "text-ok" : "")}>{impact.after.short} short</span> with the new figures</> : null}
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><Label className="text-xs">Agreed with</Label><Input value={agreedWith} onChange={(e) => setAgreedWith(e.target.value)} className="mt-1" placeholder="Station manager's name" /></div>
          <div><Label className="text-xs">Agreed on</Label><Input type="date" value={agreedOn} max={addDays(hub.today, 0)} onChange={(e) => setAgreedOn(e.target.value)} className="mt-1" /></div>
        </div>
        <Label className="mt-3 block text-xs">Note (optional)</Label>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" placeholder="e.g. New contract from 1 December; extra gate agent for the A321neo" />
      </DialogContent>
    </Dialog>
  );
}
