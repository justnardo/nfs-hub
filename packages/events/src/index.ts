/**
 * Nervous system of the NFS hub: modules publish and listen to events instead of calling each other.
 *
 * Transport:
 *  - Supabase configured  → insert into core.events, listen via Supabase Realtime (cross-device, Rampline listens too)
 *  - Demo / offline       → browser storage + BroadcastChannel (cross-tab), queued and flushed when online
 */
import type { HubEvent } from "@nfs/db";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type { HubEvent };

export const EVENT_TYPES = {
  gateEvent: "gate.event", // payload: { flightId, event, at }
  gateTeam: "gate.team",
  gateDiscrepancy: "gate.discrepancy",
  gateFiled: "gate.filed",
  doorClose: "gate.door_close", // consumed by Rampline
  pushback: "gate.pushback", // consumed by Rampline
  agentReassigned: "agent.reassigned",
  trainingExpired: "training.expired",
} as const;

const LOG_KEY = "nfs-hub.events";
const QUEUE_KEY = "nfs-hub.outbox";
const CHANNEL = "nfs-hub-events";

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key);
  return client;
}

export function transport(): "supabase" | "local" {
  return supabase() ? "supabase" : "local";
}

/** The shared log lives in localStorage; the outbox is per device/tab (sessionStorage) until it syncs. */
function store(key: string): Storage {
  return key === QUEUE_KEY ? window.sessionStorage : window.localStorage;
}
function read<T>(key: string): T[] {
  try {
    return JSON.parse(store(key).getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}
function write<T>(key: string, v: T[]) {
  try {
    store(key).setItem(key, JSON.stringify(v));
  } catch {
    /* storage full or blocked */
  }
}

let bc: BroadcastChannel | null = null;
function channel() {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  bc ??= new BroadcastChannel(CHANNEL);
  return bc;
}

export function localEvents(): HubEvent[] {
  if (typeof window === "undefined") return [];
  return read<HubEvent>(LOG_KEY);
}

export function outbox(): HubEvent[] {
  if (typeof window === "undefined") return [];
  return read<HubEvent>(QUEUE_KEY);
}

/** Simulated network state so the demo can show offline capture. */
let forcedOffline = false;
export function setForcedOffline(v: boolean) {
  forcedOffline = v;
  if (!v) void flush();
}
export function isOnline() {
  return !forcedOffline && (typeof navigator === "undefined" || navigator.onLine);
}

export async function publish(e: Omit<HubEvent, "id" | "at"> & { at?: string }): Promise<HubEvent> {
  const ev: HubEvent = { id: crypto.randomUUID(), at: e.at ?? new Date().toISOString(), module: e.module, type: e.type, payload: e.payload };
  if (!isOnline()) {
    // held on this device; nobody else sees it until reconnect
    write(QUEUE_KEY, [...read<HubEvent>(QUEUE_KEY), ev]);
    return ev;
  }
  write(LOG_KEY, [...read<HubEvent>(LOG_KEY), ev]);
  channel()?.postMessage(ev);
  const sb = supabase();
  if (sb) {
    const { error } = await sb.schema("core").from("events").insert({ id: ev.id, at: ev.at, module: ev.module, type: ev.type, payload: ev.payload });
    if (error) write(QUEUE_KEY, [...read<HubEvent>(QUEUE_KEY), ev]);
  }
  return ev;
}

export async function flush(): Promise<number> {
  if (typeof window === "undefined" || !isOnline()) return 0;
  const queued = read<HubEvent>(QUEUE_KEY);
  if (!queued.length) return 0;
  const sb = supabase();
  if (sb) {
    const { error } = await sb.schema("core").from("events").insert(queued.map((q) => ({ ...q })));
    if (error) return 0;
  }
  write(LOG_KEY, [...read<HubEvent>(LOG_KEY), ...queued]);
  write(QUEUE_KEY, []);
  for (const q of queued) channel()?.postMessage(q);
  return queued.length;
}

export function subscribe(fn: (e: HubEvent) => void): () => void {
  const ch = channel();
  const onMsg = (m: MessageEvent) => {
    if (m.data) fn(m.data as HubEvent);
  };
  ch?.addEventListener("message", onMsg);
  const sb = supabase();
  const rt = sb
    ?.channel("core-events")
    .on("postgres_changes", { event: "INSERT", schema: "core", table: "events" }, (payload) => {
      const ev = payload.new as HubEvent;
      mergeIntoLog([ev]);
      fn(ev);
    })
    .subscribe();
  const onOnline = () => void flush();
  window.addEventListener("online", onOnline);
  return () => {
    ch?.removeEventListener("message", onMsg);
    if (rt) void sb?.removeChannel(rt);
    window.removeEventListener("online", onOnline);
  };
}

/** Add events from other devices to this browser's log (deduplicated by id). */
function mergeIntoLog(evs: HubEvent[]) {
  const log = read<HubEvent>(LOG_KEY);
  const seen = new Set(log.map((e) => e.id));
  const fresh = evs.filter((e) => !seen.has(e.id));
  if (fresh.length) write(LOG_KEY, [...log, ...fresh].sort((a, b) => a.at.localeCompare(b.at)).slice(-300));
}

/** On load: fetch recent hub events so a fresh device shows the same activity feed. */
export async function pullRecent(limit = 100): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  const { data } = await sb.schema("core").from("events").select("id,at,module,type,payload").order("at", { ascending: false }).limit(limit);
  if (data) mergeIntoLog(data as HubEvent[]);
}

export function clearLocalEvents() {
  write(LOG_KEY, []);
  write(QUEUE_KEY, []);
}
