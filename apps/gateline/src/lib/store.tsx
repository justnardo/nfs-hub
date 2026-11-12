"use client";
import * as React from "react";
import {
  nassauNow, type Airline, type FeedbackItem, type GateEventType, type GateLog, type HubEvent, type Person,
  type Reassignment, type RosterEntry, type ShiftCode,
} from "@nfs/db";
import { AIRLINES, ROUTES, generateDataset, type Dataset, type RouteTemplate } from "@nfs/demo";
import { resolveRules, type CellEdit, type Fix, type RosterEdit, type RuleId, type RuleSetting, type RuleSettings } from "@nfs/rules";
import { readSession, type Session } from "@nfs/auth";
import { EVENT_TYPES, flush, isOnline, localEvents, outbox, publish, pullRecent, setForcedOffline, subscribe, clearLocalEvents } from "@nfs/events";
import { emptyState, pullAll, remoteEnabled, resetRemote, resizePhoto, subscribeState, uploadAvatar, upsert, upsertMany, type Kind, type StateMap } from "./remote";

/**
 * Demo data layer. The seed (fictional staff, flights, history) is generated deterministically in the
 * browser by the roster engine, then everything people change is layered on top:
 *   roster cells, covers, gate logs, feedback status — operations
 *   airlines, schedules, team assignments, rule settings — manager configuration (regenerates rosters)
 *   profiles (email, photo) and password requests — staff self-service
 * Shared state is cached in localStorage and synced through Supabase when configured.
 * While "offline", gate logs stay in this tab's sessionStorage until reconnect.
 */
const K_STATE = "gateline.state.v2";
const K_PENDING = "gateline.logs.pending";
const K_OFFLINE = "gateline.offline";

export interface RosterOverride {
  personId: string;
  date: string;
  shift: ShiftCode;
  at: string;
  by: string;
}
export interface PasswordRequest {
  id: string;
  personId: string;
  type: "password";
  status: "open" | "done" | "declined";
  note: string;
  at: string;
  resolvedBy?: string;
  resolvedAt?: string;
}
type RemovedMarker = { removed: true };
type ProfilePatch = { email?: string; photoUrl?: string | null; phone?: string };

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
  rules: RuleSettings;
  gateLogs: GateLog[];
  logByFlight: Map<string, GateLog>;
  reassignments: Reassignment[];
  feedback: FeedbackItem[];
  events: HubEvent[];
  overrides: Map<string, RosterOverride>;
  rosterEdits: RosterEdit[];
  routes: RouteTemplate[];
  requests: PasswordRequest[];
  offline: boolean;
  pendingCount: number;
  setOffline: (v: boolean) => void;
  saveLog: (log: GateLog, change?: { type: string; payload: Record<string, unknown> }) => void;
  addReassignment: (r: Omit<Reassignment, "id" | "at">) => void;
  removeReassignment: (id: string) => void;
  setFeedbackStatus: (id: string, status: FeedbackItem["status"]) => void;
  setCells: (edits: CellEdit[]) => void;
  revertCells: (keys: { personId: string; date: string }[]) => void;
  applyFix: (fix: Fix, overrideReason?: string | null) => void;
  saveAirline: (a: Airline) => void;
  removeAirline: (code: string) => void;
  saveRoute: (r: RouteTemplate) => void;
  removeRoute: (flightNo: string) => void;
  savePerson: (id: string, patch: Partial<Person>) => void;
  saveProfile: (id: string, patch: ProfilePatch) => void;
  uploadPhoto: (id: string, file: File) => Promise<boolean>;
  requestPassword: (personId: string, note: string) => void;
  resolveRequest: (id: string, status: PasswordRequest["status"]) => void;
  saveRules: (overrides: Partial<Record<RuleId, Partial<RuleSetting>>>) => void;
  refreshSession: () => void;
  resetDemo: () => void;
}

const Ctx = React.createContext<HubState | null>(null);

function emptyDataset(today: string): Dataset {
  return { today, nowMinutes: 0, windowStart: today, windowDays: [], airlines: [], people: [], flights: [], roster: [], gateLogs: [], feedback: [] };
}

