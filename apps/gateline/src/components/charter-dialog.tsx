"use client";
import * as React from "react";
import Link from "next/link";
import { Plane } from "lucide-react";
import { Badge, Button, Dialog, DialogContent, Input, Select, Textarea, cn } from "@nfs/ui";
import { FLIGHT_KINDS, formatDate, fromMinutes, toMinutes, type FlightKind, type Terminal } from "@nfs/db";
import type { Charter } from "@nfs/demo";
import { useHub } from "@/lib/store";

function Field({ label, children, className, hint }: { label: string; children: React.ReactNode; className?: string; hint?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="text-xs font-semibold text-muted">{label}</span>
      <div className="mt-1">{children}</div>
      {hint ? <span className="mt-1 block text-[11px] text-muted">{hint}</span> : null}
    </label>
  );
}

export const CHARTER_STATUS: Record<Charter["status"], { label: string; tone: "gold" | "ok" | "bad" }> = {
  tentative: { label: "Tentative", tone: "gold" },
  confirmed: { label: "Confirmed", tone: "ok" },
  cancelled: { label: "Cancelled", tone: "bad" },
};

export function CharterBadge({ status }: { status?: Charter["status"] }) {
  if (!status || status === "confirmed") return <Badge tone="dark">Charter</Badge>;
  return <Badge tone={CHARTER_STATUS[status].tone}>Charter · {CHARTER_STATUS[status].label.toLowerCase()}</Badge>;
}

