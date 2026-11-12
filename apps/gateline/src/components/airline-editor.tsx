"use client";
import * as React from "react";
import { Button, Dialog, DialogContent, Input, Label, Select, Textarea, cn } from "@nfs/ui";
import type { Airline, Terminal } from "@nfs/db";
import type { RouteTemplate } from "@nfs/demo";
import { useHub } from "@/lib/store";

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="text-xs font-semibold text-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const BLANK: Airline = {
  code: "",
  name: "",
  terminal: "INTL",
  colour: "#0e9aa7",
  logoUrl: null,
  aircraft: [],
  sla: { counter: 2, gate: 2, jetBridge: 1, lead: 1, supervisor: 0 },
  slaConfirmed: false,
  stationManager: { name: "", phone: "", email: "", preferences: "" },
  requiredTraining: [],
  usesJetBridge: true,
  custom: true,
};

/** Add or edit an airline: SLA minimums per flight, terminal, logo, training and station manager. */
export function AirlineDialog({ airline, onClose }: { airline?: Airline; onClose: () => void }) {
  const hub = useHub();
  const [a, setA] = React.useState<Airline>(() => airline ?? BLANK);
  const [aircraft, setAircraft] = React.useState((airline?.aircraft ?? []).join(", "));
  const [training, setTraining] = React.useState((airline?.requiredTraining ?? []).join(", "));
  const isNew = !airline;
  const codeTaken = isNew && hub.ds.airlines.some((x) => x.code === a.code.toUpperCase());
  const valid = /^[A-Z0-9]{2,3}$/.test(a.code.toUpperCase()) && a.name.trim().length > 1 && !codeTaken;
  const sla = (k: keyof Airline["sla"], v: string) => setA({ ...a, sla: { ...a.sla, [k]: Math.max(0, Math.min(12, Number(v) || 0)) } });
  const sm = (k: keyof Airline["stationManager"], v: string) => setA({ ...a, stationManager: { ...a.stationManager, [k]: v } });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl" title={isNew ? "Add airline" : `Edit ${airline.name}`} description="SLA minimums are per flight. Coverage, the roster engine and gap fixes use them straight away.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Code"><Input value={a.code} disabled={!isNew} maxLength={3} onChange={(e) => setA({ ...a, code: e.target.value.toUpperCase() })} placeholder="e.g. DL" /></Field>
          <Field label="Airline name" className="sm:col-span-2"><Input value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} placeholder="e.g. Delta Air Lines" /></Field>
          <Field label="Terminal">
            <Select value={a.terminal} onChange={(e) => setA({ ...a, terminal: e.target.value as Terminal })} className="w-full">
              <option value="US">US Departures</option>
              <option value="INTL">International</option>
            </Select>
          </Field>
          <Field label="Brand colour"><Input type="color" value={a.colour} onChange={(e) => setA({ ...a, colour: e.target.value })} className="p-1" /></Field>
          <Field label="Logo image URL"><Input value={a.logoUrl ?? ""} onChange={(e) => setA({ ...a, logoUrl: e.target.value || null })} placeholder="https://…" /></Field>
        </div>

        <p className="mt-5 text-xs font-bold uppercase tracking-wide text-muted">SLA minimums per flight</p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(["counter", "gate", "jetBridge", "lead", "supervisor"] as const).map((k) => (
            <Field key={k} label={k === "jetBridge" ? "Jet bridge" : k[0].toUpperCase() + k.slice(1)}>
              <Input type="number" min={0} max={12} value={a.sla[k]} onChange={(e) => sla(k, e.target.value)} />
            </Field>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-5 text-sm">
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={a.slaConfirmed} onChange={(e) => setA({ ...a, slaConfirmed: e.target.checked })} className="size-4 accent-[var(--color-brand-500)]" /> Figures confirmed with the airline</label>
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={a.usesJetBridge} onChange={(e) => setA({ ...a, usesJetBridge: e.target.checked, sla: { ...a.sla, jetBridge: e.target.checked ? Math.max(1, a.sla.jetBridge) : 0 } })} className="size-4 accent-[var(--color-brand-500)]" /> Uses a jet bridge</label>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Field label="Aircraft (comma separated)"><Input value={aircraft} onChange={(e) => setAircraft(e.target.value)} placeholder="B737-800, A320" /></Field>
          <Field label="Required training (TakeFlight courses)"><Input value={training} onChange={(e) => setTraining(e.target.value)} placeholder="Airline DCS, Jet Bridge Operation" /></Field>
        </div>

        <p className="mt-5 text-xs font-bold uppercase tracking-wide text-muted">Station manager</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Field label="Name"><Input value={a.stationManager.name} onChange={(e) => sm("name", e.target.value)} /></Field>
          <Field label="Phone"><Input value={a.stationManager.phone} onChange={(e) => sm("phone", e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={a.stationManager.email} onChange={(e) => sm("email", e.target.value)} /></Field>
          <Field label="Expectations" className="sm:col-span-3"><Textarea value={a.stationManager.preferences} onChange={(e) => sm("preferences", e.target.value)} placeholder="e.g. Dedicated core team only. Notify 24h before any non-core agent is placed." /></Field>
        </div>

        {codeTaken ? <p className="mt-3 text-sm text-bad">An airline with code {a.code} already exists.</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!valid}
            onClick={() => {
              hub.saveAirline({ ...a, code: a.code.toUpperCase(), aircraft: list(aircraft), requiredTraining: list(training) });
              onClose();
            }}
          >
            {isNew ? "Add airline" : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Add or edit a scheduled departure for an airline. */
export function RouteDialog({ airline, route, onClose }: { airline: Airline; route?: RouteTemplate; onClose: () => void }) {
  const hub = useHub();
  const [r, setR] = React.useState<RouteTemplate>(
    () => route ?? { airline: airline.code, flightNo: `${airline.code} `, dest: "", destName: "", std: "10:00", turnMins: 60, aircraft: airline.aircraft[0] ?? "", gate: "", seats: 150 },
  );
  const days = r.days ?? [0, 1, 2, 3, 4, 5, 6];
  const isNew = !route;
  const taken = isNew && hub.routes.some((x) => x.flightNo.replace(/\s/g, "") === r.flightNo.replace(/\s/g, ""));
  const valid = r.flightNo.trim().length > airline.code.length && /^[A-Z]{3}$/.test(r.dest) && /^\d{2}:\d{2}$/.test(r.std) && days.length > 0 && !taken;
  const toggleDay = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    setR({ ...r, days: next.length === 7 ? undefined : next });
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl" title={isNew ? `Add ${airline.code} departure` : `Edit ${route.flightNo}`} description="Flights feed SLA demand: counter from 3h before departure, gate team from 1h before.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Flight number"><Input value={r.flightNo} disabled={!isNew} onChange={(e) => setR({ ...r, flightNo: e.target.value.toUpperCase() })} /></Field>
          <Field label="Destination code"><Input value={r.dest} maxLength={3} onChange={(e) => setR({ ...r, dest: e.target.value.toUpperCase() })} placeholder="MIA" /></Field>
          <Field label="Destination name"><Input value={r.destName} onChange={(e) => setR({ ...r, destName: e.target.value })} placeholder="Miami" /></Field>
          <Field label="Departure (STD)"><Input type="time" value={r.std} onChange={(e) => setR({ ...r, std: e.target.value })} /></Field>
          <Field label="Turn time (min)"><Input type="number" min={20} max={240} value={r.turnMins} onChange={(e) => setR({ ...r, turnMins: Number(e.target.value) || 60 })} /></Field>
          <Field label="Gate"><Input value={r.gate} onChange={(e) => setR({ ...r, gate: e.target.value.toUpperCase() })} /></Field>
          <Field label="Aircraft"><Input value={r.aircraft} onChange={(e) => setR({ ...r, aircraft: e.target.value })} /></Field>
          <Field label="Seats"><Input type="number" min={10} max={500} value={r.seats} onChange={(e) => setR({ ...r, seats: Number(e.target.value) || 100 })} /></Field>
        </div>
        <p className="mt-4 text-xs font-semibold text-muted">Days operated</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {DOW.map((d, i) => (
            <button key={d} type="button" onClick={() => toggleDay(i)} className={cn("h-9 w-12 rounded-lg border text-xs font-semibold transition-colors cursor-pointer", days.includes(i) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line text-muted hover:border-brand-400 hover:text-brand-700")}>{d}</button>
          ))}
        </div>
        {taken ? <p className="mt-3 text-sm text-bad">{r.flightNo} is already scheduled.</p> : null}
        <div className="mt-5 flex justify-between gap-2">
          {!isNew ? (
            <Button variant="ghost" className="text-bad hover:bg-bad-soft hover:text-red-800" onClick={() => { hub.removeRoute(route.flightNo); onClose(); }}>Remove flight</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={!valid} onClick={() => { hub.saveRoute({ ...r, flightNo: r.flightNo.trim().replace(/\s+/g, " ") }); onClose(); }}>{isNew ? "Add departure" : "Save"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
