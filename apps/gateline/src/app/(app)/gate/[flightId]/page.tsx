"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Accessibility, Siren, AlertTriangle, ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, CloudOff, DoorOpen, Luggage, Pencil, Plus, Search, Send, Undo2, Users, Wand2, X } from "lucide-react";
import { Avatar, Badge, Button, Card, Dialog, DialogContent, Input, Label, Select, Textarea, cn } from "@nfs/ui";
import {
  GATE_EVENT_LABEL, GATE_EVENT_ORDER, NFS_CONTROLLABLE, fromMinutes, shiftForStd, toMinutes,
  type Airline, type DelayCause, type Discrepancy, type DiscrepancyType, type Flight, type GateEventType, type GateLog, type Person, type SsrCode, type SsrItem, type TeamMember, type TeamPosition,
} from "@nfs/db";
import { eligibleFor } from "@nfs/rules";
import { timingsFor } from "@nfs/db";
import { EVENT_TYPES, publish } from "@nfs/events";
import { deriveStatus } from "@nfs/flights";
import { useHub, personName } from "@/lib/store";
import { RequirePerm } from "@/components/guard";
import { AirlineChip, FlightStatusBadge } from "@/components/ops";
import { GateCloseout } from "@/components/gate-closeout";
import { FlightOpsButton } from "@/components/flight-ops";
import { SSR_CODES, SSR_LABEL, WHEELCHAIR } from "@/lib/advice";
import { can } from "@nfs/auth";

const CAUSES: DelayCause[] = [
  "Late inbound aircraft", "Airline operations", "Weather", "ATC / airport", "Ground equipment", "Catering",
  "Security / TSA", "Passenger processing", "Staffing shortfall", "Cleaning / groomers",
];
const DISC_TYPES: DiscrepancyType[] = [
  "Pax count mismatch", "Wheelchair request not pre-advised", "Bag offload", "No-show", "Denied boarding",
  "Documentation issue", "Unruly passenger", "Seat duplication", "Medical",
];
const POS_LABEL: Record<TeamPosition, string> = { lead: "Lead", gate: "Gate", jetBridge: "Jet bridge", counter: "Counter" };

export default function GateLogPage() {
  return (
    <RequirePerm perm="gate.log">
      <GateLogScreen />
    </RequirePerm>
  );
}

const need = (a: Airline, p: TeamPosition) => (p === "lead" ? a.sla.lead : a.sla[p]);
const positionsFor = (a: Airline): TeamPosition[] => ["lead", "gate", ...(a.usesJetBridge && a.sla.jetBridge ? (["jetBridge"] as TeamPosition[]) : []), "counter"];

/** Best available team from the roster: core staff first, then qualified staff from other teams; leads take the lead slot. */
function autoFill(current: TeamMember[], candidates: Candidate[], airline: Airline, meId?: string): TeamMember[] {
  const team = [...current];
  const taken = new Set(team.map((t) => t.personId));
  const pool = candidates.filter((c) => c.elig.ok && !taken.has(c.p.id) && !c.busy);
  for (const pos of positionsFor(airline)) {
    let have = team.filter((t) => t.position === pos).length;
    const want = need(airline, pos);
    const order = pos === "lead"
      ? [...pool].sort((a, b) => Number(b.p.id === meId) - Number(a.p.id === meId) || Number(b.p.role === "lead") - Number(a.p.role === "lead") || Number(b.core) - Number(a.core))
      : [...pool].filter((c) => c.p.role !== "lead").sort((a, b) => Number(b.core) - Number(a.core));
    for (const c of order) {
      if (have >= want) break;
      if (pos === "lead" && c.p.role !== "lead") continue;
      if (taken.has(c.p.id)) continue;
      team.push({ personId: c.p.id, position: pos });
      taken.add(c.p.id);
      have++;
    }
  }
  // Short on counter staff: gate and jet bridge agents work check-in first, then move to the gate
  let counter = team.filter((t) => t.position === "counter").length;
  for (const t of [...team]) {
    if (counter >= need(airline, "counter")) break;
    if ((t.position === "gate" || t.position === "jetBridge") && !team.some((x) => x.personId === t.personId && x.position === "counter")) {
      team.push({ personId: t.personId, position: "counter" });
      counter++;
    }
  }
  return team;
}

type Candidate = { p: Person; elig: { ok: boolean; reason?: string }; core: boolean; busy: string | null };

