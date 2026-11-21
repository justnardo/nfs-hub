"use client";
import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowLeftRight, BadgeCheck, CalendarDays, ChevronRight, CircleDot, FileCheck2, Luggage, Radio, Siren, Undo2, Users, type LucideIcon,
} from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, cn } from "@nfs/ui";
import { GATE_EVENT_LABEL, timingsFor, type Airline, type Flight, type GateEventType, type HubEvent } from "@nfs/db";
import { deriveStatus } from "@nfs/flights";
import { useHub, personName } from "@/lib/store";
import { AirlineChip, FlightStatusBadge } from "@/components/ops";
import { Pagination, usePaged } from "@/components/pagination";

type Tone = "brand" | "gold" | "warn" | "ok" | "bad";
const TONE: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-700",
  gold: "bg-gold-100 text-gold-700",
  warn: "bg-warn-soft text-amber-800",
  ok: "bg-ok-soft text-green-800",
  bad: "bg-bad-soft text-red-700",
};
const POS: Record<string, string> = { lead: "lead", gate: "gate", jetBridge: "jet bridge", counter: "counter" };
const HIDDEN = new Set(["gate.door_close", "gate.pushback"]);

interface Described { title: string; detail: string; tone: Tone; icon: LucideIcon; who?: string; gateTime?: string }

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Nassau" });
const hhmm = (v: unknown) => (typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : undefined);

