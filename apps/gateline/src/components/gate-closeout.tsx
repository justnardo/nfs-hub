"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Ban, CheckCircle2, MoonStar } from "lucide-react";
import { Badge, Button, Card, Input, Label, Textarea, cn } from "@nfs/ui";
import { can } from "@nfs/auth";
import { CLOSEOUT_HANDLING, formatDate, fromMinutes, timingsFor, toMinutes, type Flight, type GateLog } from "@nfs/db";
import { useHub } from "@/lib/store";
import { AirlineChip } from "./ops";
import { FlightOpsButton } from "./flight-ops";
import { flash } from "./flash";

/**
 * The gate log for a flight that was cancelled or kept overnight.
 * Before check-in opened there's nothing to log. Once passenger work had started, the lead closes it out:
 * when they were told, passengers checked in, what happened to them. The record is filed but kept out of on-time figures.
 */
export function GateCloseout({ flight, log }: { flight: Flight; log: GateLog | undefined }) {
  const hub = useHub();
  const ops = flight.ops!;
  const airline = hub.ds.airlines.find((a) => a.code === flight.airline)!;
  const ron = ops.status === "ron";
  const outcome = ron ? "ron" : "cancelled";
  const tm = timingsFor(airline);
  const checkInOpened = flight.date < hub.today || (flight.date === hub.today && hub.nowMin >= toMinutes(flight.std) - tm.checkInOpens);
  const started = !!log && (Object.keys(log.events).length > 0 || (log.paxCheckedIn ?? 0) > 0);
  const needed = started || checkInOpened;
  const filed = log?.status === "filed" && log.outcome === outcome;
  const canGate = can(hub.session?.role, "gate.log");
  const manage = can(hub.session?.role, "roster.edit");

  const [advisedAt, setAdvisedAt] = React.useState(log?.closeout?.advisedAt ?? fromMinutes(Math.min(hub.nowMin, 23 * 60 + 59)));
  const [pax, setPax] = React.useState<string>(String(log?.closeout?.paxCheckedIn ?? log?.paxCheckedIn ?? ""));
  const [handling, setHandling] = React.useState<string[]>(log?.closeout?.handling ?? []);
  const [note, setNote] = React.useState(log?.closeout?.note ?? ops.note ?? "");
  const [force, setForce] = React.useState(false);
  const toggle = (h: string) => setHandling((x) => (x.includes(h) ? x.filter((y) => y !== h) : [...x, h]));

  const file = () => {
    const base: GateLog = log ?? {
      id: `log-${flight.id}`, flightId: flight.id, date: flight.date, airline: flight.airline, leadId: hub.me?.id ?? "", team: [], events: {},
      paxBooked: null, paxCheckedIn: null, paxBoarded: null, wheelchairs: null, figuresToCrew: null, discrepancies: [], delayMinutes: 0, delayCause: null,
      notes: "", status: "open", filedAt: null, source: "device",
    };
    const paxN = pax === "" ? null : Math.max(0, Math.min(999, Math.round(Number(pax)) || 0));
    hub.saveLog({
      ...base,
      leadId: base.leadId || hub.me?.id || "",
      paxCheckedIn: paxN ?? base.paxCheckedIn ?? null,
      paxBoarded: 0,
      delayMinutes: 0,
      delayCause: null,
      outcome,
      closeout: { reason: ops.reason, advisedAt, paxCheckedIn: paxN, handling, note: note.trim() },
      status: "filed",
      filedAt: fromMinutes(hub.nowMin),
    });
    flash({ title: `${flight.flightNo} closed out`, body: `Filed as ${ron ? "remain overnight" : "cancelled"}. It's kept on record but left out of on-time figures.`, tone: "ok" });
  };

  return (
    <div className="mx-auto max-w-md pb-6">
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild><Link href="/gate"><ArrowLeft /> Flights</Link></Button>
        {manage ? <FlightOpsButton flight={flight} size="sm" /> : null}
      </div>
      <Card className="overflow-hidden">
        <div className={cn("p-4 text-white", ron ? "bg-ink-900" : "bg-red-900")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><AirlineChip airline={airline} /><span className="font-display text-xl font-semibold tabular line-through decoration-2 opacity-90">{flight.flightNo}</span></div>
            <Badge tone={ron ? "gold" : "bad"}>{ron ? "Remain overnight" : "Cancelled"}</Badge>
          </div>
          <p className="mt-2 text-sm">
            {formatDate(flight.date, { weekday: "long", day: "numeric", month: "short" })} · STD {flight.std} to {flight.destination} · gate {flight.gate}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-white/85">
            {ron ? <MoonStar className="size-4" /> : <Ban className="size-4" />}
            {ops.reason}
            {ron && ops.newDate ? ` · departs ${formatDate(ops.newDate, { weekday: "short", day: "numeric", month: "short" })} at ${ops.newStd}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-white/60">Set by {ops.by}{ops.note ? ` · ${ops.note}` : ""}</p>
        </div>

        <div className="p-4">
          {filed ? (
            <>
              <p className="flex items-center gap-2 font-semibold text-green-800"><CheckCircle2 className="size-5" /> Closed out{log?.filedAt ? ` at ${log.filedAt}` : ""}</p>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted">Lead told at</dt><dd className="tabular">{log!.closeout?.advisedAt ?? "—"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Passengers checked in</dt><dd className="tabular">{log!.closeout?.paxCheckedIn ?? "—"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Passengers</dt><dd className="text-right">{log!.closeout?.handling.join(", ") || "—"}</dd></div>
                {log!.closeout?.note ? <div><dt className="text-muted">Note</dt><dd>{log!.closeout.note}</dd></div> : null}
              </dl>
              <p className="mt-3 text-xs text-muted">Kept on record; not counted in on-time (D0/D15) figures.</p>
            </>
          ) : !needed && !force ? (
            <>
              <p className="font-semibold">No gate log needed</p>
              <p className="mt-1 text-sm text-muted">{ron ? "The aircraft stays overnight before" : "The flight was cancelled before"} check-in opened, so no passengers were processed. It's out of staffing and coverage for the day.</p>
              {canGate ? <button onClick={() => setForce(true)} className="mt-3 cursor-pointer text-xs font-semibold text-brand-700 transition-colors hover:text-brand-500">Passengers were already here? Record a close-out</button> : null}
            </>
          ) : (
            <>
              <p className="font-semibold">Close out this flight</p>
              <p className="mt-1 text-sm text-muted">Passenger work had started. Record what happened so the airline and NFS have it on file.</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div><Label className="text-xs">You were told at</Label><Input type="time" value={advisedAt} onChange={(e) => setAdvisedAt(e.target.value)} className="mt-1" disabled={!canGate} /></div>
                <div><Label className="text-xs">Passengers checked in</Label><Input type="number" inputMode="numeric" min={0} value={pax} onChange={(e) => setPax(e.target.value)} className="mt-1" placeholder="From DCS" disabled={!canGate} /></div>
              </div>
              <p className="mt-4 text-xs font-semibold text-muted">What happened to the passengers</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {CLOSEOUT_HANDLING.map((h) => (
                  <button
                    key={h}
                    type="button"
                    disabled={!canGate}
                    onClick={() => toggle(h)}
                    aria-pressed={handling.includes(h)}
                    className={cn("min-h-9 cursor-pointer rounded-full border px-3 text-xs font-semibold transition-colors", handling.includes(h) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line text-muted hover:border-brand-400 hover:text-brand-700")}
                  >
                    {h}
                  </button>
                ))}
              </div>
              <Label className="mt-4 block text-xs">Note</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" placeholder="Anything the airline should know: bags, special assistance, complaints" disabled={!canGate} />
              {canGate ? <Button className="mt-4 h-12 w-full" onClick={file} disabled={!handling.length}>File close-out</Button> : null}
              {!handling.length && canGate ? <p className="mt-1.5 text-center text-xs text-muted">Pick at least one thing that happened to the passengers.</p> : null}
            </>
          )}
        </div>
      </Card>
      {ron && ops.newDate ? (
        <Button variant="outline" className="mt-3 w-full" asChild>
          <Link href={`/gate/${flight.id}-ron`}>Gate log for the departure on {formatDate(ops.newDate, { weekday: "short", day: "numeric", month: "short" })} <ArrowRight /></Link>
        </Button>
      ) : null}
    </div>
  );
}
