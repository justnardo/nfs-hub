"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Camera, Check, CheckCircle2, CloudOff, Pencil, Plus, Undo2, Users } from "lucide-react";
import { Avatar, Badge, Button, Card, Dialog, DialogContent, Input, Label, Select, Textarea, cn } from "@nfs/ui";
import {
  GATE_EVENT_LABEL, GATE_EVENT_ORDER, NFS_CONTROLLABLE, fromMinutes, shiftForStd, toMinutes,
  type DelayCause, type DiscrepancyType, type GateEventType, type GateLog, type TeamMember, type TeamPosition,
} from "@nfs/db";
import { eligibleFor } from "@nfs/rules";
import { EVENT_TYPES } from "@nfs/events";
import { deriveStatus } from "@nfs/flights";
import { useHub, personName } from "@/lib/store";
import { RequirePerm } from "@/components/guard";
import { AirlineChip, FlightStatusBadge } from "@/components/ops";

const CAUSES: DelayCause[] = [
  "Late inbound aircraft", "Airline operations", "Weather", "ATC / airport", "Ground equipment", "Catering",
  "Security / TSA", "Passenger processing", "Staffing shortfall", "Cleaning / groomers",
];
const DISC_TYPES: DiscrepancyType[] = [
  "Pax count mismatch", "Wheelchair request not pre-advised", "Bag offload", "No-show", "Denied boarding",
  "Documentation issue", "Unruly passenger", "Seat duplication", "Medical",
];
const POS_LABEL: Record<TeamPosition, string> = { lead: "Lead", gate: "Gate agents", jetBridge: "Jet bridge", counter: "Counter" };

export default function GateLogPage() {
  return (
    <RequirePerm perm="gate.log">
      <GateLogScreen />
    </RequirePerm>
  );
}

