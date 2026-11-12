"use client";
import * as React from "react";
import {
  generateDataset, nassauNow, type Dataset, type FeedbackItem, type GateEventType, type GateLog,
  type HubEvent, type Person, type Reassignment,
} from "@nfs/db";
import { readSession, type Session } from "@nfs/auth";
import { EVENT_TYPES, flush, isOnline, localEvents, outbox, publish, pullRecent, setForcedOffline, subscribe, clearLocalEvents } from "@nfs/events";
import { pullState, pushFeedback, pushLog, pushReassignment, remoteEnabled, removeReassignmentRemote, resetRemote, subscribeState } from "./remote";

/**
 * Demo data layer. Seed data is generated deterministically in the browser (fictional staff),
 * then merged with what devices record (gate logs, reassignments, feedback status).
 * Shared state lives in localStorage so a second tab (e.g. the manager dashboard) updates live;
 * while "offline", gate logs are held in this tab's sessionStorage outbox until reconnect.
 */
const K_LOGS = "gateline.logs";
const K_PENDING = "gateline.logs.pending"; // sessionStorage — this device only
const K_REASSIGN = "gateline.reassignments";
const K_FEEDBACK = "gateline.feedback";
const K_OFFLINE = "gateline.offline"; // sessionStorage

function load<T>(storage: "local" | "session", key: string, fallback: T): T {
  try {
    const s = storage === "local" ? window.localStorage : window.sessionStorage;
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(storage: "local" | "session", key: string, v: unknown) {
  try {
    (storage === "local" ? window.localStorage : window.sessionStorage).setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

interface HubState {
  ready: boolean;
  ds: Dataset;
  today: string;
  nowMin: number;
  session: Session | null;
  me: Person | null;
  people: Map<string, Person>;
  gateLogs: GateLog[];
  logByFlight: Map<string, GateLog>;
  reassignments: Reassignment[];
  feedback: FeedbackItem[];
  events: HubEvent[];
  offline: boolean;
  pendingCount: number;
  setOffline: (v: boolean) => void;
  saveLog: (log: GateLog, change?: { type: string; payload: Record<string, unknown> }) => void;
  addReassignment: (r: Omit<Reassignment, "id" | "at">) => void;
  removeReassignment: (id: string) => void;
  setFeedbackStatus: (id: string, status: FeedbackItem["status"]) => void;
  refreshSession: () => void;
  resetDemo: () => void;
}

const Ctx = React.createContext<HubState | null>(null);

function emptyDataset(today: string): Dataset {
  return { today, nowMinutes: 0, windowStart: today, windowDays: [], airlines: [], people: [], flights: [], roster: [], gateLogs: [], feedback: [] };
}

export function HubProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  const [clock, setClock] = React.useState(() => nassauNow());
  const [shared, setShared] = React.useState<Record<string, GateLog>>({});
  const [pending, setPending] = React.useState<Record<string, GateLog>>({});
  const [reassignments, setReassignments] = React.useState<Reassignment[]>([]);
  const [fbStatus, setFbStatus] = React.useState<Record<string, FeedbackItem["status"]>>({});
  const [events, setEvents] = React.useState<HubEvent[]>([]);
  const [offline, setOfflineState] = React.useState(false);
  const [session, setSession] = React.useState<Session | null>(null);

  const reload = React.useCallback(() => {
    setShared(load("local", K_LOGS, {}));
    setPending(load("session", K_PENDING, {}));
    setReassignments(load("local", K_REASSIGN, []));
    setFbStatus(load("local", K_FEEDBACK, {}));
    setEvents(localEvents());
    setSession(readSession());
  }, []);

  /** Supabase is the source of truth when configured; localStorage is the offline cache. */
  const pullRemote = React.useCallback(async () => {
    const r = await pullState();
    if (!r) return;
    save("local", K_LOGS, r.logs);
    save("local", K_REASSIGN, r.reassignments);
    save("local", K_FEEDBACK, r.feedback);
    setShared(r.logs);
    setReassignments(r.reassignments);
    setFbStatus(r.feedback);
  }, []);

  React.useEffect(() => {
    reload();
    let unsubRemote = () => {};
    if (remoteEnabled()) {
      void pullRemote();
      void pullRecent().then(() => setEvents(localEvents()));
      unsubRemote = subscribeState(() => void pullRemote());
    }
    const off = load("session", K_OFFLINE, false);
    setOfflineState(off);
    setForcedOffline(off);
    setMounted(true);
    const t = window.setInterval(() => setClock(nassauNow()), 20_000);
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith("gateline.") || e.key.startsWith("nfs-hub.")) reload();
    };
    window.addEventListener("storage", onStorage);
    const unsub = subscribe(() => setEvents(localEvents()));
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return () => {
      window.clearInterval(t);
      window.removeEventListener("storage", onStorage);
      unsub();
      unsubRemote();
    };
  }, [reload, pullRemote]);

  // Day changes regenerate the seed; minutes only move the "live" window.
  // Generated in the browser only: pre-rendering stays light and every page waits for `ready` anyway.
  const ds = React.useMemo<Dataset>(() => (mounted ? generateDataset(clock.date, clock.minutes) : emptyDataset(clock.date)), [clock.date, mounted]); // eslint-disable-line react-hooks/exhaustive-deps

  const people = React.useMemo(() => new Map(ds.people.map((p) => [p.id, p])), [ds]);

  const gateLogs = React.useMemo(() => {
    const byFlight = new Map(ds.gateLogs.map((g) => [g.flightId, g]));
    for (const g of Object.values(shared)) byFlight.set(g.flightId, g);
    for (const g of Object.values(pending)) byFlight.set(g.flightId, g);
    return [...byFlight.values()];
  }, [ds, shared, pending]);
  const logByFlight = React.useMemo(() => new Map(gateLogs.map((g) => [g.flightId, g])), [gateLogs]);

  const feedback = React.useMemo(() => ds.feedback.map((f) => (fbStatus[f.id] ? { ...f, status: fbStatus[f.id] } : f)), [ds, fbStatus]);

  const setOffline = React.useCallback((v: boolean) => {
    save("session", K_OFFLINE, v);
    setOfflineState(v);
    setForcedOffline(v);
    if (!v) {
      // reconnect: push pending logs to shared, flush event outbox
      const p = load<Record<string, GateLog>>("session", K_PENDING, {});
      const s = load<Record<string, GateLog>>("local", K_LOGS, {});
      save("local", K_LOGS, { ...s, ...p });
      save("session", K_PENDING, {});
      for (const log of Object.values(p)) void pushLog(log);
      void flush().then(() => setEvents(localEvents()));
      setShared({ ...s, ...p });
      setPending({});
    }
  }, []);

  const saveLog = React.useCallback(
    (log: GateLog, change?: { type: string; payload: Record<string, unknown> }) => {
      const stamped: GateLog = { ...log, source: "device" };
      if (offline || !isOnline()) {
        const p = { ...load<Record<string, GateLog>>("session", K_PENDING, {}), [log.flightId]: stamped };
        save("session", K_PENDING, p);
        setPending(p);
      } else {
        const s = { ...load<Record<string, GateLog>>("local", K_LOGS, {}), [log.flightId]: stamped };
        save("local", K_LOGS, s);
        setShared(s);
        void pushLog(stamped);
      }
      if (change) {
        void publish({ module: "gateline", type: change.type, payload: { flightId: log.flightId, airline: log.airline, ...change.payload } }).then(() => setEvents(localEvents()));
        const ev = change.payload.event as GateEventType | undefined;
        if (ev === "door_close") void publish({ module: "gateline", type: EVENT_TYPES.doorClose, payload: { flightId: log.flightId, at: change.payload.at } });
        if (ev === "pushback") void publish({ module: "gateline", type: EVENT_TYPES.pushback, payload: { flightId: log.flightId, at: change.payload.at } });
      }
    },
    [offline],
  );

  const addReassignment = React.useCallback((r: Omit<Reassignment, "id" | "at">) => {
    const full: Reassignment = { ...r, id: crypto.randomUUID(), at: new Date().toISOString() };
    const next = [...load<Reassignment[]>("local", K_REASSIGN, []), full];
    save("local", K_REASSIGN, next);
    setReassignments(next);
    void pushReassignment(full);
    void publish({ module: "gateline", type: EVENT_TYPES.agentReassigned, payload: { ...full } }).then(() => setEvents(localEvents()));
  }, []);

  const removeReassignment = React.useCallback((id: string) => {
    const next = load<Reassignment[]>("local", K_REASSIGN, []).filter((r) => r.id !== id);
    save("local", K_REASSIGN, next);
    setReassignments(next);
    void removeReassignmentRemote(id);
  }, []);

  const setFeedbackStatus = React.useCallback((id: string, status: FeedbackItem["status"]) => {
    const next = { ...load<Record<string, FeedbackItem["status"]>>("local", K_FEEDBACK, {}), [id]: status };
    save("local", K_FEEDBACK, next);
    setFbStatus(next);
    void pushFeedback(id, status);
  }, []);

  const resetDemo = React.useCallback(() => {
    for (const k of [K_LOGS, K_REASSIGN, K_FEEDBACK]) window.localStorage.removeItem(k);
    window.sessionStorage.removeItem(K_PENDING);
    clearLocalEvents();
    void resetRemote();
    reload();
  }, [reload]);

  const value: HubState = {
    ready: mounted,
    ds,
    today: clock.date,
    nowMin: clock.minutes,
    session,
    me: session ? people.get(session.personId) ?? null : null,
    people,
    gateLogs,
    logByFlight,
    reassignments,
    feedback,
    events,
    offline,
    pendingCount: Object.keys(pending).length + (mounted ? outbox().length : 0),
    setOffline,
    saveLog,
    addReassignment,
    removeReassignment,
    setFeedbackStatus,
    refreshSession: () => setSession(readSession()),
    resetDemo,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHub(): HubState {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useHub outside HubProvider");
  return v;
}

export function personName(p?: Person | null) {
  return p ? `${p.firstName} ${p.lastName}` : "—";
}