/** Turn a Hub event into plain words: what happened, who did it, and how it should look. */
function useDescribe() {
  const hub = useHub();
  return React.useCallback(
    (e: HubEvent, f?: Flight): Described => {
      const p = e.payload;
      const log = f ? hub.logByFlight.get(f.id) : undefined;
      const lead = log?.leadId ? personName(hub.people.get(log.leadId)) : undefined;
      const name = (id: unknown) => (typeof id === "string" ? personName(hub.people.get(id)) : "");
      const at = hhmm(p.at);
      switch (e.type) {
        case "gate.event": {
          const ev = GATE_EVENT_LABEL[p.event as GateEventType] ?? "Gate event";
          return { title: ev, detail: `${lead ?? "The lead"} tapped ${ev.toLowerCase()}${at ? ` at ${at}` : ""} on the gate log.`, tone: "brand", icon: CircleDot, who: lead, gateTime: at };
        }
        case "gate.event_undone": {
          const ev = GATE_EVENT_LABEL[p.event as GateEventType];
          return { title: `Undid ${ev ? ev.toLowerCase() : "a tap"}`, detail: `${lead ?? "The lead"} took back the ${ev ? ev.toLowerCase() : "last"} time, usually a mistap that's corrected straight after.`, tone: "gold", icon: Undo2, who: lead };
        }
        case "gate.team": {
          const team = (Array.isArray(p.team) ? p.team : []) as { personId: string; position: string }[];
          const l = team.find((t) => t.position === "lead");
          return { title: "Team set", detail: `${team.length} on the flight${l ? `, led by ${name(l.personId)}` : ""}: ${team.filter((t) => t.position !== "lead").map((t) => `${name(t.personId)} (${POS[t.position] ?? t.position})`).join(", ") || "no agents yet"}. Everyone added got an alert.`, tone: "brand", icon: Users, who: l ? name(l.personId) : lead };
        }
        case "gate.discrepancy":
          return { title: `${p.type ?? "Discrepancy"} logged`, detail: `${lead ?? "The lead"} logged ${String(p.type ?? "a discrepancy").toLowerCase()}${at ? ` at ${at}` : ""}${Number(p.bags) ? `, with ${p.bags} bag${Number(p.bags) > 1 ? "s" : ""} to come off` : ""}. Notes and photos are on the gate record.`, tone: "warn", icon: AlertTriangle, who: lead, gateTime: at };
        case "gate.bag_offload":
          return { title: "Bags sent to the ramp", detail: `${Number(p.bags) || "The"} bag${Number(p.bags) === 1 ? "" : "s"}${p.bagTags ? ` (tags ${p.bagTags})` : ""} handed to the ramp team in Rampline to offload.`, tone: "warn", icon: Luggage, who: lead };
        case "ramp.offload_done":
          return { title: "Ramp: bags off", detail: `The ramp team confirmed in Rampline that the bags are off${at ? ` at ${at}` : ""}.`, tone: "ok", icon: Luggage, who: typeof p.by === "string" ? p.by : undefined, gateTime: at };
        case "gate.filed": {
          const d = Number(p.delay) || 0;
          return { title: "Record filed", detail: d ? `Filed with a ${d}-minute delay${p.cause ? ` (${String(p.cause).toLowerCase()})` : ""}. It now counts in analytics and the board report.` : "Filed on time. It now counts in analytics and the board report.", tone: "ok", icon: FileCheck2, who: lead };
        }
        case "flight.gate_change":
          return { title: `Gate ${p.from ?? "?"} → ${p.to ?? "?"}`, detail: `The gate changed from ${p.from ?? "?"} to ${p.to ?? "?"}${p.reason ? ` (${String(p.reason).toLowerCase()})` : ""}. The flight's team was alerted on their phones.`, tone: "gold", icon: ArrowLeftRight };
        case "ops.inbound_alert":
          return { title: `${p.urgent ? "Urgent: " : ""}${p.category ?? "Inbound alert"}`, detail: `${p.by ?? "Operations"} flagged the inbound in Rampline: ${p.message ?? ""}${Number(p.wheelchairs) ? ` ${p.wheelchairs} extra wheelchair${Number(p.wheelchairs) > 1 ? "s" : ""} needed at the door.` : ""}`, tone: "bad", icon: Siren, who: typeof p.by === "string" ? p.by : undefined };
        case "gate.alert_ack":
          return { title: "Alert acknowledged", detail: `${p.by ?? "Passenger services"} acknowledged the Rampline alert${at ? ` at ${at}` : ""}. Operations can see it's been seen.`, tone: "ok", icon: BadgeCheck, who: typeof p.by === "string" ? p.by : undefined };
        case "agent.reassigned":
          return { title: "Cover placed", detail: `${name(p.personId) || "An agent"} moved to cover ${p.toAirline ?? "another airline"}${p.shift ? ` on the ${p.shift === "E" ? "early" : p.shift === "L" ? "late" : "mid"} shift` : ""}${p.reason ? `: ${p.reason}` : ""}.`, tone: "brand", icon: Users, who: typeof p.by === "string" ? p.by : undefined };
        case "roster.changed":
          return { title: "Roster changed", detail: `${p.cells ?? "Some"} shift${p.cells === 1 ? "" : "s"} changed${p.by ? ` by ${p.by}` : ""}. Coverage updated straight away.`, tone: "brand", icon: CalendarDays, who: typeof p.by === "string" ? p.by : undefined };
        default:
          return { title: e.type.replace(/[._]/g, " "), detail: "Recorded in the Hub.", tone: "brand", icon: Radio };
      }
    },
    [hub.logByFlight, hub.people],
  );
}

/**
 * The feed: everything published to the Hub, plus today's gate log taps rebuilt from the records,
 * so the board is never blank after a reset or on a device that joined mid-shift.
 */