function GateLogScreen() {
  const { flightId } = useParams<{ flightId: string }>();
  const hub = useHub();
  const flight = hub.ds.flights.find((f) => f.id === decodeURIComponent(flightId));
  const [teamOpen, setTeamOpen] = React.useState(false);
  const [discOpen, setDiscOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<GateEventType | null>(null);
  const [photos, setPhotos] = React.useState<Record<string, string>>({});

  if (!flight) return <p className="text-sm text-muted">Flight not found.</p>;
  const airline = hub.ds.airlines.find((a) => a.code === flight.airline)!;
  const shift = shiftForStd(flight.std);
  const existing = hub.logByFlight.get(flight.id);
  const status = deriveStatus(flight, existing, hub.today, hub.nowMin);
  const onShift = new Set(hub.ds.roster.filter((r) => r.date === flight.date && r.shift === shift).map((r) => r.personId));

  const suggestedTeam = (): TeamMember[] => {
    const lead = hub.me?.role === "lead" ? hub.me : hub.ds.people.find((p) => p.role === "lead" && p.coreAirline === airline.code && onShift.has(p.id));
    const agents = hub.ds.people.filter((p) => p.role === "agent" && p.coreAirline === airline.code && onShift.has(p.id) && eligibleFor(p, airline, flight.date).ok);
    const t: TeamMember[] = lead ? [{ personId: lead.id, position: "lead" }] : [];
    let i = 0;
    for (let k = 0; k < airline.sla.gate && i < agents.length; k++) t.push({ personId: agents[i++].id, position: "gate" });
    for (let k = 0; k < airline.sla.jetBridge && i < agents.length; k++) t.push({ personId: agents[i++].id, position: "jetBridge" });
    return t;
  };

  const base = (): GateLog =>
    existing ?? {
      id: `log-${flight.id}`,
      flightId: flight.id,
      date: flight.date,
      airline: flight.airline,
      leadId: hub.me?.id ?? "",
      team: suggestedTeam(),
      events: {},
      paxBoarded: null,
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

  const nextEvent = GATE_EVENT_ORDER.find((e) => !log.events[e]);
  const delayMin = (() => {
    if (log.events.pushback) return log.delayMinutes;
    if (flight.date === hub.today && hub.nowMin > toMinutes(flight.std)) return hub.nowMin - toMinutes(flight.std);
    return 0;
  })();
  const canFile = !!log.events.door_close && !!log.events.pushback && (log.delayMinutes === 0 || !!log.delayCause) && !filed;
  const countPos = (p: TeamPosition) => log.team.filter((t) => t.position === p).length;

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild><Link href="/gate"><ArrowLeft /> Flights</Link></Button>
        {hub.offline ? <Badge tone="warn"><CloudOff className="size-3" /> Saved on this phone · syncs on reconnect</Badge> : <Badge tone="ok">Live sync</Badge>}
      </div>

      {/* Flight header */}
      <Card className="overflow-hidden">
        <div className="bg-ink-900 p-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><AirlineChip airline={airline} /><span className="font-display text-xl font-semibold tabular">{flight.flightNo}</span></div>
            <FlightStatusBadge status={status.status} />
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            {[
              ["To", flight.destination],
              ["Gate", flight.gate],
              ["STD", flight.std],
              ["Booked", String(flight.paxBooked)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-white/[0.06] py-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-300">{k}</div>
                <div className="font-display text-base font-semibold tabular">{v}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-300">{flight.destinationName} · {flight.aircraft} · inbound STA {flight.sta}</p>
        </div>

        {/* Team */}
        <button onClick={() => !filed && setTeamOpen(true)} className="flex w-full items-center gap-3 border-b border-line p-4 text-left transition-colors hover:bg-brand-50 cursor-pointer">
          <Users className="size-5 text-brand-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Team</p>
            <p className="truncate text-xs text-muted">
              {log.team.length ? log.team.map((t) => `${hub.people.get(t.personId)?.firstName ?? "?"} (${POS_LABEL[t.position].split(" ")[0]})`).join(", ") : "Tap to assign gate agents, jet bridge and counter"}
            </p>
          </div>
          <div className="flex gap-1">
            {(["gate", "jetBridge"] as TeamPosition[]).filter((p) => airline.sla[p] > 0).map((p) => (
              <Badge key={p} tone={countPos(p) >= airline.sla[p] ? "ok" : "warn"}>{p === "gate" ? "G" : "JB"} {countPos(p)}/{airline.sla[p]}</Badge>
            ))}
          </div>
        </button>
      </Card>

      {/* Timeline */}
      <div className="mt-4 space-y-2">
        {GATE_EVENT_ORDER.map((ev) => {
          const at = log.events[ev];
          const isNext = ev === nextEvent && !filed;
          return (
            <div key={ev} className={cn("flex items-center gap-2 rounded-xl border bg-card p-2 pl-3 transition-colors", at ? "border-green-200" : isNext ? "border-brand-400" : "border-line")}>
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
                <Button
                  disabled={filed}
                  variant={isNext ? "primary" : "outline"}
                  className={cn("h-12 min-w-28", isNext && "text-base")}
                  onClick={() => tap(ev)}
                >
                  {isNext ? `Tap · ${nowHHMM}` : "Tap"}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Passengers + delay */}
      <Card className="mt-4 space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="pax">Passengers boarded</Label>
            <Input
              id="pax"
              type="number"
              inputMode="numeric"
              disabled={filed}
              value={log.paxBoarded ?? ""}
              onChange={(e) => hub.saveLog({ ...log, paxBoarded: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder={String(flight.paxBooked)}
              className="mt-1 h-12 text-lg font-semibold"
            />
          </div>
          <div>
            <Label>Booked vs boarded</Label>
            <div className={cn("mt-1 grid h-12 place-items-center rounded-lg border text-lg font-semibold tabular", log.paxBoarded !== null && log.paxBoarded !== flight.paxBooked ? "border-amber-200 bg-warn-soft text-amber-900" : "border-line bg-surface")}>
              {log.paxBoarded === null ? "—" : log.paxBoarded - flight.paxBooked === 0 ? "Match" : `${log.paxBoarded - flight.paxBooked > 0 ? "+" : ""}${log.paxBoarded - flight.paxBooked}`}
            </div>
          </div>
        </div>

        {delayMin > 0 ? (
          <div>
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
          </div>
        ) : null}
      </Card>

      {/* Discrepancies */}
      <Card className="mt-4 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Passenger discrepancies & issues</p>
          {!filed ? <Button variant="secondary" size="sm" onClick={() => setDiscOpen(true)}><Plus /> Add</Button> : null}
        </div>
        <div className="mt-2 space-y-2">
          {log.discrepancies.length === 0 ? <p className="text-xs text-muted">None logged.</p> : null}
          {log.discrepancies.map((d) => (
            <div key={d.id} className="flex gap-3 rounded-lg border border-line p-2.5">
              {photos[d.id] ? <img src={photos[d.id]} alt="" className="size-12 rounded-md object-cover" /> : null}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{d.type} <span className="font-normal text-muted">· {d.at}</span>{d.hasPhoto ? <Camera className="ml-1 inline size-3.5 text-muted" /> : null}</p>
                <p className="text-xs text-muted">{d.note}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-4 p-4">
        <Label htmlFor="notes">Notes for the record</Label>
        <Textarea id="notes" disabled={filed} defaultValue={log.notes} onBlur={(e) => e.target.value !== log.notes && hub.saveLog({ ...log, notes: e.target.value })} className="mt-1" placeholder="Anything management or the station manager should know" />
      </Card>

      <div className="sticky bottom-20 mt-5 lg:bottom-4">
        {filed ? (
          <Card className="flex items-center gap-3 border-green-200 bg-ok-soft p-4">
            <CheckCircle2 className="size-6 text-ok" />
            <div className="flex-1 text-sm"><p className="font-semibold text-green-900">Record filed{log.filedAt ? ` at ${log.filedAt}` : ""}</p><p className="text-xs text-green-800">Door close and pushback sent to Rampline.</p></div>
            <Button variant="outline" size="sm" asChild><Link href={`/records/${log.id}`}>View</Link></Button>
          </Card>
        ) : (
          <Button
            size="lg"
            variant="gold"
            className="h-14 w-full text-base shadow-lg"
            disabled={!canFile}
            onClick={() => hub.saveLog({ ...log, status: "filed", filedAt: nowHHMM, leadId: log.leadId || hub.me?.id || "" }, { type: EVENT_TYPES.gateFiled, payload: { delay: log.delayMinutes, cause: log.delayCause } })}
          >
            {canFile ? "File flight record" : !log.events.pushback ? "Log door close and pushback to file" : "Choose a delay cause to file"}
          </Button>
        )}
      </div>

      <TeamDialog
        open={teamOpen}
        onOpenChange={setTeamOpen}
        team={log.team}
        onSave={(team) => {
          const lead = team.find((t) => t.position === "lead");
          hub.saveLog({ ...log, team, leadId: lead?.personId ?? log.leadId }, { type: EVENT_TYPES.gateTeam, payload: { team } });
          setTeamOpen(false);
        }}
        flightDate={flight.date}
        airlineCode={airline.code}
        onShift={onShift}
      />
      <DiscrepancyDialog
        open={discOpen}
        onOpenChange={setDiscOpen}
        nowHHMM={nowHHMM}
        onSave={(d, photo) => {
          if (photo) setPhotos((p) => ({ ...p, [d.id]: photo }));
          hub.saveLog({ ...log, discrepancies: [...log.discrepancies, d] }, { type: EVENT_TYPES.gateDiscrepancy, payload: { type: d.type, at: d.at } });
          setDiscOpen(false);
        }}
      />
    </div>
  );
}

function TeamDialog({ open, onOpenChange, team, onSave, flightDate, airlineCode, onShift }: {
  open: boolean; onOpenChange: (v: boolean) => void; team: TeamMember[]; onSave: (t: TeamMember[]) => void;
  flightDate: string; airlineCode: string; onShift: Set<string>;
}) {
  const hub = useHub();
  const airline = hub.ds.airlines.find((a) => a.code === airlineCode)!;
  const [draft, setDraft] = React.useState<TeamMember[]>(team);
  React.useEffect(() => setDraft(team), [team, open]);
  const people = hub.ds.people
    .filter((p) => (p.role === "agent" || p.role === "lead") && onShift.has(p.id))
    .map((p) => ({ p, elig: eligibleFor(p, airline, flightDate), core: p.coreAirline === airlineCode }))
    .sort((a, b) => Number(b.core) - Number(a.core) || Number(b.elig.ok) - Number(a.elig.ok));
  const positions: TeamPosition[] = ["lead", "gate", ...(airline.sla.jetBridge ? (["jetBridge"] as TeamPosition[]) : []), "counter"];
  const posOf = (id: string) => draft.find((t) => t.personId === id)?.position;
  const cycle = (id: string) => {
    const cur = posOf(id);
    const idx = cur ? positions.indexOf(cur) : -1;
    const next = positions[idx + 1];
    setDraft((d) => {
      const rest = d.filter((t) => t.personId !== id);
      return next ? [...rest, { personId: id, position: next }] : rest;
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Assign team" description={`Tap a name to cycle Lead → Gate → ${airline.sla.jetBridge ? "Jet bridge → " : ""}Counter → off. Core ${airline.code} staff first; untrained staff can't be added.`}>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {positions.map((p) => {
            const need = p === "lead" ? airline.sla.lead : airline.sla[p];
            const have = draft.filter((t) => t.position === p).length;
            return <Badge key={p} tone={have >= need ? "ok" : "warn"}>{POS_LABEL[p]} {have}/{need}</Badge>;
          })}
        </div>
        <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
          {people.map(({ p, elig, core }) => {
            const pos = posOf(p.id);
            return (
              <button
                key={p.id}
                disabled={!elig.ok}
                onClick={() => cycle(p.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors",
                  !elig.ok ? "cursor-not-allowed border-line opacity-50" : "cursor-pointer border-line hover:border-brand-400 hover:bg-brand-50",
                  pos && "border-brand-500 bg-brand-50",
                )}
              >
                <Avatar name={personName(p)} tone={core ? "brand" : "gold"} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{personName(p)}</p>
                  <p className="text-xs text-muted">{!elig.ok ? elig.reason : core ? `Core ${airlineCode}` : `Core ${p.coreAirline ?? "float pool"} · qualified`}{p.role === "lead" ? " · Lead" : ""}</p>
                </div>
                {pos ? <Badge tone="brand">{POS_LABEL[pos]}</Badge> : null}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave(draft)}>Save team</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DiscrepancyDialog({ open, onOpenChange, onSave, nowHHMM }: { open: boolean; onOpenChange: (v: boolean) => void; nowHHMM: string; onSave: (d: GateLog["discrepancies"][number], photo?: string) => void }) {
  const [type, setType] = React.useState<DiscrepancyType>("Pax count mismatch");
  const [note, setNote] = React.useState("");
  const [photo, setPhoto] = React.useState<string | undefined>();
  React.useEffect(() => {
    if (open) {
      setNote("");
      setPhoto(undefined);
    }
  }, [open]);
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
            <Textarea id="dnote" value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" placeholder="e.g. WCHR not on PNL, chair sourced in 8 min" />
          </div>
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
            onClick={() => onSave({ id: crypto.randomUUID(), type, note: note.trim() || type, at: nowHHMM, hasPhoto: !!photo }, photo)}
          >
            Add to record
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
