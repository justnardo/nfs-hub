"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeftRight, CalendarPlus, Check, ChevronRight, Clock, GraduationCap, Plane, Stethoscope, Users, X } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, Input, Label, Select, Textarea, cn } from "@nfs/ui";
import { addDays, formatDate, fromMinutes, rangeDays, timingsFor, toMinutes, type Person, type ShiftCode } from "@nfs/db";
import { deriveStatus } from "@nfs/flights";
import { PAID_HOURS, SHIFT_TIMES, expiringSoon, isWork } from "@nfs/rules";
import { useEngineInput, useHub, personName } from "@/lib/store";
import { ABSENCE_TYPES } from "@/lib/absence";
import { LEAVE_TYPES, REQUEST_STATUS, isOpen, swapOptions, type StaffRequest } from "@/lib/staff-requests";
import { AirlineChip, FlightStatusBadge } from "@/components/ops";

const POS: Record<string, string> = { lead: "Lead", gate: "Gate", jetBridge: "Jet bridge", counter: "Counter" };
const SHIFT_NAME: Record<string, string> = { E: "Early", L: "Late", M: "Mid", O: "Off", V: "Vacation" };
const shiftSpan = (s: ShiftCode | undefined) => (isWork(s) ? `${SHIFT_TIMES[s].start}–${SHIFT_TIMES[s].end}` : "");
const day = (d: string) => formatDate(d, { weekday: "short", day: "numeric", month: "short" });

/** Shift lookup for everyone, built once per render of the data. */
function useShiftOf() {
  const hub = useHub();
  return React.useMemo(() => {
    const m = new Map(hub.ds.roster.map((r) => [`${r.personId}|${r.date}`, r.shift]));
    return (pid: string, d: string) => m.get(`${pid}|${d}`);
  }, [hub.ds.roster]);
}

export interface Crew {
  shift?: ShiftCode;
  airline?: string;
  movedTo?: string;
  away?: string;
  leads: Person[];
  agents: Person[];
  supervisors: Person[];
}

/** Who is on with a person on a day: same airline, same shift, plus covers moved in, the leads and the terminal supervisor. */
export function useCrew(p: Person | null | undefined, date: string): Crew {
  const hub = useHub();
  const shiftOf = useShiftOf();
  return React.useMemo(() => {
    const empty: Crew = { leads: [], agents: [], supervisors: [] };
    if (!p) return empty;
    const ab = hub.absenceOn(p.id, date);
    if (ab) return { ...empty, away: ABSENCE_TYPES[ab.type].label };
    const shift = shiftOf(p.id, date);
    if (!isWork(shift)) return { ...empty, shift };
    const moved = hub.reassignments.find((r) => r.personId === p.id && r.date === date);
    const airline = moved?.toAirline ?? p.coreAirline ?? undefined;
    const term = hub.ds.airlines.find((a) => a.code === airline)?.terminal ?? p.homeTerminal;
    const onShift = (x: Person) => x.id !== p.id && x.active !== false && shiftOf(x.id, date) === shift && !hub.absenceOn(x.id, date);
    const movedAway = new Set(hub.reassignments.filter((r) => r.date === date && r.toAirline !== airline).map((r) => r.personId));
    const movedIn = new Set(hub.reassignments.filter((r) => r.date === date && r.toAirline === airline).map((r) => r.personId));
    const team = hub.ds.people.filter((x) => onShift(x) && ((x.coreAirline === airline && !movedAway.has(x.id)) || movedIn.has(x.id)));
    const supervisors = hub.ds.people.filter((x) => x.role === "supervisor" && x.homeTerminal === term && onShift(x));
    const byName = (a: Person, b: Person) => a.firstName.localeCompare(b.firstName);
    return {
      shift,
      airline,
      movedTo: moved && moved.toAirline !== p.coreAirline ? moved.toAirline : undefined,
      leads: team.filter((x) => x.role === "lead").sort(byName),
      agents: team.filter((x) => x.role === "agent").sort(byName),
      supervisors: supervisors.sort(byName),
    };
  }, [p, date, hub, shiftOf]);
}