function GateLogScreen() {
  const { flightId } = useParams<{ flightId: string }>();
  const hub = useHub();
  const flight = hub.ds.flights.find((f) => f.id === decodeURIComponent(flightId));
  const [teamOpen, setTeamOpen] = React.useState<TeamPosition | null>(null);
  const [discOpen, setDiscOpen] = React.useState<DiscrepancyType | null>(null);
  const [editing, setEditing] = React.useState<GateEventType | null>(null);
  const [photos, setPhotos] = React.useState<Record<string, string>>({});
  const [gateOpen, setGateOpen] = React.useState(false);
  const [ssrOpen, setSsrOpen] = React.useState(false);
  const paxRef = React.useRef<HTMLDivElement>(null);
  const nextRef = React.useRef<HTMLDivElement | null>(null);
  const [nextVisible, setNextVisible] = React.useState(true);
  React.useEffect(() => {
    const check = () => {
      const el = nextRef.current;
      if (!el) return setNextVisible(false);
      const r = el.getBoundingClientRect();
      setNextVisible(r.bottom > 80 && r.top < window.innerHeight - 140);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  });

  if (!flight) return <p className="text-sm text-muted">Flight not found.</p>;
  if (flight.kind === "arrival") return <p className="text-sm text-muted">{flight.flightNo} is an arrival only: there's no departure gate log.</p>;
  // Cancelled or overnighted: close-out instead of the departure log
  if (flight.ops?.status === "cancelled" || flight.ops?.status === "ron") return <GateCloseout flight={flight} log={hub.logByFlight.get(flight.id)} />;
  const airline = hub.ds.airlines.find((a) => a.code === flight.airline)!;
  const shift = shiftForStd(flight.std);
  const existing = hub.logByFlight.get(flight.id);
  const status = deriveStatus(flight, existing, hub.today, hub.nowMin, timingsFor(hub.ds.airlines.find((a) => a.code === flight.airline)));
  const onShift = new Set(hub.ds.roster.filter((r) => r.date === flight.date && (r.shift === shift || r.shift === "M")).map((r) => r.personId));

  // Who else is working a flight within 90 minutes of this one
  const busyWith = new Map<string, string>();
  for (const g of hub.gateLogs) {
    if (g.date !== flight.date || g.flightId === flight.id || g.status === "filed") continue;
    const other = hub.ds.flights.find((f) => f.id === g.flightId);
    if (!other || Math.abs(toMinutes(other.std) - toMinutes(flight.std)) > 90) continue;
    for (const t of g.team) busyWith.set(t.personId, `${other.flightNo} ${other.std}`);
  }
  const candidates: Candidate[] = hub.ds.people
    .filter((p) => (p.role === "agent" || p.role === "lead") && p.active !== false && onShift.has(p.id))
    .map((p) => ({ p, elig: eligibleFor(p, airline, flight.date), core: p.coreAirline === airline.code, busy: busyWith.get(p.id) ?? null }));

  const base = (): GateLog =>
    existing ?? {
      id: `log-${flight.id}`,
      flightId: flight.id,
      date: flight.date,
      airline: flight.airline,
      leadId: hub.me?.id ?? "",
      team: autoFill([], candidates, airline, hub.me?.id),
      events: {},
      paxBooked: flight.adhoc ? flight.paxBooked : null,
      paxCheckedIn: null,
      paxBoarded: null,
      wheelchairs: null,
      figuresToCrew: null,
      discrepancies: [],
      delayMinutes: 0,
      delayCause: null,
      notes: "",
      status: "open",
      filedAt: null,
      source: "device",
    };
  const log = base();
  const filed = log.status === "filed";
  const advice = hub.adviceFor(flight.id);
  const alerts = hub.alertsFor(flight.id);
  const wchAdvised = advice.ssr.filter((x) => WHEELCHAIR.includes(x.code)).length + alerts.reduce((n, a) => n + (a.wheelchairs ?? 0), 0);
  const canGate = can(hub.session?.role, "gate.log");
  const offloadDone = (d: Discrepancy) => hub.events.find((e) => e.type === EVENT_TYPES.offloadDone && e.payload.discrepancyId === d.id);
  const toggleSsr = (item: SsrItem) => {
    const ssr = advice.ssr.map((x) => (x.id === item.id ? { ...x, handled: !x.handled, handledAt: !x.handled ? nowHHMM : undefined } : x));
    hub.saveAdvice({ ...advice, ssr });
  };
  const tm = timingsFor(airline);
  const stdMin = toMinutes(flight.std);
  const at = (before: number) => fromMinutes(Math.max(0, stdMin - before));
  const isToday = flight.date === hub.today;
  const boardingDue = isToday && !filed && !log.events.boarding_start && !log.events.pushback && hub.nowMin >= stdMin - tm.boardingStarts;

  const recompute = (l: GateLog): GateLog => {
    const push = l.events.pushback;
    const delay = push ? Math.max(0, toMinutes(push) - toMinutes(flight.std)) : 0;
    return { ...l, delayMinutes: delay, delayCause: delay > 0 ? l.delayCause : null };
  };

  const nowHHMM = fromMinutes(hub.nowMin);
  const tap = (ev: GateEventType, at = nowHHMM) => {
    const next = recompute({ ...log, leadId: log.leadId || hub.me?.id || "", events: { ...log.events, [ev]: at } });
    hub.saveLog(next, { type: EVENT_TYPES.gateEvent, payload: { event: ev, at, by: hub.me?.id } });
  };
  const undo = (ev: GateEventType) => {
    const events = { ...log.events };
    delete events[ev];
    hub.saveLog(recompute({ ...log, events }), { type: "gate.event_undone", payload: { event: ev } });
  };
  const savePax = (patch: Partial<GateLog>) => hub.saveLog({ ...log, ...patch });
  const num = (v: string) => (v === "" ? null : Math.max(0, Math.min(999, Math.round(Number(v)) || 0)));

  const nextEvent = GATE_EVENT_ORDER.find((e) => !log.events[e]);
  const logged = GATE_EVENT_ORDER.filter((e) => log.events[e]).length;
  const delayMin = (() => {
    if (log.events.pushback) return log.delayMinutes;
    if (flight.date === hub.today && hub.nowMin > toMinutes(flight.std)) return hub.nowMin - toMinutes(flight.std);
    return 0;
  })();
  const missing: string[] = [];
  if (!log.events.door_close || !log.events.pushback) missing.push("door close and pushback");
  if (log.paxBoarded === null || log.paxBoarded === undefined) missing.push("passengers boarded");
  if (log.delayMinutes > 0 && !log.delayCause) missing.push("a delay cause");
  const canFile = missing.length === 0 && !filed;
  const countPos = (p: TeamPosition) => log.team.filter((t) => t.position === p).length;
  const minsToStd = toMinutes(flight.std) - hub.nowMin;
  const booked = log.paxBooked ?? null;
  const noShows = log.paxCheckedIn != null && log.paxBoarded != null ? log.paxCheckedIn - log.paxBoarded : null;

  return (
    <div className="mx-auto max-w-md pb-6">
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild><Link href="/gate"><ArrowLeft /> Flights</Link></Button>
        <div className="flex items-center gap-1.5">
          {can(hub.session?.role, "roster.edit") && !filed ? <FlightOpsButton flight={flight} /> : null}
          {hub.offline ? <Badge tone="warn"><CloudOff className="size-3" /> Saved on this phone · syncs on reconnect</Badge> : <Badge tone="ok">Live sync</Badge>}
        </div>
      </div>
      {flight.ops?.status === "delayed" ? (
        <Card className="mb-3 border-amber-200 bg-warn-soft p-3 text-sm text-amber-900">
          <p className="font-semibold">Delayed to {flight.ops.newStd} · {flight.ops.reason}</p>
          <p className="text-xs">Log times as they happen. The delay is measured against the scheduled {flight.std}.</p>
        </Card>
      ) : null}

      {filed ? (
        <Card className="mb-3 flex items-center gap-3 border-green-200 bg-ok-soft p-3.5">
          <CheckCircle2 className="size-6 shrink-0 text-ok" />
          <div className="flex-1 text-sm"><p className="font-semibold text-green-900">Record filed{log.filedAt ? ` at ${log.filedAt}` : ""}</p><p className="text-xs text-green-800">Door close and pushback sent to Rampline.</p></div>
          <Button variant="outline" size="sm" asChild><Link href={`/records/${log.id}`}>View</Link></Button>
        </Card>
      ) : null}

      {/* Flight header */}
      <Card className="overflow-hidden">
        <div className="bg-ink-900 p-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><AirlineChip airline={airline} /><span className="font-display text-xl font-semibold tabular">{flight.flightNo}</span></div>
            <FlightStatusBadge status={status.status} />
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            <div className="rounded-lg bg-white/[0.06] py-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-300">To</div>
              <div className="font-display text-base font-semibold tabular">{flight.destination}</div>
            </div>
            <button
              type="button"
              disabled={!canGate || filed}
              onClick={() => setGateOpen(true)}
              title={canGate && !filed ? "Change gate" : undefined}
              className={cn("rounded-lg py-1.5 transition-colors enabled:cursor-pointer", flight.gateFrom ? "bg-gold-500/25 enabled:hover:bg-gold-500/35" : "bg-white/[0.06] enabled:hover:bg-white/[0.1]")}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-300">Gate</div>
              <div className={cn("font-display text-base font-semibold tabular", flight.gateFrom && "text-gold-400")}>{flight.gate}</div>
            </button>
            <div className="rounded-lg bg-white/[0.06] py-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-300">STD</div>
              <div className="font-display text-base font-semibold tabular">{flight.std}</div>
            </div>
            <button
              type="button"
              onClick={() => paxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
              className={cn("cursor-pointer rounded-lg py-1.5 transition-colors", booked === null ? "bg-gold-500/20 hover:bg-gold-500/30" : "bg-white/[0.06] hover:bg-white/[0.1]")}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-300">Booked</div>
              <div className={cn("font-display text-base font-semibold tabular", booked === null && "text-gold-400")}>{booked ?? "Enter"}</div>
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-300">
            {flight.destinationName} · {flight.aircraft} · inbound STA {flight.sta}
            {flight.date === hub.today && !log.events.pushback && minsToStd > 0 ? <> · <span className="font-semibold text-white">STD in {minsToStd >= 60 ? `${Math.floor(minsToStd / 60)}h ${minsToStd % 60}m` : `${minsToStd} min`}</span></> : null}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-white/[0.04] p-1 text-center text-[11px]">
            {[
              ["Check-in", `${at(tm.checkInOpens)}–${at(tm.checkInCloses)}`, isToday && hub.nowMin >= stdMin - tm.checkInOpens && hub.nowMin < stdMin - tm.checkInCloses],
              ["Boarding from", at(tm.boardingStarts), !!log.events.boarding_start && !log.events.boarding_close],
              ["Gate closes", at(tm.gateCloses), !!log.events.boarding_close && !log.events.door_close],
            ].map(([k, v, on]) => (
              <div key={String(k)} className={cn("rounded-md py-1", on && "bg-brand-500/30")}>
                <div className="text-ink-300">{k}</div>
                <div className="font-semibold tabular text-white">{v}</div>
              </div>
            ))}
          </div>
          {flight.adhoc ? <p className="mt-1 text-xs text-gold-400">Charter · {flight.adhoc.operator}{flight.adhoc.notes ? ` · ${flight.adhoc.notes}` : ""}</p> : null}
          {flight.gateFrom ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-gold-500 px-3 py-2 text-sm font-semibold text-ink-900">
              <DoorOpen className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">Gate changed {flight.gateFrom} <ArrowRight className="inline size-3.5" /> {flight.gate}{advice.gateReason ? ` · ${advice.gateReason}` : ""}</span>
              {advice.gateChangedAt ? <span className="shrink-0 text-xs font-medium">{new Date(advice.gateChangedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Nassau" })}</span> : null}
            </div>
          ) : null}
        </div>

        {/* Team by position */}
        <div className="border-b border-line p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold"><Users className="size-4 text-brand-600" /> Team</p>
            {!filed ? <Button variant="ghost" size="sm" onClick={() => setTeamOpen("gate")}><Pencil /> Edit team</Button> : null}
          </div>
          <div className="space-y-1.5">
            {positionsFor(airline).map((pos) => {
              const members = log.team.filter((t) => t.position === pos);
              const want = need(airline, pos);
              return (
                <button
                  key={pos}
                  type="button"
                  disabled={filed}
                  onClick={() => setTeamOpen(pos)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-brand-50 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span className="w-20 shrink-0 text-xs font-semibold text-muted">{POS_LABEL[pos]}</span>
                  <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                    {members.map((t) => {
                      const p = hub.people.get(t.personId);
                      return <span key={t.personId} className="inline-flex items-center gap-1 rounded-full bg-surface py-0.5 pl-0.5 pr-2 text-xs font-semibold"><Avatar name={personName(p)} src={p?.photoUrl} className="size-5 text-[9px]" />{p?.firstName ?? "?"}</span>;
                    })}
                    {members.length < want && !filed ? <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-brand-300 px-2 py-0.5 text-xs font-semibold text-brand-700"><Plus className="size-3" /> Add</span> : null}
                  </span>
                  <Badge tone={members.length >= want ? "ok" : "warn"} className="shrink-0">{members.length}/{want}</Badge>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Issues on the inbound flight, posted by operations in Rampline */}
      {alerts.map((a) => {
        const ack = advice.alertAcks?.[a.id];
        const time = new Date(a.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Nassau" });
        return (
          <Card key={a.id} className={cn("mt-4 overflow-hidden", a.urgent && !ack ? "border-red-300" : "border-line")}>
            <div className={cn("flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wide", a.urgent && !ack ? "bg-bad text-white" : "bg-bad-soft text-red-800")}>
              <Siren className="size-4" /> Inbound alert · {a.category}
              <span className="ml-auto font-semibold normal-case tracking-normal">{time}</span>
            </div>
            <div className="space-y-2 p-4">
              <p className="text-sm">{a.message}</p>
              {a.wheelchairs ? <p className="flex items-center gap-1.5 text-sm font-semibold"><Accessibility className="size-4 text-brand-600" /> {a.wheelchairs} wheelchair{a.wheelchairs > 1 ? "s" : ""} at the aircraft door on arrival (STA {flight.sta})</p> : null}
              <p className="text-xs text-muted">From {a.by} in Rampline</p>
              {ack ? (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-green-800"><CheckCircle2 className="size-3.5" /> Acknowledged by {ack.by} at {new Date(ack.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Nassau" })} · Rampline can see this</p>
              ) : (
                <Button className="h-11 w-full" variant={a.urgent ? "danger" : "primary"} onClick={() => hub.ackAlert(flight.id, a.id)}><Check /> Acknowledge for passenger services</Button>
              )}
            </div>
          </Card>
        );
      })}

      {/* Special assistance, pre-advised */}
      <Card className="mt-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold"><Accessibility className="size-4 text-brand-600" /> Special assistance</p>
            <p className="text-xs text-muted">Pre-advised for this flight{advice.ssr.length ? ` · ${advice.ssr.filter((x) => x.handled).length} of ${advice.ssr.length} done` : ""}</p>
          </div>
          {!filed ? <Button variant="secondary" size="sm" onClick={() => setSsrOpen(true)}><Plus /> Add</Button> : null}
        </div>
        {advice.ssr.length === 0 ? <p className="mt-2 text-xs text-muted">No requests pre-advised for this flight.</p> : (
          <div className="mt-3 space-y-1.5">
            {advice.ssr.map((x) => (
              <button
                key={x.id}
                type="button"
                disabled={filed}
                onClick={() => toggleSsr(x)}
                className={cn("flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors enabled:cursor-pointer", x.handled ? "border-green-200 bg-ok-soft/60" : "border-line enabled:hover:border-brand-400 enabled:hover:bg-brand-50")}
              >
                <span className={cn("grid h-7 min-w-14 place-items-center rounded-md px-1.5 font-display text-[11px] font-bold", x.handled ? "bg-ok text-white" : WHEELCHAIR.includes(x.code) ? "bg-brand-100 text-brand-800" : "bg-gold-100 text-gold-700")}>{x.code}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{x.name}{x.seat ? <span className="font-normal text-muted"> · {x.seat}</span> : null}</span>
                  <span className="block truncate text-xs text-muted">{SSR_LABEL[x.code]}{x.note ? ` · ${x.note}` : ""}{x.source === "nfs" ? " · added at the gate" : ""}</span>
                </span>
                {x.handled ? <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-green-800"><Check className="size-3.5" />{x.handledAt}</span> : <span className="shrink-0 text-xs font-semibold text-brand-600">Mark done</span>}
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Timeline */}
      <div className="mt-4 flex items-center justify-between px-1">
        <p className="text-sm font-semibold">Turnaround</p>
        <p className="text-xs text-muted">{logged} of {GATE_EVENT_ORDER.length} logged</p>
      </div>
      {boardingDue ? (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-warn-soft px-3 py-2 text-xs font-semibold text-amber-900">
          <AlertTriangle className="size-3.5 shrink-0" /> {airline.name} boarding was due at {at(tm.boardingStarts)}. Tap Boarding start when it begins.
        </div>
      ) : null}
      <div className="mt-2 space-y-2">
        {GATE_EVENT_ORDER.map((ev) => {
          const at = log.events[ev];
          const isNext = ev === nextEvent && !filed;
          return (
            <div key={ev} ref={isNext ? nextRef : undefined} className={cn("flex items-center gap-2 rounded-xl border bg-card p-2 pl-3 transition-colors", at ? "border-green-200" : isNext ? "border-brand-400 ring-1 ring-brand-400/30" : "border-line")}>
              <span className={cn("grid size-7 shrink-0 place-items-center rounded-full", at ? "bg-ok text-white" : isNext ? "bg-brand-500 text-white" : "bg-surface text-ink-400")}>
                {at ? <Check className="size-4" /> : <span className="text-[11px] font-bold">{GATE_EVENT_ORDER.indexOf(ev) + 1}</span>}
              </span>
              <span className="flex-1 text-[15px] font-semibold">{GATE_EVENT_LABEL[ev]}</span>
              {at ? (
                editing === ev ? (
                  <Input
                    type="time"
                    autoFocus
                    defaultValue={at}
                    className="h-10 w-28"
                    onBlur={(e) => {
                      if (e.target.value) tap(ev, e.target.value);
                      setEditing(null);
                    }}
                  />
                ) : (
                  <>
                    <span className="font-display text-lg font-semibold tabular">{at}</span>
                    {!filed ? (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => setEditing(ev)} aria-label={`Edit ${GATE_EVENT_LABEL[ev]}`}><Pencil /></Button>
                        <Button variant="ghost" size="icon" onClick={() => undo(ev)} aria-label={`Undo ${GATE_EVENT_LABEL[ev]}`}><Undo2 /></Button>
                      </>
                    ) : null}
                  </>
                )
              ) : (
                <Button disabled={filed} variant={isNext ? "primary" : "outline"} className={cn("h-12 min-w-28", isNext && "text-base")} onClick={() => tap(ev)}>
                  {isNext ? `Tap · ${nowHHMM}` : "Tap"}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Passenger figures */}
      <div ref={paxRef} className="scroll-mt-20"><Card className="mt-4 space-y-4 p-4">
        <div>
          <p className="text-sm font-semibold">Passenger figures</p>
          <p className="text-xs text-muted">Enter booked and checked in at check-in close, then boarded at door close.</p>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {([
            ["Booked", "paxBooked", log.paxBooked],
            ["Checked in", "paxCheckedIn", log.paxCheckedIn],
            ["Boarded", "paxBoarded", log.paxBoarded],
          ] as const).map(([label, key, value]) => (
            <div key={key}>
              <Label htmlFor={key} className="text-xs">{label}</Label>
              <Input
                id={key}
                type="number"
                inputMode="numeric"
                disabled={filed}
                value={value ?? ""}
                onChange={(e) => savePax({ [key]: num(e.target.value) } as Partial<GateLog>)}
                placeholder="—"
                className={cn("mt-1 h-12 text-center text-lg font-semibold tabular", key === "paxBoarded" && value == null && log.events.door_close && "border-gold-400 bg-gold-100/40")}
              />
            </div>
          ))}
        </div>
        {noShows !== null || (booked !== null && log.paxCheckedIn != null) ? (
          <div className="space-y-1.5 rounded-lg bg-surface p-2.5 text-sm">
            {booked !== null && log.paxCheckedIn != null ? <Row k="Not checked in" v={booked - log.paxCheckedIn} /> : null}
            {noShows !== null ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">Checked in, didn&apos;t board</span>
                <span className="flex items-center gap-2">
                  <span className={cn("font-semibold tabular", noShows !== 0 && "text-amber-800")}>{noShows === 0 ? "Match" : noShows}</span>
                  {noShows > 0 && !filed && !log.discrepancies.some((d) => d.type === "No-show" || d.type === "Bag offload") ? (
                    <Button variant="secondary" size="sm" onClick={() => setDiscOpen("No-show")}>Log no-show</Button>
                  ) : null}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <Label htmlFor="wch" className="text-xs">Wheelchairs (WCHR/S/C)</Label>
            <Input id="wch" type="number" inputMode="numeric" disabled={filed} value={log.wheelchairs ?? ""} onChange={(e) => savePax({ wheelchairs: num(e.target.value) })} placeholder="0" className="mt-1 h-11 text-center font-semibold tabular" />
          </div>
          <div>
            <Label className="text-xs">Final figures to crew</Label>
            {log.figuresToCrew ? (
              <div className="mt-1 flex h-11 items-center justify-between rounded-lg border border-green-200 bg-ok-soft px-3">
                <span className="font-display font-semibold tabular text-green-900">{log.figuresToCrew}</span>
                {!filed ? <button onClick={() => savePax({ figuresToCrew: null })} className="cursor-pointer rounded p-1 text-green-800 transition-colors hover:text-brand-700" aria-label="Clear time"><X className="size-3.5" /></button> : null}
              </div>
            ) : (
              <Button variant="outline" disabled={filed || log.paxBoarded == null} className="mt-1 h-11 w-full" onClick={() => savePax({ figuresToCrew: nowHHMM })}><Send /> Tap · {nowHHMM}</Button>
            )}
          </div>
        </div>
        {log.wheelchairs != null && log.wheelchairs > wchAdvised ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-warn-soft p-2.5 text-xs text-amber-900">
            <span>{log.wheelchairs - wchAdvised} more wheelchair{log.wheelchairs - wchAdvised > 1 ? "s" : ""} than pre-advised ({wchAdvised}).</span>
            {!filed && !log.discrepancies.some((d) => d.type === "Wheelchair request not pre-advised") ? <Button size="sm" variant="secondary" onClick={() => setDiscOpen("Wheelchair request not pre-advised")}>Log it</Button> : null}
          </div>
        ) : null}
      </Card></div>

      {delayMin > 0 ? (
        <Card className="mt-4 p-4">
          <Label htmlFor="cause">Delay {log.events.pushback ? "" : "so far "}· <span className="text-bad">+{delayMin} min</span> — what caused it?</Label>
          <Select
            id="cause"
            disabled={filed}
            value={log.delayCause ?? ""}
            onChange={(e) => hub.saveLog({ ...log, delayCause: (e.target.value || null) as DelayCause | null }, { type: "gate.delay_cause", payload: { cause: e.target.value } })}
            className="mt-1 h-12 w-full"
          >
            <option value="">Choose cause…</option>
            {CAUSES.map((c) => <option key={c} value={c}>{c}{NFS_CONTROLLABLE.includes(c) ? " (NFS)" : ""}</option>)}
          </Select>
          <p className="mt-1 text-[11px] text-muted">Fair data: the cause is recorded, not just who was on duty.</p>
        </Card>
      ) : null}

      {/* Discrepancies */}
      <Card className="mt-4 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Passenger discrepancies & issues</p>
          {!filed ? <Button variant="secondary" size="sm" onClick={() => setDiscOpen("Pax count mismatch")}><Plus /> Add</Button> : null}
        </div>
        <div className="mt-2 space-y-2">
          {log.discrepancies.length === 0 ? <p className="text-xs text-muted">None logged.</p> : null}
          {log.discrepancies.map((d) => (
            <div key={d.id} className="flex gap-3 rounded-lg border border-line p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {photos[d.id] ? <img src={photos[d.id]} alt="" className="size-12 rounded-md object-cover" /> : null}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{d.type} <span className="font-normal text-muted">· {d.at}</span>{d.hasPhoto ? <Camera className="ml-1 inline size-3.5 text-muted" /> : null}</p>
                <p className="text-xs text-muted">{d.note}</p>
                {d.bags ? (
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    <Luggage className="size-3.5 text-brand-600" />
                    <span className="font-semibold">{d.bags} bag{d.bags > 1 ? "s" : ""} off{d.seat ? ` · seat ${d.seat}` : ""}{d.bagTags ? ` · tags ${d.bagTags}` : ""}</span>
                    {offloadDone(d) ? (
                      <Badge tone="ok">Ramp: bags off {String(offloadDone(d)!.payload.at ?? "")}</Badge>
                    ) : d.rampHandoff ? (
                      <Badge tone="warn">Sent to Rampline {d.rampHandoff.sentAt} · waiting for ramp</Badge>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-4 p-4">
        <Label htmlFor="notes">Notes for the record</Label>
        <Textarea id="notes" disabled={filed} defaultValue={log.notes} onBlur={(e) => e.target.value !== log.notes && hub.saveLog({ ...log, notes: e.target.value })} className="mt-1" placeholder="Anything management or the station manager should know" />
      </Card>

      {/* File: a docked bar with a solid background, so nothing shows through it */}
      <div className={cn("sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 mt-5 lg:bottom-4", filed && "hidden")}>
        {filed ? null : (
          <div className="rounded-2xl border border-line bg-card p-2 shadow-[0_-4px_24px_-6px_rgba(11,47,56,0.18)]">
            {canFile ? (
              <Button
                size="lg"
                variant="gold"
                className="h-12 w-full text-base"
                onClick={() => hub.saveLog({ ...log, status: "filed", filedAt: nowHHMM, leadId: log.leadId || hub.me?.id || "" }, { type: EVENT_TYPES.gateFiled, payload: { delay: log.delayMinutes, cause: log.delayCause } })}
              >
                <CheckCircle2 /> File flight record
              </Button>
            ) : (
              <div className="flex items-center gap-3 px-2 py-1">
                <div className="relative grid size-10 shrink-0 place-items-center">
                  <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90"><circle cx="18" cy="18" r="15" fill="none" strokeWidth="3" className="stroke-surface" /><circle cx="18" cy="18" r="15" fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-brand-500" strokeDasharray={`${(logged / GATE_EVENT_ORDER.length) * 94.2} 94.2`} /></svg>
                  <span className="text-[11px] font-bold tabular">{logged}/{GATE_EVENT_ORDER.length}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{nextEvent ? `Next: ${GATE_EVENT_LABEL[nextEvent]}` : "Turnaround logged"}</p>
                  <p className="truncate text-xs text-muted">To file: {missing.join(", ")}</p>
                </div>
                {nextEvent && !nextVisible ? <Button size="sm" onClick={() => tap(nextEvent)} className="shrink-0">Tap · {nowHHMM}</Button> : null}
              </div>
            )}
          </div>
        )}
      </div>

      <TeamDialog
        position={teamOpen}
        onClose={() => setTeamOpen(null)}
        team={log.team}
        candidates={candidates}
        airline={airline}
        flight={flight}
        meId={hub.me?.id}
        onSave={(team) => {
          const lead = team.find((t) => t.position === "lead");
          hub.saveLog({ ...log, team, leadId: lead?.personId ?? log.leadId }, { type: EVENT_TYPES.gateTeam, payload: { team } });
          // Alert everyone newly put on this flight (or given a different job on it)
          const before = new Map<string, string>();
          for (const m of log.team) before.set(m.personId, [before.get(m.personId), m.position].filter(Boolean).join("+"));
          const after = new Map<string, string>();
          for (const m of team) after.set(m.personId, [after.get(m.personId), m.position].filter(Boolean).join("+"));
          const changed = [...after.entries()].filter(([id, pos]) => before.get(id) !== pos);
          for (const [id, pos] of changed) {
            const person = hub.people.get(id);
            const jobs = pos.split("+").map((x) => POS_LABEL[x as TeamPosition]).join(" then ");
            hub.notify({
              to: [id],
              kind: "team",
              title: `You're on ${flight.flightNo} · ${jobs}`,
              body: `${flight.destinationName} · STD ${flight.std} · Gate ${flight.gate}${flight.date !== hub.today ? ` · ${flight.date}` : ""}`,
              href: person?.role === "lead" ? `/gate/${flight.id}` : "/me",
            });
          }
          setTeamOpen(null);
        }}
      />
      {gateOpen ? <GateDialog flight={flight} onClose={() => setGateOpen(false)} onSave={(g, reason) => { hub.changeGate(flight.id, g, reason); setGateOpen(false); }} /> : null}
      {ssrOpen ? (
        <SsrDialog
          onClose={() => setSsrOpen(false)}
          onSave={(item) => {
            hub.saveAdvice({ ...advice, ssr: [...advice.ssr, item] });
            hub.notify({ to: log.team.filter((t) => t.position === "lead" || t.position === "gate").map((t) => t.personId), kind: "ssr", title: `${item.code} added · ${flight.flightNo}`, body: `${item.name}${item.seat ? ` · ${item.seat}` : ""} · ${SSR_LABEL[item.code]}`, href: `/gate/${flight.id}` });
            setSsrOpen(false);
          }}
        />
      ) : null}
      <DiscrepancyDialog
        open={discOpen !== null}
        initialType={discOpen ?? "Pax count mismatch"}
        onOpenChange={(v) => !v && setDiscOpen(null)}
        nowHHMM={nowHHMM}
        onSave={(d0, photo) => {
          if (photo) setPhotos((p) => ({ ...p, [d0.id]: photo }));
          const d: Discrepancy = d0.bags ? { ...d0, rampHandoff: { sentAt: nowHHMM } } : d0;
          hub.saveLog({ ...log, discrepancies: [...log.discrepancies, d] }, { type: EVENT_TYPES.gateDiscrepancy, payload: { type: d.type, at: d.at, bags: d.bags ?? 0 } });
          if (d.bags) {
            // Ramp pulls the bags: Rampline shows it on the turn and replies with ramp.offload_done
            void publishOffload(flight, d);
          }
          setDiscOpen(null);
        }}
      />
    </div>
  );
}

function Row({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{k}</span>
      <span className="font-semibold tabular">{v}</span>
    </div>
  );
}

/**
 * Assign the team one position at a time: pick the position, then tap names. Filled positions move on
 * to the next one. "Fill from roster" takes the best available people (core first) in one tap.
 */
function TeamDialog({ position, onClose, team, onSave, candidates, airline, flight, meId }: {
  position: TeamPosition | null; onClose: () => void; team: TeamMember[]; onSave: (t: TeamMember[]) => void;
  candidates: Candidate[]; airline: Airline; flight: Flight; meId?: string;
}) {
  const hub = useHub();
  const positions = positionsFor(airline);
  const [draft, setDraft] = React.useState<TeamMember[]>(team);
  const [active, setActive] = React.useState<TeamPosition>(position ?? "gate");
  const [q, setQ] = React.useState("");
  const [showBlocked, setShowBlocked] = React.useState(false);
  React.useEffect(() => {
    if (position) {
      setDraft(team);
      setActive(position);
      setQ("");
      setShowBlocked(false);
    }
  }, [position, team]);

  // Check-in (counter) comes before boarding, so the same person can do counter and then gate.
  const posOf = (id: string) => (active === "counter" ? draft.find((t) => t.personId === id && t.position === "counter")?.position ?? draft.find((t) => t.personId === id)?.position : draft.find((t) => t.personId === id && t.position !== "counter")?.position ?? draft.find((t) => t.personId === id)?.position);
  const posList = (id: string) => draft.filter((t) => t.personId === id).map((t) => t.position);
  const have = (p: TeamPosition) => draft.filter((t) => t.position === p).length;
  const nextOpen = (after: TeamPosition, d: TeamMember[]) => {
    const i = positions.indexOf(after);
    return [...positions.slice(i + 1), ...positions.slice(0, i)].find((p) => d.filter((t) => t.position === p).length < need(airline, p));
  };
  const toggle = (id: string) => {
    setDraft((d) => {
      const isCounter = (t: TeamMember) => t.position === "counter";
      const mine = d.filter((t) => t.personId === id && (active === "counter" ? isCounter(t) : !isCounter(t)));
      const cur = mine[0]?.position;
      let next = d.filter((t) => !(t.personId === id && (active === "counter" ? isCounter(t) : !isCounter(t))));
      if (cur !== active) {
        if (active === "lead") next = next.filter((t) => t.position !== "lead"); // one lead per flight
        next = [...next, { personId: id, position: active }];
        if (next.filter((t) => t.position === active).length >= need(airline, active)) {
          const n = nextOpen(active, next);
          if (n) setTimeout(() => setActive(n), 120);
        }
      }
      return next;
    });
  };

  const query = q.trim().toLowerCase();
  const match = (c: Candidate) => !query || personName(c.p).toLowerCase().includes(query) || c.p.staffNo.toLowerCase().includes(query);
  const sortFor = (a: Candidate, b: Candidate) =>
    active === "lead"
      ? Number(b.p.role === "lead") - Number(a.p.role === "lead") || Number(b.core) - Number(a.core)
      : Number(a.p.role === "lead") - Number(b.p.role === "lead") || Number(b.core) - Number(a.core) || Number(!!a.busy) - Number(!!b.busy);
  const ok = candidates.filter((c) => c.elig.ok && match(c)).sort(sortFor);
  const groups: [string, Candidate[]][] = [
    [`Core ${airline.charter ? "charter-briefed" : airline.code} · on shift`, ok.filter((c) => c.core || (airline.charter && !c.p.coreAirline))],
    ["Qualified from other teams · on shift", ok.filter((c) => !(c.core || (airline.charter && !c.p.coreAirline)))],
  ];
  const blocked = candidates.filter((c) => !c.elig.ok && match(c));
  const short = positions.some((p) => have(p) < need(airline, p));

  return (
    <Dialog open={position !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Team · ${flight.flightNo}`} description="Choose a position, then tap names to add or remove them. Counter staff can also take a boarding position once check-in closes.">
        {/* Position picker */}
        <div className="grid grid-cols-4 gap-1.5" role="tablist">
          {positions.map((p) => {
            const h = have(p);
            const n = need(airline, p);
            const on = active === p;
            return (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActive(p)}
                className={cn(
                  "cursor-pointer rounded-lg border px-1 py-2 text-center transition-colors",
                  on ? "border-brand-500 bg-brand-500 text-white" : "border-line hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700",
                )}
              >
                <div className="text-xs font-semibold">{POS_LABEL[p]}</div>
                <div className={cn("text-[11px] font-bold tabular", on ? "text-white/90" : h >= n ? "text-ok" : "text-amber-700")}>{h}/{n}</div>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find by name or staff ID" className="pl-9" />
          </div>
          {short ? (
            <Button variant="secondary" onClick={() => setDraft((d) => autoFill(d, candidates, airline, meId))} title="Fill empty positions from the roster, core staff first"><Wand2 /> Fill</Button>
          ) : null}
          {draft.length ? <Button variant="ghost" onClick={() => setDraft([])}>Clear</Button> : null}
        </div>

        <div className="mt-3 max-h-[46vh] space-y-3 overflow-y-auto pr-1">
          {groups.map(([label, list]) => (list.length ? (
            <div key={label}>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{label}</p>
              <div className="space-y-1.5">
                {list.map((c) => {
                  const pos = posOf(c.p.id);
                  const here = posList(c.p.id).includes(active);
                  return (
                    <button
                      key={c.p.id}
                      type="button"
                      onClick={() => toggle(c.p.id)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-left transition-colors",
                        here ? "border-brand-500 bg-brand-50" : pos ? "border-line bg-surface" : "border-line hover:border-brand-400 hover:bg-brand-50",
                      )}
                    >
                      <Avatar name={personName(c.p)} src={c.p.photoUrl} tone={c.p.role === "lead" ? "dark" : c.core ? "brand" : "gold"} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{personName(c.p)}{c.p.role === "lead" ? <span className="ml-1.5 text-xs font-normal text-muted">Lead</span> : null}</p>
                        <p className="truncate text-xs text-muted">
                          {c.core ? `Core ${airline.charter ? "· charter briefed" : airline.code}` : `Core ${c.p.coreAirline ?? "float pool"} · qualified`}
                          {c.busy ? <span className="text-amber-700"> · also on {c.busy}</span> : null}
                        </p>
                      </div>
                      {pos ? (
                        <span className="flex gap-1">{posList(c.p.id).map((x) => <Badge key={x} tone={x === active ? "brand" : "neutral"}>{POS_LABEL[x]}</Badge>)}</span>
                      ) : (
                        <span className="grid size-7 place-items-center rounded-full border border-line text-muted"><Plus className="size-3.5" /></span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null))}
          {groups.every(([, l]) => !l.length) ? <p className="py-4 text-center text-sm text-muted">No one on this shift matches. A supervisor can move someone from SLA coverage.</p> : null}
          {blocked.length ? (
            <div>
              <button type="button" onClick={() => setShowBlocked(!showBlocked)} className="cursor-pointer text-xs font-semibold text-muted transition-colors hover:text-brand-600">
                {showBlocked ? "Hide" : "Show"} {blocked.length} on shift who can&apos;t work {airline.code}
              </button>
              {showBlocked ? (
                <div className="mt-1.5 space-y-1">
                  {blocked.map((c) => (
                    <div key={c.p.id} className="flex items-center gap-3 rounded-lg border border-line p-2 opacity-60">
                      <Avatar name={personName(c.p)} src={c.p.photoUrl} className="size-7" />
                      <span className="flex-1 truncate text-sm">{personName(c.p)}</span>
                      <span className="flex items-center gap-1 text-xs text-bad"><AlertTriangle className="size-3" />{c.elig.reason}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-xs text-muted">{new Set(draft.map((t) => t.personId)).size} people{short ? " · some positions below SLA" : " · meets SLA"}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSave(draft)}>Save team</Button>
          </div>
        </div>
        {hub.offline ? <p className="mt-2 text-[11px] text-muted">Offline: the team saves on this phone and syncs on reconnect.</p> : null}
      </DialogContent>
    </Dialog>
  );
}

/** Hand-off to Rampline: the ramp team sees the bags to pull on the turn and confirms when they're off. */
function publishOffload(flight: Flight, d: Discrepancy) {
  return publish({
    module: "gateline",
    type: EVENT_TYPES.bagOffload,
    payload: { flightId: flight.id, flightNo: flight.flightNo, date: flight.date, std: flight.std, gate: flight.gate, discrepancyId: d.id, reason: d.type, bags: d.bags, bagTags: d.bagTags ?? null, seat: d.seat ?? null, at: d.at },
  });
}

const GATE_REASONS = ["Aircraft swap", "Gate conflict", "Airport operations request", "Jet bridge out of service", "Late inbound", "Other"];

function GateDialog({ flight, onClose, onSave }: { flight: Flight; onClose: () => void; onSave: (gate: string, reason: string) => void }) {
  const [gate, setGate] = React.useState(flight.gate);
  const [reason, setReason] = React.useState(GATE_REASONS[0]);
  const valid = /^[A-Z]?\d{1,3}[A-Z]?$/.test(gate) && gate !== flight.gate;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Change gate · ${flight.flightNo}`} description="Everyone on the flight's team and the terminal supervisors get an alert straight away, on their phones too.">
        <div className="grid grid-cols-[auto_1fr] items-end gap-3">
          <div>
            <Label className="text-xs">Now</Label>
            <div className="mt-1 grid h-12 w-20 place-items-center rounded-lg bg-surface font-display text-lg font-semibold">{flight.gate}</div>
          </div>
          <div>
            <Label htmlFor="newgate" className="text-xs">New gate</Label>
            <Input id="newgate" autoFocus value={gate} onChange={(e) => setGate(e.target.value.toUpperCase().trim())} className="mt-1 h-12 text-lg font-semibold" placeholder="C34" />
          </div>
        </div>
        <Label htmlFor="greason" className="mt-3 block text-xs">Reason</Label>
        <Select id="greason" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 h-11 w-full">
          {GATE_REASONS.map((r) => <option key={r}>{r}</option>)}
        </Select>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid} onClick={() => onSave(gate, reason === "Other" ? "" : reason)}><DoorOpen /> Change gate and alert team</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SsrDialog({ onClose, onSave }: { onClose: () => void; onSave: (x: SsrItem) => void }) {
  const [code, setCode] = React.useState<SsrCode>("WCHR");
  const [name, setName] = React.useState("");
  const [seat, setSeat] = React.useState("");
  const [note, setNote] = React.useState("");
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title="Add special assistance request" description="For a request that wasn't pre-advised. The lead and gate agents are alerted.">
        <div className="space-y-3">
          <div>
            <Label htmlFor="ssrc" className="text-xs">Request</Label>
            <Select id="ssrc" value={code} onChange={(e) => setCode(e.target.value as SsrCode)} className="mt-1 h-11 w-full">
              {SSR_CODES.map((c) => <option key={c} value={c}>{c} · {SSR_LABEL[c]}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <div><Label htmlFor="ssrn" className="text-xs">Passenger (surname/initial)</Label><Input id="ssrn" value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="ROLLE/K" className="mt-1" /></div>
            <div><Label htmlFor="ssrs" className="text-xs">Seat</Label><Input id="ssrs" value={seat} onChange={(e) => setSeat(e.target.value.toUpperCase())} placeholder="12C" className="mt-1" /></div>
          </div>
          <div><Label htmlFor="ssrnote" className="text-xs">Note</Label><Input id="ssrnote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. own chair, gate-check at the door" className="mt-1" /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={name.trim().length < 2} onClick={() => onSave({ id: crypto.randomUUID(), code, name: name.trim(), seat: seat.trim() || undefined, note: note.trim() || undefined, source: "nfs" })}>Add request</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DiscrepancyDialog({ open, onOpenChange, onSave, nowHHMM, initialType }: { open: boolean; onOpenChange: (v: boolean) => void; nowHHMM: string; initialType: DiscrepancyType; onSave: (d: GateLog["discrepancies"][number], photo?: string) => void }) {
  const [type, setType] = React.useState<DiscrepancyType>("Pax count mismatch");
  const [note, setNote] = React.useState("");
  const [photo, setPhoto] = React.useState<string | undefined>();
  const [bags, setBags] = React.useState(0);
  const [tags, setTags] = React.useState("");
  const [seat, setSeat] = React.useState("");
  const bagType = type === "No-show" || type === "Bag offload" || type === "Denied boarding";
  React.useEffect(() => {
    if (open) {
      setBags(0);
      setTags("");
      setSeat("");
      setNote("");
      setType(initialType);
      setPhoto(undefined);
    }
  }, [open, initialType]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Log discrepancy" description={`Timestamped ${nowHHMM}`}>
        <div className="space-y-3">
          <div>
            <Label htmlFor="dtype">Type</Label>
            <Select id="dtype" value={type} onChange={(e) => setType(e.target.value as DiscrepancyType)} className="mt-1 h-12 w-full">
              {DISC_TYPES.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="dnote">What happened</Label>
            <Textarea id="dnote" value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" placeholder="e.g. WCHR not pre-advised, chair sourced in 8 min" />
          </div>
          {bagType ? (
            <div className="rounded-lg border border-line bg-surface p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold"><Luggage className="size-3.5 text-brand-600" /> Checked bags to come off</p>
              <div className="mt-2 grid grid-cols-[6.5rem_1fr_5rem] gap-2">
                <div className="flex h-11 items-center rounded-lg border border-line bg-card">
                  <button type="button" onClick={() => setBags(Math.max(0, bags - 1))} className="h-full w-8 cursor-pointer rounded-l-lg text-lg font-semibold text-muted transition-colors hover:bg-brand-50 hover:text-brand-700" aria-label="Fewer bags">−</button>
                  <span className="flex-1 text-center font-display text-lg font-semibold tabular">{bags}</span>
                  <button type="button" onClick={() => setBags(Math.min(20, bags + 1))} className="h-full w-8 cursor-pointer rounded-r-lg text-lg font-semibold text-muted transition-colors hover:bg-brand-50 hover:text-brand-700" aria-label="More bags">+</button>
                </div>
                <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Bag tag numbers" className="h-11" disabled={!bags} />
                <Input value={seat} onChange={(e) => setSeat(e.target.value.toUpperCase())} placeholder="Seat" className="h-11" />
              </div>
              <p className="mt-1.5 text-[11px] text-muted">{bags ? "Sent to the ramp team in Rampline as soon as you add this." : "No checked bags means nothing for the ramp to pull."}</p>
            </div>
          ) : null}
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line p-3 text-sm text-muted transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700">
            {photo ? <img src={photo} alt="" className="size-12 rounded-md object-cover" /> : <Camera className="size-5" />}
            {photo ? "Photo attached · tap to replace" : "Add photo (optional)"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = () => setPhoto(String(r.result));
                r.readAsDataURL(f);
              }}
            />
          </label>
          <Button
            className="h-12 w-full"
            onClick={() => onSave({ id: crypto.randomUUID(), type, note: note.trim() || type, at: nowHHMM, hasPhoto: !!photo, ...(bagType && bags ? { bags, bagTags: tags.trim() || undefined } : {}), ...(bagType && seat.trim() ? { seat: seat.trim() } : {}) }, photo)}
          >
            Add to record
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
