"use client";
import * as React from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@nfs/ui";

type HubEvent = { id: string; at: string; module: string; type: string; payload: Record<string, unknown> };

/** How each hub event reads to a manager. Unknown types are not shown. */
const LABEL: Record<string, string> = {
  "gate.door_close": "Door closed",
  "gate.pushback": "Pushback",
  "gate.bag_offload": "Bags to pull",
  "gate.filed": "Flight record filed",
  "gate.alert_ack": "Alert seen at the gate",
  "flight.gate_change": "Gate changed",
  "agent.reassigned": "Agent moved to cover",
  "ops.inbound_alert": "Inbound alert",
  "ramp.offload_done": "Bags off",
  "hub.ping": "Connection check",
};
const MODULE: Record<string, { name: string; cls: string }> = {
  gateline: { name: "Gateline", cls: "bg-brand-50 text-brand-700" },
  rampline: { name: "Rampline", cls: "bg-gold-100 text-gold-700" },
};

let client: SupabaseClient | null = null;
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const flightOf = (p: Record<string, unknown>) =>
  str(p.flightNo) || str(p.flightId).replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/^([A-Z0-9]{2})(\d)/, "$1 $2");
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Nassau" });
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Nassau" });

function detail(e: HubEvent) {
  const p = e.payload;
  if (e.type === "ops.inbound_alert") return `${str(p.category)}: ${str(p.message)}`;
  if (e.type === "gate.bag_offload") return `${str(p.bags)} bag(s) · ${str(p.reason)} · gate ${str(p.gate)}`;
  if (e.type === "ramp.offload_done") return `at ${str(p.at)}${p.by ? ` · ${str(p.by)}` : ""}`;
  if (e.type === "flight.gate_change") return `${str(p.from)} → ${str(p.to)}${p.reason ? ` · ${str(p.reason)}` : ""}`;
  if (e.type === "gate.alert_ack") return p.by ? `by ${str(p.by)}` : "";
  if ((e.type === "gate.door_close" || e.type === "gate.pushback") && p.at) return `at ${str(p.at)}`;
  if (e.type === "gate.filed") return p.delay ? `+${str(p.delay)} min · ${str(p.cause)}` : "on time";
  return "";
}

/** The hub's event log, live: what each module just told the others. */
export function LiveFeed({ hubUrl, hubKey }: { hubUrl: string; hubKey: string }) {
  const configured = Boolean(hubUrl && hubKey);
  const [events, setEvents] = React.useState<HubEvent[]>([]);
  const [status, setStatus] = React.useState<"connecting" | "live" | "down">("connecting");
  const [fresh, setFresh] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!configured) return;
    client ??= createClient(hubUrl, hubKey, { auth: { persistSession: false } });
    const sb = client;
    let gone = false;
    void sb.schema("core").from("events").select("id,at,module,type,payload").order("at", { ascending: false }).limit(60)
      .then(({ data }) => { if (!gone && data) setEvents(data as HubEvent[]); });
    const ch = sb
      .channel("hub-home")
      .on("postgres_changes", { event: "INSERT", schema: "core", table: "events" }, (m) => {
        const ev = m.new as HubEvent;
        setEvents((xs) => (xs.some((x) => x.id === ev.id) ? xs : [ev, ...xs].slice(0, 80)));
        setFresh((s) => new Set(s).add(ev.id));
      })
      .subscribe((s) => {
        if (s === "SUBSCRIBED") setStatus("live");
        if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setStatus("down");
      });
    return () => { gone = true; void sb.removeChannel(ch); };
  }, [configured, hubUrl, hubKey]);

  const live = configured ? status : "down";
  const shown = events.filter((e) => LABEL[e.type] && e.type !== "hub.ping");
  const today = dayKey(new Date().toISOString());
  const todays = shown.filter((e) => dayKey(e.at) === today);
  const count = (m: string) => todays.filter((e) => e.module === m).length;

  return (
    <section className="mt-6 rounded-2xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold">Live across the hub</p>
          <p className="text-sm text-muted">Events as the apps send them, newest first.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-surface px-2.5 py-1 text-xs"><b className="tabular">{count("gateline")}</b> from Gateline today</span>
          <span className="rounded-full bg-surface px-2.5 py-1 text-xs"><b className="tabular">{count("rampline")}</b> from Rampline today</span>
          {live === "live" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-1 text-xs font-semibold text-green-800"><Wifi className="hub-pulse size-3.5" /> Connected</span>
          ) : live === "down" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-bad-soft px-2.5 py-1 text-xs font-semibold text-bad"><WifiOff className="size-3.5" /> Not connected</span>
          ) : (
            <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-muted">Connecting…</span>
          )}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nothing yet. Tap a gate event in Gateline or send an alert from Rampline and it appears here.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {shown.slice(0, 14).map((e) => {
            const m = MODULE[e.module] ?? { name: e.module, cls: "bg-surface text-muted" };
            return (
              <li key={e.id} className={cn("flex items-center gap-3 py-2.5 text-sm", fresh.has(e.id) && "hub-in")}>
                <span className="w-11 shrink-0 text-xs text-muted tabular">{time(e.at)}</span>
                <span className={cn("w-[5.5rem] shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold", m.cls)}>{m.name}</span>
                <span className="w-20 shrink-0 font-semibold">{flightOf(e.payload)}</span>
                <span className="min-w-0 flex-1 truncate"><span className="font-medium">{LABEL[e.type]}</span> <span className="text-muted">{detail(e)}</span></span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
