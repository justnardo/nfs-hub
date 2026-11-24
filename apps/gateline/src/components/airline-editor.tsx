"use client";
import * as React from "react";
import { ImageUp, Loader2, Sparkles, X } from "lucide-react";
import { Button, Dialog, DialogContent, Input, Label, Select, Textarea, cn } from "@nfs/ui";
import { FLIGHT_KINDS, fromMinutes, timingsFor, toMinutes, type Airline, type AirlineTimings, type FlightKind, type Terminal } from "@nfs/db";
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
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [drag, setDrag] = React.useState(false);
  const [logoError, setLogoError] = React.useState<string | null>(null);
  const [suggested, setSuggested] = React.useState<string | null>(null);
  const onFile = async (f: File) => {
    setLogoError(null);
    if (!/^image\/(png|svg\+xml|webp|jpeg)$/.test(f.type)) return setLogoError("Use a PNG, SVG, WebP or JPG image.");
    if (f.size > 4 * 1024 * 1024) return setLogoError("Choose an image under 4 MB.");
    const code = a.code.toUpperCase();
    if (!/^[A-Z0-9]{2,3}$/.test(code)) return setLogoError("Enter the airline code first.");
    setUploading(true);
    const r = await hub.uploadLogo(code, f);
    setUploading(false);
    if (!r) return setLogoError("Upload failed. Check the connection and try again.");
    setA((cur) => ({ ...cur, logoUrl: r.url }));
    setSuggested(r.colour);
  };

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
          <Field label="Brand colour" className="sm:col-span-2">
            <div className="flex items-center gap-2">
              <Input type="color" value={a.colour} onChange={(e) => setA({ ...a, colour: e.target.value })} className="w-16 p-1" />
              {suggested && suggested.toLowerCase() !== a.colour.toLowerCase() ? (
                <button type="button" onClick={() => setA({ ...a, colour: suggested })} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:border-brand-400 hover:bg-brand-50">
                  <Sparkles className="size-3.5" /> Use logo colour <span className="size-3.5 rounded-full ring-1 ring-black/10" style={{ background: suggested }} />
                </button>
              ) : null}
            </div>
          </Field>
        </div>

        <p className="mt-5 text-xs font-bold uppercase tracking-wide text-muted">Logo</p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) void onFile(f); }}
          className={cn("mt-2 flex flex-wrap items-center gap-4 rounded-xl border border-dashed p-3 transition-colors", drag ? "border-brand-500 bg-brand-50" : "border-line")}
        >
          <div className="grid h-16 w-32 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-white p-2">
            {a.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.logoUrl} alt={`${a.name || "Airline"} logo`} className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="grid h-8 min-w-12 place-items-center rounded-md px-2 font-display text-xs font-bold text-white" style={{ background: a.colour }}>{a.code || "—"}</span>
            )}
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">{a.logoUrl ? "Logo uploaded" : "No logo yet: the code tile is used"}</p>
            <p className="text-xs text-muted">PNG, SVG, WebP or JPG. Empty margins are trimmed and it's sized for chips, PDFs and the gate screen automatically. Drop a file here or browse.</p>
            {logoError ? <p className="mt-1 text-xs text-bad">{logoError}</p> : null}
          </div>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
            <Button type="button" variant="secondary" size="sm" disabled={uploading || !/^[A-Z0-9]{2,3}$/.test(a.code.toUpperCase())} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="animate-spin" /> : <ImageUp />} {a.logoUrl ? "Replace" : "Upload logo"}
            </Button>
            {a.logoUrl ? <Button type="button" variant="ghost" size="icon" onClick={() => setA({ ...a, logoUrl: null })} aria-label="Remove logo"><X /></Button> : null}
          </div>
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

        <p className="mt-5 text-xs font-bold uppercase tracking-wide text-muted">Timings · minutes before departure</p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ["checkInOpens", "Check-in opens"],
            ["checkInCloses", "Check-in closes"],
            ["boardingStarts", "Boarding starts"],
            ["gateCloses", "Gate closes"],
          ] as [keyof AirlineTimings, string][]).map(([k, label]) => (
            <Field key={k} label={label}>
              <Input type="number" min={0} max={360} value={timingsFor(a)[k]} onChange={(e) => setA({ ...a, timings: { ...timingsFor(a), [k]: Math.max(0, Math.min(360, Number(e.target.value) || 0)) } })} />
            </Field>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-muted">Gateline shows check-in open and closed from these, and flags a flight when boarding hasn&apos;t started on time. Boarding, door close and pushback come from the lead&apos;s taps.</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Field label="Aircraft (comma separated)"><Input value={aircraft} onChange={(e) => setAircraft(e.target.value)} placeholder="B737-800, A320" /></Field>
          <Field label="Required training courses"><Input value={training} onChange={(e) => setTraining(e.target.value)} placeholder="Airline gate procedures, Jet Bridge Operation" /></Field>
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
    () => route ?? { airline: airline.code, flightNo: `${airline.code} `, dest: "", destName: "", std: "10:00", turnMins: 60, aircraft: airline.aircraft[0] ?? "", gate: "", seats: 150, kind: "turn", inboundNo: `${airline.code} `, origin: "", originName: "", sta: "09:00", source: "gateline" },
  );
  const kind: FlightKind = r.kind ?? "turn";
  const days = r.days ?? [0, 1, 2, 3, 4, 5, 6];
  const isNew = !route;
  const key = (kind === "arrival" ? r.inboundNo ?? r.flightNo : r.flightNo).replace(/\s/g, "");
  const taken = isNew && hub.routes.some((x) => x.flightNo.replace(/\s/g, "") === key);
  const hasIn = kind !== "departure";
  const hasOut = kind !== "arrival";
  const sta = r.sta ?? fromMinutes(toMinutes(r.std) - r.turnMins);
  const okNo = (n?: string) => !!n && n.trim().length > airline.code.length;
  const valid =
    days.length > 0 && !taken &&
    (!hasOut || (okNo(r.flightNo) && /^[A-Z]{3}$/.test(r.dest) && /^\d{2}:\d{2}$/.test(r.std))) &&
    (!hasIn || (okNo(r.inboundNo) && /^[A-Z]{3}$/.test(r.origin ?? "") && /^\d{2}:\d{2}$/.test(sta))) &&
    (kind !== "turn" || r.overnight || toMinutes(sta) < toMinutes(r.std));
  const toggleDay = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    setR({ ...r, days: next.length === 7 ? undefined : next });
  };
  const clean = (n?: string) => (n ?? "").trim().replace(/\s+/g, " ");
  const save = () => {
    const base = { ...r, kind, sta, source: r.source ?? "gateline" } as RouteTemplate;
    let out: RouteTemplate;
    if (kind === "arrival") {
      out = { ...base, flightNo: clean(r.inboundNo), inboundNo: clean(r.inboundNo), std: sta, dest: "", destName: "", turnMins: 0, overnight: false };
    } else if (kind === "departure") {
      out = { ...base, flightNo: clean(r.flightNo), inboundNo: undefined, origin: undefined, originName: undefined, sta: undefined, turnMins: 60, overnight: false };
    } else {
      out = { ...base, flightNo: clean(r.flightNo), inboundNo: clean(r.inboundNo), turnMins: r.overnight ? 0 : toMinutes(r.std) - toMinutes(sta) };
    }
    hub.saveRoute(out);
    onClose();
  };
  const title = isNew ? `Add ${airline.code} flight` : `Edit ${route.flightNo}`;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl" title={title} description="Departures feed SLA demand: check-in from 3 h before, the gate team from 1 h before. Arrivals show on flight tracking.">
        <p className="mb-1.5 text-xs font-semibold text-muted">Type</p>
        <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-surface p-1">
          {(Object.keys(FLIGHT_KINDS) as FlightKind[]).map((k) => (
            <button
              key={k}
              type="button"
              disabled={!isNew && k !== kind && (k === "arrival" || kind === "arrival")}
              onClick={() => setR({ ...r, kind: k, inboundNo: r.inboundNo ?? `${airline.code} `, origin: r.origin ?? "", originName: r.originName ?? "", sta: r.sta ?? "09:00" })}
              className={cn("h-9 cursor-pointer rounded-lg text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40", kind === k ? "bg-card text-brand-700 shadow-sm" : "text-muted hover:text-brand-700")}
            >
              {FLIGHT_KINDS[k]}
            </button>
          ))}
        </div>
        {hasIn ? (
          <fieldset className="mb-4 rounded-xl border border-line p-3">
            <legend className="px-1 text-xs font-semibold text-brand-700">Inbound (arriving in Nassau)</legend>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Flight number"><Input value={r.inboundNo ?? ""} disabled={!isNew && kind === "arrival"} onChange={(e) => setR({ ...r, inboundNo: e.target.value.toUpperCase() })} /></Field>
              <Field label="From (code)"><Input value={r.origin ?? ""} maxLength={3} onChange={(e) => setR({ ...r, origin: e.target.value.toUpperCase() })} placeholder="EWR" /></Field>
              <Field label="From"><Input value={r.originName ?? ""} onChange={(e) => setR({ ...r, originName: e.target.value })} placeholder="Newark" /></Field>
              <Field label="Arrival (STA)"><Input type="time" value={sta} onChange={(e) => setR({ ...r, sta: e.target.value })} /></Field>
            </div>
            {kind === "turn" ? (
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={!!r.overnight} onChange={(e) => setR({ ...r, overnight: e.target.checked })} className="size-4 accent-[var(--color-brand-500)]" />
                Arrives the evening before and remains overnight (RON)
              </label>
            ) : null}
          </fieldset>
        ) : null}
        {hasOut ? (
          <fieldset className="mb-4 rounded-xl border border-line p-3">
            <legend className="px-1 text-xs font-semibold text-brand-700">Outbound (departing Nassau)</legend>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Flight number"><Input value={r.flightNo} disabled={!isNew} onChange={(e) => setR({ ...r, flightNo: e.target.value.toUpperCase() })} /></Field>
              <Field label="To (code)"><Input value={r.dest} maxLength={3} onChange={(e) => setR({ ...r, dest: e.target.value.toUpperCase() })} placeholder="MIA" /></Field>
              <Field label="To"><Input value={r.destName} onChange={(e) => setR({ ...r, destName: e.target.value })} placeholder="Miami" /></Field>
              <Field label="Departure (STD)"><Input type="time" value={r.std} onChange={(e) => setR({ ...r, std: e.target.value })} /></Field>
            </div>
          </fieldset>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Gate"><Input value={r.gate} onChange={(e) => setR({ ...r, gate: e.target.value.toUpperCase() })} /></Field>
          <Field label="Aircraft"><Input value={r.aircraft} onChange={(e) => setR({ ...r, aircraft: e.target.value })} /></Field>
          <Field label="Seats"><Input type="number" min={10} max={500} value={r.seats} onChange={(e) => setR({ ...r, seats: Number(e.target.value) || 100 })} /></Field>
        </div>
        <p className="mt-4 text-xs font-semibold text-muted">Days operated{kind === "turn" && r.overnight ? " (departure days)" : ""}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {DOW.map((d, i) => (
            <button key={d} type="button" onClick={() => toggleDay(i)} className={cn("h-9 w-12 rounded-lg border text-xs font-semibold transition-colors cursor-pointer", days.includes(i) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line text-muted hover:border-brand-400 hover:text-brand-700")}>{d}</button>
          ))}
        </div>
        {kind === "turn" && !r.overnight && toMinutes(sta) >= toMinutes(r.std) ? <p className="mt-3 text-sm text-bad">The arrival must be before the departure, or tick remains overnight.</p> : null}
        {taken ? <p className="mt-3 text-sm text-bad">{key} is already scheduled.</p> : null}
        <p className="mt-3 text-[11px] text-muted">Source: {r.source === "rampline" ? "Synced from Rampline" : r.source === "airline" ? "Synced from the airline's schedule" : "Entered in Gateline"}. Once Rampline or an airline schedule feed is connected, synced flights will update here automatically.</p>
        <div className="mt-5 flex justify-between gap-2">
          {!isNew ? (
            <Button variant="ghost" className="text-bad hover:bg-bad-soft hover:text-red-800" onClick={() => { hub.removeRoute(route.flightNo); onClose(); }}>Remove flight</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={!valid} onClick={save}>{isNew ? "Add flight" : "Save"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