const isRemoved = (v: unknown): v is RemovedMarker => !!v && typeof v === "object" && (v as RemovedMarker).removed === true;

export function HubProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  const [clock, setClock] = React.useState(() => nassauNow());
  const [state, setState] = React.useState<StateMap>(emptyState);
  const [pending, setPending] = React.useState<Record<string, GateLog>>({});
  const [events, setEvents] = React.useState<HubEvent[]>([]);
  const [offline, setOfflineState] = React.useState(false);
  const [session, setSession] = React.useState<Session | null>(null);

  const reload = React.useCallback(() => {
    setState({ ...emptyState(), ...load<Partial<StateMap>>("local", K_STATE, {}) });
    setPending(load("session", K_PENDING, {}));
    setEvents(localEvents());
    setSession(readSession());
  }, []);

  const pullRemote = React.useCallback(async () => {
    const r = await pullAll();
    if (!r) return;
    save("local", K_STATE, r);
    setState(r);
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

  /** Write one or more records locally and remotely. */
  const write = React.useCallback((rows: { kind: Kind; id: string; payload: unknown; deleted?: boolean }[]) => {
    const cur = { ...emptyState(), ...load<Partial<StateMap>>("local", K_STATE, {}) };
    for (const r of rows) {
      const bucket = { ...cur[r.kind] };
      if (r.deleted) delete bucket[r.id];
      else bucket[r.id] = r.payload;
      cur[r.kind] = bucket;
    }
    save("local", K_STATE, cur);
    setState(cur);
    void upsertMany(rows);
  }, []);

  // ---------- Manager configuration → engine input ----------
  const airlines = React.useMemo<Airline[]>(() => {
    const edits = state.airline;
    const base = AIRLINES.map((a) => (edits[a.code] && !isRemoved(edits[a.code]) ? (edits[a.code] as Airline) : a)).filter((a) => !isRemoved(edits[a.code]));
    const added = Object.entries(edits).filter(([code, v]) => !isRemoved(v) && !AIRLINES.some((a) => a.code === code)).map(([, v]) => v as Airline);
    return [...base, ...added];
  }, [state.airline]);
  const routes = React.useMemo<RouteTemplate[]>(() => {
    const edits = state.route;
    const base = ROUTES.map((r) => (edits[r.flightNo] && !isRemoved(edits[r.flightNo]) ? (edits[r.flightNo] as RouteTemplate) : r)).filter((r) => !isRemoved(edits[r.flightNo]));
    const added = Object.entries(edits).filter(([no, v]) => !isRemoved(v) && !ROUTES.some((r) => r.flightNo === no)).map(([, v]) => v as RouteTemplate);
    return [...base, ...added];
  }, [state.route]);
  const rules = React.useMemo(() => resolveRules((state.rules.config ?? {}) as Partial<Record<RuleId, Partial<RuleSetting>>>), [state.rules]);
  const personPatch = state.person as Record<string, Partial<Person>>;
  const configKey = JSON.stringify([state.airline, state.route, state.person, state.rules]);

  // Generated in the browser only: pre-rendering stays light and every page waits for `ready` anyway.
  const generated = React.useMemo<Dataset>(
    () => (mounted ? generateDataset(clock.date, clock.minutes, { airlines, routes, personPatch, rules }) : emptyDataset(clock.date)),
    [clock.date, mounted, configKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ---------- Layer roster edits and profiles on top ----------
  const overrides = React.useMemo(() => new Map(Object.entries(state.roster as Record<string, RosterOverride>)), [state.roster]);
  const ds = React.useMemo<Dataset>(() => {
    const profiles = state.profile as Record<string, ProfilePatch>;
    const people = generated.people.map((p) => (profiles[p.id] ? { ...p, ...profiles[p.id] } : p));
    if (!overrides.size) return { ...generated, people };
    const roster: RosterEntry[] = generated.roster.map((e) => {
      const o = overrides.get(`${e.personId}|${e.date}`);
      return o ? { ...e, shift: o.shift } : e;
    });
    return { ...generated, people, roster };
  }, [generated, overrides, state.profile]);

  const people = React.useMemo(() => new Map(ds.people.map((p) => [p.id, p])), [ds]);

  const gateLogs = React.useMemo(() => {
    const byFlight = new Map(ds.gateLogs.map((g) => [g.flightId, g]));
    for (const g of Object.values(state.log as Record<string, GateLog>)) byFlight.set(g.flightId, g);
    for (const g of Object.values(pending)) byFlight.set(g.flightId, g);
    return [...byFlight.values()];
  }, [ds, state.log, pending]);
  const logByFlight = React.useMemo(() => new Map(gateLogs.map((g) => [g.flightId, g])), [gateLogs]);
  const reassignments = React.useMemo(() => (Object.values(state.reassignment) as Reassignment[]).sort((a, b) => a.at.localeCompare(b.at)), [state.reassignment]);
  const feedback = React.useMemo(() => {
    const st = state.feedback as Record<string, { status: FeedbackItem["status"] }>;
    return ds.feedback.map((f) => (st[f.id] ? { ...f, status: st[f.id].status } : f));
  }, [ds, state.feedback]);
  const requests = React.useMemo(() => (Object.values(state.request) as PasswordRequest[]).sort((a, b) => b.at.localeCompare(a.at)), [state.request]);
  const rosterEdits = React.useMemo<RosterEdit[]>(() => [...overrides.values()].map((o) => ({ personId: o.personId, date: o.date, shift: o.shift, at: o.at })), [overrides]);

  const by = session?.name ?? "system";

  // ---------- Actions ----------
  const setOffline = React.useCallback(
    (v: boolean) => {
      save("session", K_OFFLINE, v);
      setOfflineState(v);
      setForcedOffline(v);
      if (!v) {
        const p = load<Record<string, GateLog>>("session", K_PENDING, {});
        save("session", K_PENDING, {});
        setPending({});
        write(Object.values(p).map((log) => ({ kind: "log" as Kind, id: log.flightId, payload: log })));
        void flush().then(() => setEvents(localEvents()));
      }
    },
    [write],
  );

  const saveLog = React.useCallback(
    (log: GateLog, change?: { type: string; payload: Record<string, unknown> }) => {
      const stamped: GateLog = { ...log, source: "device" };
      if (offline || !isOnline()) {
        const p = { ...load<Record<string, GateLog>>("session", K_PENDING, {}), [log.flightId]: stamped };
        save("session", K_PENDING, p);
        setPending(p);
      } else write([{ kind: "log", id: log.flightId, payload: stamped }]);
      if (change) {
        void publish({ module: "gateline", type: change.type, payload: { flightId: log.flightId, airline: log.airline, ...change.payload } }).then(() => setEvents(localEvents()));
        const ev = change.payload.event as GateEventType | undefined;
        if (ev === "door_close") void publish({ module: "gateline", type: EVENT_TYPES.doorClose, payload: { flightId: log.flightId, at: change.payload.at } });
        if (ev === "pushback") void publish({ module: "gateline", type: EVENT_TYPES.pushback, payload: { flightId: log.flightId, at: change.payload.at } });
      }
    },
    [offline, write],
  );

  const addReassignment = React.useCallback(
    (r: Omit<Reassignment, "id" | "at">) => {
      const full: Reassignment = { ...r, id: crypto.randomUUID(), at: new Date().toISOString() };
      write([{ kind: "reassignment", id: full.id, payload: full }]);
      void publish({ module: "gateline", type: EVENT_TYPES.agentReassigned, payload: { ...full } }).then(() => setEvents(localEvents()));
    },
    [write],
  );
  const removeReassignment = React.useCallback((id: string) => write([{ kind: "reassignment", id, payload: {}, deleted: true }]), [write]);
  const setFeedbackStatus = React.useCallback((id: string, status: FeedbackItem["status"]) => write([{ kind: "feedback", id, payload: { status } }]), [write]);

  const setCells = React.useCallback(
    (edits: CellEdit[]) => {
      const at = new Date().toISOString();
      write(edits.map((e) => ({ kind: "roster" as Kind, id: `${e.personId}|${e.date}`, payload: { ...e, at, by } satisfies RosterOverride })));
      void publish({ module: "gateline", type: "roster.changed", payload: { cells: edits.length, by } }).then(() => setEvents(localEvents()));
    },
    [write, by],
  );
  const revertCells = React.useCallback((keys: { personId: string; date: string }[]) => write(keys.map((k) => ({ kind: "roster" as Kind, id: `${k.personId}|${k.date}`, payload: {}, deleted: true }))), [write]);

  const applyFix = React.useCallback(
    (fix: Fix, overrideReason: string | null = null) => {
      if (fix.edits.length) setCells(fix.edits);
      if (fix.reassignment) addReassignment({ ...fix.reassignment, overrideReason, approvedBy: by });
    },
    [setCells, addReassignment, by],
  );

  const saveAirline = React.useCallback((a: Airline) => write([{ kind: "airline", id: a.code, payload: a }]), [write]);
  const removeAirline = React.useCallback(
    (code: string) => {
      const isSeed = AIRLINES.some((a) => a.code === code);
      write([{ kind: "airline", id: code, payload: { removed: true }, deleted: !isSeed }]);
    },
    [write],
  );
  const saveRoute = React.useCallback((r: RouteTemplate) => write([{ kind: "route", id: r.flightNo, payload: r }]), [write]);
  const removeRoute = React.useCallback(
    (flightNo: string) => {
      const isSeed = ROUTES.some((r) => r.flightNo === flightNo);
      write([{ kind: "route", id: flightNo, payload: { removed: true }, deleted: !isSeed }]);
    },
    [write],
  );
  const savePerson = React.useCallback((id: string, patch: Partial<Person>) => write([{ kind: "person", id, payload: { ...(state.person[id] as object), ...patch } }]), [write, state.person]);
  const saveProfile = React.useCallback((id: string, patch: ProfilePatch) => write([{ kind: "profile", id, payload: { ...(state.profile[id] as object), ...patch } }]), [write, state.profile]);
  const uploadPhoto = React.useCallback(
    async (id: string, file: File) => {
      const blob = await resizePhoto(file);
      const url = await uploadAvatar(id, blob);
      if (!url) return false;
      saveProfile(id, { photoUrl: url });
      return true;
    },
    [saveProfile],
  );
  const requestPassword = React.useCallback(
    (personId: string, note: string) => {
      const r: PasswordRequest = { id: crypto.randomUUID(), personId, type: "password", status: "open", note, at: new Date().toISOString() };
      write([{ kind: "request", id: r.id, payload: r }]);
    },
    [write],
  );
  const resolveRequest = React.useCallback(
    (id: string, status: PasswordRequest["status"]) => {
      const r = state.request[id] as PasswordRequest | undefined;
      if (!r) return;
      write([{ kind: "request", id, payload: { ...r, status, resolvedBy: by, resolvedAt: new Date().toISOString() } }]);
    },
    [write, state.request, by],
  );
  const saveRules = React.useCallback((o: Partial<Record<RuleId, Partial<RuleSetting>>>) => write([{ kind: "rules", id: "config", payload: o }]), [write]);

  const resetDemo = React.useCallback(() => {
    window.localStorage.removeItem(K_STATE);
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
    rules,
    gateLogs,
    logByFlight,
    reassignments,
    feedback,
    events,
    overrides,
    rosterEdits,
    routes,
    requests,
    offline,
    pendingCount: Object.keys(pending).length + (mounted ? outbox().length : 0),
    setOffline,
    saveLog,
    addReassignment,
    removeReassignment,
    setFeedbackStatus,
    setCells,
    revertCells,
    applyFix,
    saveAirline,
    removeAirline,
    saveRoute,
    removeRoute,
    savePerson,
    saveProfile,
    uploadPhoto,
    requestPassword,
    resolveRequest,
    saveRules,
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

/** Engine input for the current state. */
export function useEngineInput() {
  const hub = useHub();
  return React.useMemo(
    () => ({ airlines: hub.ds.airlines, people: hub.ds.people, flights: hub.ds.flights, roster: hub.ds.roster, reassignments: hub.reassignments }),
    [hub.ds, hub.reassignments],
  );
}