function useFeed(): HubEvent[] {
  const hub = useHub();
  return React.useMemo(() => {
    const real = hub.events.filter((e) => !HIDDEN.has(e.type));
    const seen = new Set(real.map((e) => `${e.payload.flightId ?? e.payload.flightNo}|${e.type}|${e.payload.event ?? e.payload.type ?? ""}`));
    const iso = (t: string) => `${hub.today}T${t}:00-05:00`;
    const nowHHMM = `${String(Math.floor(hub.nowMin / 60)).padStart(2, "0")}:${String(hub.nowMin % 60).padStart(2, "0")}`;
    const derived: HubEvent[] = [];
    const add = (id: string, t: string, type: string, payload: Record<string, unknown>) => {
      if (t > nowHHMM) return;
      if (seen.has(`${payload.flightId ?? payload.flightNo}|${type}|${payload.event ?? payload.type ?? ""}`)) return;
      derived.push({ id, at: iso(t), module: type.startsWith("ops.") ? "rampline" : "gateline", type, payload });
    };
    for (const g of hub.gateLogs) {
      if (g.date !== hub.today) continue;
      for (const [ev, t] of Object.entries(g.events)) if (t) add(`d-${g.id}-${ev}`, t, "gate.event", { flightId: g.flightId, airline: g.airline, event: ev, at: t });
      for (const d of g.discrepancies) if (d.at) add(`d-${d.id}`, d.at, "gate.discrepancy", { flightId: g.flightId, airline: g.airline, type: d.type, at: d.at, bags: d.bags ?? 0 });
      if (g.status === "filed" && g.filedAt) add(`d-${g.id}-filed`, g.filedAt, "gate.filed", { flightId: g.flightId, airline: g.airline, delay: g.delayMinutes, cause: g.delayCause });
    }
    for (const f of hub.ds.flights) {
      if (f.date !== hub.today) continue;
      for (const a of hub.alertsFor(f.id)) {
        const t = /^\d{2}:\d{2}$/.test(a.at) ? a.at : new Date(a.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Nassau" });
        add(`d-${a.id}`, t, "ops.inbound_alert", { flightId: f.id, airline: f.airline, category: a.category, message: a.message, wheelchairs: a.wheelchairs, urgent: a.urgent, by: a.by });
      }
    }
    return [...real, ...derived].sort((x, y) => y.at.localeCompare(x.at));
  }, [hub.events, hub.gateLogs, hub.ds.flights, hub.today, hub.nowMin, hub.alertsFor]);
}

function useFlightOf() {
  const hub = useHub();
  return React.useCallback(
    (e: HubEvent): Flight | undefined => {
      const p = e.payload;
      if (typeof p.flightId === "string") return hub.ds.flights.find((x) => x.id === p.flightId);
      if (typeof p.flightNo === "string") return hub.ds.flights.find((x) => x.flightNo === p.flightNo && x.date === (p.date ?? hub.today));
      return undefined;
    },
    [hub.ds.flights, hub.today],
  );
}

/** Today's live feed from leads' phones and Rampline. Logos make the airline obvious; tap any line for the full story. */
export function LiveActivity({ className, perPage = 6 }: { className?: string; perPage?: number }) {
  const hub = useHub();
  const describe = useDescribe();
  const flightOf = useFlightOf();
  const airlines = React.useMemo(() => new Map(hub.ds.airlines.map((a) => [a.code, a])), [hub.ds.airlines]);
  const all = useFeed();
  const feed = React.useMemo(() => all.slice(0, 60), [all]);
  const page = usePaged(feed, perPage);
  const [open, setOpen] = React.useState<HubEvent | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const latest = feed[0];
  const ago = latest ? Math.max(0, Math.round((now - new Date(latest.at).getTime()) / 60_000)) : null;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="border-b border-line bg-brand-50/50 pb-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-green-500" />
            </span>
            Live gate activity
          </CardTitle>
          <CardDescription>
            {latest ? `Last update ${ago === 0 ? "just now" : ago! < 60 ? `${ago} min ago` : `at ${clock(latest.at)}`} · tap any line for details` : "From leads' phones and Rampline"}
          </CardDescription>
        </div>
        <Badge tone="ok">Live</Badge>
      </CardHeader>
      <CardContent className="space-y-1.5 px-3 pt-3 sm:px-4">
        {feed.length === 0 ? <p className="px-1 py-2 text-sm text-muted">Waiting for the first tap from a gate. Open the gate log on a phone to see events land here.</p> : null}
        {page.rows.map((e) => {
          const f = flightOf(e);
          const code = f?.airline ?? (e.payload.airline as string) ?? (e.payload.toAirline as string);
          const a = code ? airlines.get(code) : undefined;
          const d = describe(e, f);
          const fresh = now - new Date(e.at).getTime() < 10 * 60_000;
          const Icon = d.icon;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setOpen(e)}
              className="group flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl border border-line bg-card px-2.5 py-2 text-left transition-colors hover:border-brand-400 hover:bg-brand-50"
            >
              <span className="relative shrink-0">
                {a ? <AirlineChip airline={a} size="lg" /> : <span className="grid h-11 w-14 place-items-center rounded-md bg-ink-800 text-white"><Radio className="size-5" /></span>}
                <span className={cn("absolute -bottom-1.5 -right-2 grid size-5 place-items-center rounded-full ring-2 ring-card", TONE[d.tone])}><Icon className="size-3" /></span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="font-semibold tabular">{f?.flightNo ?? (typeof e.payload.flightNo === "string" ? e.payload.flightNo : a?.name ?? "Hub")}</span>
                  {fresh ? <span className="rounded-full bg-green-100 px-1.5 text-[10px] font-bold uppercase text-green-800">New</span> : null}
                </span>
                <span className="block truncate text-[13px] text-muted">{d.title}{d.who ? ` · ${d.who}` : ""}</span>
              </span>
              <span className="text-right">
                <span className="block text-xs font-semibold tabular text-ink-700">{d.gateTime ?? clock(e.at)}</span>
                <ChevronRight className="ml-auto size-4 text-ink-300 transition-colors group-hover:text-brand-600" />
              </span>
            </button>
          );
        })}
        <Pagination paged={page} noun="events" sizes={[perPage]} className="mt-2" />
      </CardContent>
      {open ? <EventSheet e={open} onClose={() => setOpen(null)} airlines={airlines} /> : null}
    </Card>
  );
}