/** A row of people on with you, phone-friendly. */
export function CrewList({ crew, compact = false }: { crew: Crew; compact?: boolean }) {
  const groups: [string, Person[]][] = [["Supervisor", crew.supervisors], ["Lead", crew.leads], ["Agents", crew.agents]];
  if (!crew.leads.length && !crew.agents.length && !crew.supervisors.length) return <p className="text-xs text-muted">Nobody else rostered on this shift yet.</p>;
  return (
    <div className={cn("space-y-2", compact && "space-y-1.5")}>
      {groups.filter(([, list]) => list.length).map(([label, list]) => (
        <div key={label}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}{list.length > 1 && label !== "Agents" ? "s" : ""}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {list.map((x) => (
              <Link key={x.id} href={`/agents/${x.id}`} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700", label === "Agents" ? "border-line" : "border-brand-200 bg-brand-50 text-brand-800")}>
                <span className="grid size-5 place-items-center rounded-full bg-ink-800 text-[9px] font-bold text-white">{x.firstName[0]}{x.lastName[0]}</span>
                {x.firstName} {x.lastName}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- 1. My shift today ---------------- */

export function MyShiftToday({ me }: { me: Person }) {
  const hub = useHub();
  const shiftOf = useShiftOf();
  const crew = useCrew(me, hub.today);
  const a = hub.ds.airlines.find((x) => x.code === crew.airline);
  const next = React.useMemo(() => rangeDays(addDays(hub.today, 1), 21).find((d) => isWork(shiftOf(me.id, d)) && !hub.absenceOn(me.id, d)), [hub, me.id, shiftOf]);
  const working = isWork(crew.shift);
  return (
    <Card className={cn("overflow-hidden", working ? "border-brand-300" : "")}>
      <div className={cn("flex flex-wrap items-center gap-3 px-5 py-4", working ? "bg-brand-600 text-white" : crew.away ? "bg-red-50" : "bg-surface")}>
        <div className="min-w-0 flex-1">
          <p className={cn("text-[11px] font-bold uppercase tracking-[0.14em]", working ? "text-brand-100" : "text-muted")}>My shift today · {day(hub.today)}</p>
          <p className="mt-0.5 font-display text-2xl font-semibold leading-tight">
            {crew.away ? crew.away : working ? `${SHIFT_NAME[crew.shift!]} · ${shiftSpan(crew.shift)}` : crew.shift === "V" ? "On vacation" : "Day off"}
          </p>
          {working && a ? <p className="mt-0.5 text-sm text-brand-50">{crew.movedTo ? "Moved today to cover " : ""}{a.name}</p> : null}
          {!working && next ? <p className="mt-0.5 text-sm text-muted">Next shift: {day(next)} · {SHIFT_NAME[shiftOf(me.id, next)!]} {shiftSpan(shiftOf(me.id, next))}</p> : null}
        </div>
        {working && a ? <span className="rounded-lg bg-white p-1"><AirlineChip airline={a} size="lg" /></span> : null}
      </div>
      {working ? (
        <CardContent className="pt-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Users className="size-4 text-brand-600" /> On with you</p>
          <CrewList crew={crew} />
        </CardContent>
      ) : null}
    </Card>
  );
}

/* ---------------- 2. My flights today ---------------- */

export function MyFlightsToday({ me }: { me: Person }) {
  const hub = useHub();
  const mine = hub.gateLogs
    .filter((g) => g.date === hub.today && g.team.some((t) => t.personId === me.id))
    .map((g) => ({ g, f: hub.ds.flights.find((x) => x.id === g.flightId)!, pos: g.team.find((t) => t.personId === me.id)!.position }))
    .filter((x) => x.f)
    .sort((x, y) => x.f.std.localeCompare(y.f.std));
  return (
    <Card>
      <CardHeader><div><CardTitle className="flex items-center gap-1.5"><Plane className="size-4 text-brand-600" /> My flights today</CardTitle><CardDescription>Your position and the times that matter</CardDescription></div></CardHeader>
      <CardContent className="space-y-2">
        {mine.length === 0 ? <p className="text-sm text-muted">You&apos;re not on a flight team yet today. Your lead adds you on the gate log, and you&apos;ll get an alert when they do.</p> : null}
        {mine.map(({ g, f, pos }) => {
          const a = hub.ds.airlines.find((x) => x.code === f.airline);
          const t = timingsFor(a);
          const std = toMinutes(f.std);
          const st = deriveStatus(f, g, hub.today, hub.nowMin, t).status;
          return (
            <Link key={g.id} href={g.status === "filed" ? `/records/${g.id}` : `/gate/${f.id}`} className="block rounded-xl border border-line p-3 transition-colors hover:border-brand-400 hover:bg-brand-50">
              <div className="flex items-center gap-2.5">
                {a ? <AirlineChip airline={a} size="lg" /> : null}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{f.flightNo} <span className="font-normal text-muted">to {f.destination}</span></p>
                  <p className="text-xs text-muted">You&apos;re <b className="text-fg">{POS[pos] ?? pos}</b> · gate {f.gate} · STD {f.std}</p>
                </div>
                <FlightStatusBadge status={st} />
              </div>
              <div className="mt-2.5 grid grid-cols-4 gap-1 text-center">
                {[["Check-in", fromMinutes(std - t.checkInOpens)], ["Closes", fromMinutes(std - t.checkInCloses)], ["Boarding", fromMinutes(std - t.boardingStarts)], ["Gate shut", fromMinutes(std - t.gateCloses)]].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-surface py-1.5"><p className="text-[10px] text-muted">{k}</p><p className="text-sm font-semibold tabular">{v}</p></div>
                ))}
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

/* ---------------- 3 & 4. Swaps, leave and sick calls ---------------- */

export function MyRequests({ me }: { me: Person }) {
  const hub = useHub();
  const shiftOf = useShiftOf();
  const [open, setOpen] = React.useState<"swap" | "leave" | "sick" | null>(null);
  const incoming = hub.staffRequests.filter((r) => r.type === "swap" && r.with === me.id && r.status === "awaiting_colleague");
  const mine = hub.staffRequests.filter((r) => r.by === me.id || (r.type === "swap" && r.with === me.id && r.status !== "awaiting_colleague")).slice(0, 8);
  const workingSoon = isWork(shiftOf(me.id, hub.today)) || isWork(shiftOf(me.id, addDays(hub.today, 1)));
  return (
    <Card>
      <CardHeader><div><CardTitle>Swaps and time off</CardTitle><CardDescription>Ask here; your supervisor approves and the roster updates itself</CardDescription></div></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <ActionTile icon={ArrowLeftRight} label="Swap a shift" onClick={() => setOpen("swap")} />
          <ActionTile icon={CalendarPlus} label="Request leave" onClick={() => setOpen("leave")} />
          <ActionTile icon={Stethoscope} label="Call in sick" onClick={() => setOpen("sick")} tone="bad" disabled={!workingSoon} />
        </div>
        {incoming.map((r) => r.type === "swap" ? (
          <div key={r.id} className="rounded-xl border-2 border-gold-400 bg-gold-100/50 p-3">
            <p className="text-sm font-semibold">{personName(hub.people.get(r.by))} asks to swap · {day(r.date)}</p>
            <p className="mt-0.5 text-xs text-muted">You&apos;d work their {SHIFT_NAME[r.myShift].toLowerCase()} ({shiftSpan(r.myShift)}){isWork(r.theirShift) ? ` instead of your ${SHIFT_NAME[r.theirShift].toLowerCase()}` : " on your day off"}.{r.note ? ` “${r.note}”` : ""}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-10" onClick={() => hub.respondSwap(r.id, false)}><X className="size-4" /> Decline</Button>
              <Button className="h-10" onClick={() => hub.respondSwap(r.id, true)}><Check className="size-4" /> Accept</Button>
            </div>
          </div>
        ) : null)}
        {mine.length ? (
          <div className="divide-y divide-line rounded-xl border border-line">
            {mine.map((r) => <RequestRow key={r.id} r={r} me={me} />)}
          </div>
        ) : null}
      </CardContent>
      {open === "swap" ? <SwapDialog me={me} onClose={() => setOpen(null)} /> : null}
      {open === "leave" ? <LeaveDialog me={me} onClose={() => setOpen(null)} /> : null}
      {open === "sick" ? <SickDialog me={me} onClose={() => setOpen(null)} /> : null}
    </Card>
  );
}

function ActionTile({ icon: Icon, label, onClick, tone, disabled }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; tone?: "bad"; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={cn("flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-center text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40", tone === "bad" ? "border-red-200 text-red-800 enabled:hover:bg-bad-soft" : "border-line enabled:hover:border-brand-400 enabled:hover:bg-brand-50 enabled:hover:text-brand-700")}>
      <Icon className="size-5" />
      {label}
    </button>
  );
}

function RequestRow({ r, me }: { r: StaffRequest; me: Person }) {
  const hub = useHub();
  const st = REQUEST_STATUS[r.status];
  const title = r.type === "swap" ? `Swap ${day(r.date)} with ${personName(hub.people.get(r.by === me.id ? r.with : r.by))}` : `${ABSENCE_TYPES[r.absenceType].label} · ${r.from === r.to ? day(r.from) : `${day(r.from)} – ${day(r.to)}`}`;
  return (
    <div className="flex items-center gap-2 p-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="truncate text-xs text-muted">{r.decisionNote ? r.decisionNote : r.decidedBy ? `By ${r.decidedBy}` : `Sent ${new Date(r.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "America/Nassau" })}`}</p>
      </div>
      <Badge tone={st.tone}>{st.label}</Badge>
      {r.by === me.id && isOpen(r) ? <Button size="sm" variant="ghost" onClick={() => hub.cancelRequest(r.id)}>Cancel</Button> : null}
    </div>
  );
}

function SwapDialog({ me, onClose }: { me: Person; onClose: () => void }) {
  const hub = useHub();
  const input = useEngineInput();
  const shiftOf = useShiftOf();
  const days = React.useMemo(() => rangeDays(addDays(hub.today, 1), 28).filter((d) => d <= hub.ds.horizonEnd && isWork(shiftOf(me.id, d)) && !hub.absenceOn(me.id, d)), [hub, me.id, shiftOf]);
  const [date, setDate] = React.useState(days[0] ?? "");
  const [pick, setPick] = React.useState<string>("");
  const [note, setNote] = React.useState("");
  const options = React.useMemo(() => (date ? swapOptions(input, hub.rules, me, date, shiftOf, (pid, d) => !!hub.absenceOn(pid, d)) : []), [input, hub, me, date, shiftOf]);
  const chosen = options.find((o) => o.person.id === pick);
  const myShift = shiftOf(me.id, date);
  const pending = hub.staffRequests.some((r) => r.type === "swap" && r.by === me.id && r.date === date && isOpen(r));
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-lg"
        title="Swap a shift"
        description="Pick the day, then a colleague. Gateline only offers swaps that keep both of you within the rules; they accept, then your supervisor approves."
        footer={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" className="h-11 sm:h-9" onClick={onClose}>Cancel</Button>
            <Button className="h-11 sm:h-9" disabled={!chosen || chosen.blocks.length > 0 || !!chosen.reason || pending} onClick={() => { hub.requestSwap({ with: chosen!.person.id, date, myShift: myShift!, theirShift: chosen!.theirShift, note: note.trim() || undefined }); onClose(); }}>Send request</Button>
          </div>
        }
      >
        {days.length === 0 ? <p className="text-sm text-muted">No working days on your roster in the next four weeks.</p> : null}
        <Label className="text-xs">Your shift to swap</Label>
        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
          {days.map((d) => (
            <button key={d} type="button" onClick={() => { setDate(d); setPick(""); }} className={cn("shrink-0 cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors", d === date ? "border-brand-600 bg-brand-600 text-white" : "border-line hover:border-brand-400 hover:bg-brand-50")}>
              <span className="block text-xs font-semibold">{day(d)}</span>
              <span className={cn("block text-[11px]", d === date ? "text-brand-100" : "text-muted")}>{SHIFT_NAME[shiftOf(me.id, d)!]}</span>
            </button>
          ))}
        </div>
        {pending ? <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-amber-900">You already have a swap request open for this day.</p> : null}
        {date ? (
          <>
            <Label className="mt-4 block text-xs">Swap with</Label>
            <div className="mt-1.5 space-y-1.5">
              {options.length === 0 ? <p className="text-sm text-muted">Nobody on your team can swap that day.</p> : null}
              {options.length > 0 && options.every((o) => o.blocks.length > 0 || !!o.reason) ? <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-amber-900">Nobody can take this shift within the rules. Try another day.</p> : null}
              {options.map((o) => {
                const blocked = o.blocks.length > 0 || !!o.reason;
                return (
                  <button key={o.person.id} type="button" disabled={blocked} onClick={() => setPick(o.person.id)} className={cn("flex w-full cursor-pointer items-center gap-3 rounded-xl border p-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55", pick === o.person.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-line enabled:hover:border-brand-400 enabled:hover:bg-brand-50")}>
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-800 text-xs font-bold text-white">{o.person.firstName[0]}{o.person.lastName[0]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{personName(o.person)}</span>
                      <span className="block text-xs text-muted">
                        {blocked ? o.reason ?? o.blocks[0].message.split(": ").slice(1).join(": ") : isWork(o.theirShift) ? `You take their ${SHIFT_NAME[o.theirShift].toLowerCase()}, they take your ${SHIFT_NAME[myShift ?? "O"].toLowerCase()}` : `They cover you; you get the day off`}
                      </span>
                      {!blocked && o.warnings.length ? <span className="block text-[11px] text-amber-800">{o.warnings[0].message.split(": ").slice(1).join(": ")}</span> : null}
                    </span>
                    {blocked ? <Badge tone="bad">Not allowed</Badge> : pick === o.person.id ? <Check className="size-5 text-brand-600" /> : <ChevronRight className="size-4 text-ink-300" />}
                  </button>
                );
              })}
            </div>
            <Label className="mt-4 block text-xs">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" placeholder="e.g. Family event" />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function LeaveDialog({ me, onClose }: { me: Person; onClose: () => void }) {
  const hub = useHub();
  const shiftOf = useShiftOf();
  const [type, setType] = React.useState<(typeof LEAVE_TYPES)[number]>("annual");
  const [from, setFrom] = React.useState(addDays(hub.today, 7));
  const [to, setTo] = React.useState(addDays(hub.today, 7));
  const [note, setNote] = React.useState("");
  const span = from && to && to >= from ? rangeDays(from, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1) : [];
  const shifts = span.filter((d) => isWork(shiftOf(me.id, d))).length;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-md"
        title="Request leave"
        description="Your supervisor and the duty manager get it straight away. Once approved it goes on the roster and coverage."
        footer={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" className="h-11 sm:h-9" onClick={onClose}>Cancel</Button>
            <Button className="h-11 sm:h-9" disabled={!span.length || from < hub.today} onClick={() => { hub.requestLeave({ absenceType: type, from, to, note: note.trim() || undefined }); onClose(); }}>Send request</Button>
          </div>
        }
      >
        <Label className="text-xs">Type</Label>
        <Select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="mt-1 w-full">{LEAVE_TYPES.map((t) => <option key={t} value={t}>{ABSENCE_TYPES[t].label}</option>)}</Select>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div><Label className="text-xs">From</Label><Input type="date" value={from} min={hub.today} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} className="mt-1" /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="mt-1" /></div>
        </div>
        <p className="mt-2 text-xs text-muted">{span.length} day{span.length === 1 ? "" : "s"}{span.length ? ` · ${shifts} rostered shift${shifts === 1 ? "" : "s"} to cover` : ""}</p>
        <Label className="mt-3 block text-xs">Note (optional)</Label>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" placeholder="Anything your supervisor should know" />
      </DialogContent>
    </Dialog>
  );
}

function SickDialog({ me, onClose }: { me: Person; onClose: () => void }) {
  const hub = useHub();
  const shiftOf = useShiftOf();
  const opts = [hub.today, addDays(hub.today, 1)].filter((d) => isWork(shiftOf(me.id, d)));
  const [d, setD] = React.useState(opts[0] ?? hub.today);
  const [note, setNote] = React.useState("");
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-md"
        title="Call in sick"
        description="Your terminal supervisors are alerted at once so they can find cover. Feel better soon."
        footer={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" className="h-11 sm:h-9" onClick={onClose}>Cancel</Button>
            <Button className="h-11 bg-red-600 hover:bg-red-700 sm:h-9" onClick={() => { hub.saveAbsence({ personId: me.id, type: "sick", from: d, to: d, note: note.trim() || "Reported from My schedule" }); onClose(); }}>Report sick</Button>
          </div>
        }
      >
        <Label className="text-xs">Which shift?</Label>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {opts.map((x) => (
            <button key={x} type="button" onClick={() => setD(x)} className={cn("cursor-pointer rounded-xl border p-3 text-left transition-colors", d === x ? "border-red-300 bg-bad-soft text-red-900" : "border-line hover:border-brand-400 hover:bg-brand-50")}>
              <span className="block text-sm font-semibold">{x === hub.today ? "Today" : "Tomorrow"}</span>
              <span className="block text-xs text-muted">{SHIFT_NAME[shiftOf(me.id, x)!]} · {shiftSpan(shiftOf(me.id, x))}</span>
            </button>
          ))}
        </div>
        <Label className="mt-3 block text-xs">Note for your supervisor (optional)</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" placeholder="No details needed" />
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- 5. Hours and training ---------------- */

export function MyHours({ me }: { me: Person }) {
  const hub = useHub();
  const shiftOf = useShiftOf();
  const max = hub.rules["weekly-hours-max"].params.hours as number;
  const dow = new Date(`${hub.today}T12:00:00Z`).getUTCDay();
  const weekStart = addDays(hub.today, -dow);
  const week = rangeDays(weekStart, 7);
  const monthStart = `${hub.today.slice(0, 8)}01`;
  const monthDays = rangeDays(monthStart, Number(new Date(Date.UTC(Number(hub.today.slice(0, 4)), Number(hub.today.slice(5, 7)), 0)).getUTCDate()));
  const worked = (d: string) => d < hub.today || (d === hub.today && isWork(shiftOf(me.id, d)) && hub.nowMin >= toMinutes(SHIFT_TIMES[shiftOf(me.id, d) as "E"].end));
  const hours = (days: string[]) => {
    const work = days.filter((d) => isWork(shiftOf(me.id, d)) && !hub.absenceOn(me.id, d));
    return { rostered: work.length * PAID_HOURS, done: work.filter(worked).length * PAID_HOURS };
  };
  const w = hours(week);
  const m = hours(monthDays);
  return (
    <Card>
      <CardHeader><div><CardTitle className="flex items-center gap-1.5"><Clock className="size-4 text-brand-600" /> My hours</CardTitle><CardDescription>Paid hours from the roster, 8 per shift</CardDescription></div></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {[["This week", w, max], ["This month", m, null]].map(([label, h, cap]) => {
            const v = h as { rostered: number; done: number };
            const over = typeof cap === "number" && v.rostered > cap;
            return (
              <div key={label as string} className="rounded-xl bg-surface p-3">
                <p className="text-xs text-muted">{label as string}</p>
                <p className={cn("font-display text-2xl font-semibold tabular", over ? "text-amber-700" : "text-fg")}>{v.rostered}h</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-brand-500" style={{ width: `${v.rostered ? Math.min(100, (v.done / v.rostered) * 100) : 0}%` }} /></div>
                <p className="mt-1 text-[11px] text-muted">{v.done}h worked so far{over ? ` · ${v.rostered - (cap as number)}h over ${cap}h` : ""}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function MyTraining({ me }: { me: Person }) {
  const hub = useHub();
  const soon = expiringSoon(me, hub.today, 30);
  const expired = me.training.filter((t) => t.expires < hub.today);
  const { remindOnce } = hub;
  React.useEffect(() => {
    for (const t of [...expired, ...soon]) {
      remindOnce(`train-${me.id}-${t.airline}-${t.course}-${t.expires}`.replace(/\s+/g, "_"), {
        to: [me.id],
        kind: "team",
        title: t.expires < hub.today ? `Training expired: ${t.course}` : `Training due: ${t.course}`,
        body: `${t.expires < hub.today ? "Expired" : "Expires"} ${formatDate(t.expires, { day: "numeric", month: "short" })}. Until it's renewed you can't be rostered on ${t.airline}. Book with the training department.`,
        href: "/me",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, expired.length, soon.length]);
  const items = [...expired.map((t) => ({ t, bad: true })), ...soon.map((t) => ({ t, bad: false }))];
  return (
    <Card>
      <CardHeader><div><CardTitle className="flex items-center gap-1.5"><GraduationCap className="size-4 text-brand-600" /> Training reminders</CardTitle><CardDescription>Anything expired or due in the next 30 days</CardDescription></div></CardHeader>
      <CardContent className="space-y-1.5">
        {items.length === 0 ? <p className="flex items-center gap-1.5 text-sm text-green-800"><Check className="size-4" /> All your training is current.</p> : null}
        {items.map(({ t, bad }) => {
          const a = hub.ds.airlines.find((x) => x.code === t.airline);
          return (
            <div key={`${t.airline}-${t.course}`} className={cn("flex items-center gap-2 rounded-lg border p-2.5", bad ? "border-red-200 bg-bad-soft/60" : "border-amber-200 bg-warn-soft/60")}>
              {a ? <AirlineChip airline={a} /> : null}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.course}</span>
              <Badge tone={bad ? "bad" : "warn"}>{bad ? "Expired" : "Due"} {formatDate(t.expires, { day: "numeric", month: "short" })}</Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