/** Create or edit a one-off charter / ad-hoc flight. It joins coverage, rosters and the gate log like a scheduled flight. */
export function CharterDialog({ charter, date, onClose }: { charter?: Charter; date?: string; onClose: () => void }) {
  const hub = useHub();
  const op = hub.ds.airlines.find((a) => a.charter);
  const [c, setC] = React.useState<Charter>(
    () =>
      charter ?? {
        id: `chr-${crypto.randomUUID().slice(0, 8)}`,
        handledAs: op?.code ?? hub.ds.airlines[0]?.code ?? "",
        operator: "",
        flightNo: "",
        date: date && date >= hub.today ? date : hub.today,
        std: "12:00",
        sta: "11:00",
        dest: "",
        destName: "",
        aircraft: "",
        gate: "",
        terminal: op?.terminal ?? "INTL",
        pax: 120,
        status: "tentative",
        ref: "",
        notes: "",
        source: "gateline",
      },
  );
  const isNew = !charter;
  const handler = hub.ds.airlines.find((a) => a.code === c.handledAs);
  const clash = hub.ds.flights.some((f) => f.date === c.date && f.flightNo.replace(/\s/g, "") === c.flightNo.replace(/\s/g, "") && f.adhoc?.id !== c.id);
  const kind: FlightKind = c.kind ?? "turn";
  const valid =
    c.operator.trim().length > 1 && c.flightNo.trim().length > 1 && /^\d{4}-\d{2}-\d{2}$/.test(c.date) && !clash &&
    (kind === "arrival" ? /^[A-Z]{3}$/.test(c.origin ?? "") : /^[A-Z]{3}$/.test(c.dest));
  const set = (patch: Partial<Charter>) => setC((x) => ({ ...x, ...patch }));
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-2xl"
        title={isNew ? "Add one-off flight" : `Charter ${charter.flightNo}`}
        description="Charters, extra sections and ad-hoc arrivals that aren't in the schedule. Departures count toward SLA coverage, show on rosters and get a gate log; arrivals show on flight tracking."
      >
        <p className="mb-1.5 text-xs font-semibold text-muted">Type</p>
        <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-surface p-1">
          {(Object.keys(FLIGHT_KINDS) as FlightKind[]).map((k) => (
            <button key={k} type="button" onClick={() => set({ kind: k, ...(k === "arrival" ? { std: c.sta } : {}) })} className={cn("h-9 cursor-pointer rounded-lg text-xs font-semibold transition-colors", kind === k ? "bg-card text-brand-700 shadow-sm" : "text-muted hover:text-brand-700")}>
              {FLIGHT_KINDS[k]}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Operator / customer" className="sm:col-span-2" hint="Tour operator, charter company, sports team or private group">
            <Input value={c.operator} onChange={(e) => set({ operator: e.target.value })} placeholder="e.g. Sun Wings Holidays" />
          </Field>
          <Field label="Status">
            <Select value={c.status} onChange={(e) => set({ status: e.target.value as Charter["status"] })} className="w-full">
              <option value="tentative">Tentative</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </Field>
          <Field label="Flight number or call sign"><Input value={c.flightNo} onChange={(e) => set({ flightNo: e.target.value.toUpperCase() })} placeholder="SWH 404 or N512PJ" /></Field>
          <Field label="Date"><Input type="date" value={c.date} min={hub.ds.windowStart} max={hub.ds.horizonEnd} onChange={(e) => set({ date: e.target.value })} /></Field>
          <Field label="Handled as" hint={handler?.charter ? "Any agent with the charter briefing" : "Uses this airline's trained team"}>
            <Select
              value={c.handledAs}
              onChange={(e) => {
                const a = hub.ds.airlines.find((x) => x.code === e.target.value);
                set({ handledAs: e.target.value, terminal: a?.terminal ?? c.terminal });
              }}
              className="w-full"
            >
              {op ? <option value={op.code}>Third-party charter</option> : null}
              {hub.ds.airlines.filter((a) => !a.charter).map((a) => <option key={a.code} value={a.code}>Extra section · {a.name}</option>)}
            </Select>
          </Field>
          {kind !== "departure" ? (
            <>
              <Field label="Inbound flight (if different)"><Input value={c.inboundNo ?? ""} onChange={(e) => set({ inboundNo: e.target.value.toUpperCase() })} placeholder="Same as above" /></Field>
              <Field label="Arriving from (code)"><Input value={c.origin ?? ""} maxLength={3} onChange={(e) => set({ origin: e.target.value.toUpperCase() })} placeholder="FLL" /></Field>
              <Field label="Arriving from"><Input value={c.originName ?? ""} onChange={(e) => set({ originName: e.target.value })} placeholder="Fort Lauderdale" /></Field>
              <Field label="Arrival (STA)"><Input type="time" value={c.sta} onChange={(e) => set({ sta: e.target.value, ...(kind === "arrival" ? { std: e.target.value } : {}) })} /></Field>
            </>
          ) : null}
          {kind !== "arrival" ? (
          <Field label="Departure (STD)">
            <Input
              type="time"
              value={c.std}
              onChange={(e) => {
                const std = e.target.value;
                const keepTurn = toMinutes(c.std) - toMinutes(c.sta);
                set({ std, sta: /^\d{2}:\d{2}$/.test(std) && keepTurn > 0 ? fromMinutes(Math.max(0, toMinutes(std) - keepTurn)) : c.sta });
              }}
            />
          </Field>
          ) : null}
          <Field label="Terminal">
            <Select value={c.terminal} onChange={(e) => set({ terminal: e.target.value as Terminal })} className="w-full">
              <option value="US">US Departures</option>
              <option value="INTL">International</option>
            </Select>
          </Field>
          {kind !== "arrival" ? (
            <>
              <Field label="Destination code"><Input value={c.dest} maxLength={3} onChange={(e) => set({ dest: e.target.value.toUpperCase() })} placeholder="MIA" /></Field>
              <Field label="Destination name"><Input value={c.destName} onChange={(e) => set({ destName: e.target.value })} placeholder="Miami" /></Field>
            </>
          ) : null}
          <Field label="Gate"><Input value={c.gate} onChange={(e) => set({ gate: e.target.value.toUpperCase() })} placeholder="D45" /></Field>
          <Field label="Aircraft"><Input value={c.aircraft} onChange={(e) => set({ aircraft: e.target.value })} placeholder="B737-800" /></Field>
          <Field label="Passengers"><Input type="number" min={1} max={500} value={c.pax} onChange={(e) => set({ pax: Math.max(1, Number(e.target.value) || 1) })} /></Field>
          <Field label="Handling request / quote ref"><Input value={c.ref ?? ""} onChange={(e) => set({ ref: e.target.value })} placeholder="NFS-HR-…" /></Field>
          <Field label="Notes for the team" className="sm:col-span-3">
            <Textarea value={c.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} placeholder="Group size, special handling, operator rep on site, oversize bags…" />
          </Field>
        </div>

        {handler ? (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm text-brand-800">
            <Plane className="mt-0.5 size-4 shrink-0 text-brand-600" />
            <p>
              Staffed to the <b>{handler.charter ? "charter" : handler.name}</b> SLA: counter {handler.sla.counter}, gate {handler.sla.gate}
              {handler.usesJetBridge ? `, jet bridge ${handler.sla.jetBridge}` : ""}, lead {handler.sla.lead}.{" "}
              {c.status === "cancelled" ? "Cancelled charters are kept for the record but don't count toward coverage." : "Coverage picks it up as soon as you save."}{" "}
              <Link href={`/airlines/${handler.code}`} className="font-semibold underline-offset-2 transition-colors hover:text-brand-600 hover:underline">Change SLA</Link>
            </p>
          </div>
        ) : null}
        {charter?.source === "rampline" ? <p className="mt-3 text-xs text-muted">Received from Rampline operations. Changes here sync back to the shared flight record.</p> : null}
        {clash ? <p className="mt-3 text-sm text-bad">{c.flightNo} already operates on {formatDate(c.date)}.</p> : null}

        <div className="mt-5 flex justify-between gap-2">
          {!isNew ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Delete the record? Cancel it instead to keep the history.</span>
                <Button variant="danger" size="sm" onClick={() => { hub.removeCharter(charter.id); onClose(); }}>Delete</Button>
              </div>
            ) : (
              <Button variant="ghost" className="text-bad hover:bg-bad-soft hover:text-red-800" onClick={() => setConfirmDelete(true)}>Delete</Button>
            )
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              disabled={!valid}
              onClick={() => {
                hub.saveCharter({ ...c, operator: c.operator.trim(), flightNo: c.flightNo.trim().replace(/\s+/g, " "), createdBy: c.createdBy ?? hub.session?.name, createdAt: c.createdAt ?? new Date().toISOString() });
                onClose();
              }}
            >
              {isNew ? "Add charter" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