function EventSheet({ e, onClose, airlines }: { e: HubEvent; onClose: () => void; airlines: Map<string, Airline> }) {
  const hub = useHub();
  const describe = useDescribe();
  const flightOf = useFlightOf();
  const f = flightOf(e);
  const a = f ? airlines.get(f.airline) : undefined;
  const d = describe(e, f);
  const log = f ? hub.logByFlight.get(f.id) : undefined;
  const status = f ? deriveStatus(f, log, hub.today, hub.nowMin, timingsFor(a)).status : undefined;
  const all = useFeed();
  const timeline = f ? all.filter((x) => flightOf(x)?.id === f.id).sort((x, y) => x.at.localeCompare(y.at)) : [];
  const Icon = d.icon;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" title={f ? `${f.flightNo} · ${d.title}` : d.title} description={f ? `${a?.name ?? f.airline} to ${f.destination} · STD ${f.std} · gate ${f.gate}` : undefined}>
        <div className={cn("flex items-start gap-3 rounded-xl p-3", TONE[d.tone])}>
          <Icon className="mt-0.5 size-5 shrink-0" />
          <p className="text-sm leading-snug">{d.detail}</p>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
          {f && a ? <div className="col-span-2 flex items-center gap-2"><AirlineChip airline={a} size="md" />{status ? <span className="ml-auto"><FlightStatusBadge status={status} /></span> : null}</div> : null}
          {d.gateTime ? <Item k="Time at the gate" v={d.gateTime} /> : null}
          <Item k="Received" v={clock(e.at)} />
          {d.who ? <Item k="By" v={d.who} /> : null}
          <Item k="From" v={e.module === "rampline" || e.type.startsWith("ramp.") || e.type.startsWith("ops.") ? "Rampline" : "Gateline"} />
        </dl>
        {timeline.length > 1 ? (
          <div className="mt-5">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">This flight today</p>
            <ol className="mt-2 space-y-0">
              {timeline.map((x, i) => {
                const dx = describe(x, f);
                const cur = x.id === e.id;
                return (
                  <li key={x.id} className="relative flex gap-3 pb-3 last:pb-0">
                    {i < timeline.length - 1 ? <span className="absolute left-[5px] top-3 h-full w-px bg-line" /> : null}
                    <span className={cn("relative mt-1 size-[11px] shrink-0 rounded-full border-2", cur ? "border-gold-500 bg-gold-500" : "border-brand-400 bg-card")} />
                    <span className={cn("flex-1 text-sm", cur ? "font-semibold text-fg" : "text-muted")}>{dx.title}</span>
                    <span className="text-xs tabular text-muted">{dx.gateTime ?? clock(x.at)}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {f ? (
            <Button asChild>
              <Link href={log?.status === "filed" ? `/records/${log.id}` : `/gate/${f.id}`}>{log?.status === "filed" ? "Open record" : "Open gate log"}</Link>
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}
