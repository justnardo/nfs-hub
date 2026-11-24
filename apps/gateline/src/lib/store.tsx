"use client";
import { flash } from "@/components/flash";
import * as React from "react";
import {
  STATIONS, addDays, formatDate, nassauNow, stationOf, type Airline, type ArrivalNeeds, type Flight, type FlightOps, type Station, arrivalDateOf, type FeedbackItem, type GateEventType, type GateLog, type HubEvent, type Person,
  type Reassignment, type RosterEntry, type ShiftCode,
} from "@nfs/db";
import { AIRLINES, ROUTES, demoCharters, generateDataset, type Charter, type Dataset, type RouteTemplate } from "@nfs/demo";
import { resolveRules, type CellEdit, type Fix, type RosterEdit, type RuleId, type RuleSetting, type RuleSettings } from "@nfs/rules";
import { readSession, type Session } from "@nfs/auth";
import { EVENT_TYPES, flush, isOnline, localEvents, outbox, publish, pullRecent, setForcedOffline, subscribe, clearLocalEvents } from "@nfs/events";
import { ACTION_LABEL, newShareToken, periodDays, periodEnd, teamLabel, teamOf, type Actor, type AuditAction, type AuditEntry, type CellChange, type RosterPeriod, type TeamKey } from "./periods";
import { ABSENCE_TYPES, absenceCovers, applyAbsences, demoAbsences, type Absence } from "./absence";
import { demoInbound, demoSsr, type FlightAdvice, type InboundAlert, type Notice } from "./advice";
import { demoRequests, type LeaveRequest, type StaffRequest, type SwapRequest } from "./staff-requests";
import { emptyState, prepareLogo, rebindPush, sendPush, pullAll, remoteEnabled, resetRemote, resizePhoto, subscribeState, uploadAirlineLogo, uploadAvatar, upsert, upsertMany, type Kind, type StateMap } from "./remote";

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
  byId?: string;
  byRole?: string;
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

const K_STATION = "gateline.station";
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
  /** Every charter, including tentative and cancelled ones (cancelled are left out of the flight schedule). */
  charters: Charter[];
  requests: PasswordRequest[];
  periods: RosterPeriod[];
  audit: AuditEntry[];
  /** Shared state has been pulled from the server (or there is no server). */
  synced: boolean;
  /** Plan value for a cell: engine baseline with published periods, before hand changes. */
  planShift: (personId: string, date: string) => ShiftCode | undefined;
  offline: boolean;
  pendingCount: number;
  setOffline: (v: boolean) => void;
  saveLog: (log: GateLog, change?: { type: string; payload: Record<string, unknown> }) => void;
  addReassignment: (r: Omit<Reassignment, "id" | "at">, log?: boolean) => string;
  removeReassignment: (id: string) => void;
  setFeedbackStatus: (id: string, status: FeedbackItem["status"], response?: string) => void;
  /** Record feedback from a station manager (logged by NFS, or sent through the airline's link). */
  logFeedback: (f: Omit<FeedbackItem, "id" | "status" | "at">) => void;
  /** Turn an airline's private feedback link on or off; returns the token when on. */
  setFeedbackLink: (code: string, on: boolean) => string | null;
  setCells: (edits: CellEdit[], meta?: CellMeta) => void;
  revertCells: (keys: { personId: string; date: string }[]) => void;
  /** Applies a suggested fix; returns the move's id (if a cover move) and the cells it changed, for undo. */
  applyFix: (fix: Fix, overrideReason?: string | null) => { refId?: string; cells: CellChange[] };
  saveAirline: (a: Airline) => void;
  /** Record a new or changed SLA agreement; coverage, rosters and fixes use it straight away. */
  updateSla: (code: string, sla: Airline["sla"], meta: { agreedOn: string; agreedWith: string; note?: string }) => void;
  removeAirline: (code: string) => void;
  saveRoute: (r: RouteTemplate) => void;
  removeRoute: (flightNo: string) => void;
  saveCharter: (c: Charter) => void;
  /** Sick calls, leave, maternity and other absences; absent days are unavailable to the engine. */
  absences: Absence[];
  absenceOn: (personId: string, date: string) => Absence | undefined;
  saveAbsence: (a: Omit<Absence, "id" | "by" | "at"> & { id?: string }) => void;
  removeAbsence: (id: string) => void;
  /** Special service requests and gate change for a flight (airline list merged with NFS edits). */
  adviceFor: (flightId: string) => FlightAdvice;
  saveAdvice: (a: FlightAdvice) => void;
  changeGate: (flightId: string, gate: string, reason: string) => void;
  /** Cancel, delay or keep a flight overnight for the day; null puts it back to schedule. */
  setFlightOps: (flightId: string, ops: Omit<FlightOps, "by" | "at"> | null) => void;
  /** Record who needs meeting off an inbound (wheelchairs, meet & greet, special services). */
  setArrivalNeeds: (flightId: string, needs: ArrivalNeeds | null) => void;
  /** Issues on inbound flights posted by Rampline operations, for a flight (by flight number and date). */
  alertsFor: (flightId: string) => InboundAlert[];
  ackAlert: (flightId: string, alertId: string) => void;
  /** Demo stand-in for Rampline: posts an inbound alert as the operations team would. */
  postInboundAlert: (a: Omit<InboundAlert, "id" | "at" | "by">) => void;
  /** Alerts for the person signed in, newest first. */
  notices: Notice[];
  unread: number;
  notify: (n: Omit<Notice, "id" | "at" | "by" | "readBy"> & { by?: string }) => void;
  /** Sends a notice only once: used for reminders that would otherwise repeat on every visit. */
  remindOnce: (id: string, n: Omit<Notice, "id" | "at" | "by" | "readBy">) => void;
  /** Shift swaps and leave requests, newest first. */
  staffRequests: StaffRequest[];
  requestSwap: (r: Pick<SwapRequest, "with" | "date" | "myShift" | "theirShift" | "note">) => void;
  respondSwap: (id: string, accept: boolean) => void;
  requestLeave: (r: Pick<LeaveRequest, "absenceType" | "from" | "to" | "note">) => void;
  decideRequest: (id: string, approve: boolean, note?: string) => void;
  cancelRequest: (id: string) => void;
  markRead: (ids: string[]) => void;
  removeCharter: (id: string) => void;
  /** Trim, resize and upload a logo. Returns its URL and a suggested brand colour. */
  uploadLogo: (code: string, file: File) => Promise<{ url: string; colour: string | null } | null>;
  savePerson: (id: string, patch: Partial<Person>, log?: boolean, note?: string) => void;
  saveProfile: (id: string, patch: ProfilePatch) => void;
  uploadPhoto: (id: string, file: File) => Promise<boolean>;
  requestPassword: (personId: string, note: string) => void;
  resolveRequest: (id: string, status: PasswordRequest["status"]) => void;
  saveRules: (overrides: Partial<Record<RuleId, Partial<RuleSetting>>>) => void;
  createPeriod: (p: Omit<RosterPeriod, "id" | "createdBy" | "createdAt" | "status">) => string;
  editPeriodCells: (id: string, edits: CellEdit[]) => void;
  publishPeriod: (id: string) => void;
  deletePeriod: (id: string) => void;
  setShareLink: (id: string, on: boolean) => string | null;
  undo: (entryId: string) => boolean;
  refreshSession: () => void;
  resetDemo: () => void;
  /** The station being viewed ("NAS", "GGT"). Everything above is scoped to it; `people` stays complete for lookups. */
  station: string;
  stations: Station[];
  /** Managers and admins can switch station; everyone else sees their own. */
  canSwitchStation: boolean;
  setStation: (code: string) => void;
}

export interface CellMeta {
  source?: "manual" | "optimise" | "fix";
  title?: string;
  reason?: string | null;
}

const Ctx = React.createContext<HubState | null>(null);

function emptyDataset(today: string): Dataset {
  return { today, nowMinutes: 0, windowStart: today, windowDays: [], horizonEnd: today, airlines: [], people: [], flights: [], roster: [], gateLogs: [], feedback: [] };
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
  const [stationPick, setStationPick] = React.useState<string | null>(null);
  React.useEffect(() => setStationPick(load<string | null>("local", K_STATION, null)), []);
  const [synced, setSynced] = React.useState(false);

  const reload = React.useCallback(() => {
    setState({ ...emptyState(), ...load<Partial<StateMap>>("local", K_STATE, {}) });
    setPending(load("session", K_PENDING, {}));
    setEvents(localEvents());
    setSession(readSession());
  }, []);

  const pullRemote = React.useCallback(async () => {
    const r = await pullAll();
    setSynced(true);
    if (!r) return;
    save("local", K_STATE, r);
    setState(r);
  }, []);

  React.useEffect(() => {
    reload();
    let unsubRemote = () => {};
    if (!remoteEnabled()) setSynced(true);
    if (remoteEnabled()) {
      // Don't hold public pages (staff roster link, airline feedback link) hostage to a bad connection.
      window.setTimeout(() => setSynced(true), 8000);
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
    const since = Date.now();
    const unsub = subscribe((ev) => {
      setEvents(localEvents());
      // Something new from operations in Rampline: say so, wherever the user is in Gateline
      if (ev.module !== "rampline" || Date.parse(ev.at) < since - 5000) return;
      const p = ev.payload as Record<string, unknown>;
      if (ev.type === EVENT_TYPES.inboundAlert)
        flash({ title: `${p.urgent ? "Urgent · " : ""}${String(p.category ?? "Alert")} · ${String(p.flightNo ?? "")} inbound`, body: `From Rampline operations: ${String(p.message ?? "")}`, tone: "warn" }, 12000);
      if (ev.type === EVENT_TYPES.offloadDone) flash({ title: `Ramp: bags off ${String(p.flightNo ?? "")}`, body: `Rampline confirmed the offload${p.by ? ` (${String(p.by)})` : ""}.`, tone: "ok" });
    });
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
    // An edit saved before an airline had lines keeps the seed's lines
    const base = AIRLINES.map((a) => (edits[a.code] && !isRemoved(edits[a.code]) ? { ...(edits[a.code] as Airline), lines: (edits[a.code] as Airline).lines ?? a.lines, sheetLabel: (edits[a.code] as Airline).sheetLabel ?? a.sheetLabel } : a)).filter((a) => !isRemoved(edits[a.code]));
    const added = Object.entries(edits).filter(([code, v]) => !isRemoved(v) && !AIRLINES.some((a) => a.code === code)).map(([, v]) => v as Airline);
    return [...base, ...added];
  }, [state.airline]);
  const routes = React.useMemo<RouteTemplate[]>(() => {
    const edits = state.route;
    const base = ROUTES.map((r) => (edits[r.flightNo] && !isRemoved(edits[r.flightNo]) ? (edits[r.flightNo] as RouteTemplate) : r)).filter((r) => !isRemoved(edits[r.flightNo]));
    const added = Object.entries(edits).filter(([no, v]) => !isRemoved(v) && !ROUTES.some((r) => r.flightNo === no)).map(([, v]) => v as RouteTemplate);
    return [...base, ...added];
  }, [state.route]);
  const charters = React.useMemo<Charter[]>(() => {
    const edits = state.charter;
    const seed = demoCharters(addDays, clock.date);
    const base = seed.map((c) => (edits[c.id] && !isRemoved(edits[c.id]) ? (edits[c.id] as Charter) : c)).filter((c) => !isRemoved(edits[c.id]));
    const added = Object.entries(edits).filter(([id, v]) => !isRemoved(v) && !seed.some((c) => c.id === id)).map(([, v]) => v as Charter);
    return [...base, ...added].sort((a, b) => (a.date + a.std).localeCompare(b.date + b.std));
  }, [state.charter, clock.date]);
  const rules = React.useMemo(() => resolveRules((state.rules.config ?? {}) as Partial<Record<RuleId, Partial<RuleSetting>>>), [state.rules]);
  const personPatch = state.person as Record<string, Partial<Person>>;
  const configKey = JSON.stringify([state.airline, state.route, state.person, state.rules, state.charter]);

  // Generated in the browser only: pre-rendering stays light and every page waits for `ready` anyway.
  const generated = React.useMemo<Dataset>(
    () => (mounted ? generateDataset(clock.date, clock.minutes, { airlines, routes, personPatch, rules, charters }) : emptyDataset(clock.date)),
    [clock.date, mounted, configKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ---------- Layer published periods, roster edits and profiles on top ----------
  const periods = React.useMemo(() => (Object.values(state.period) as RosterPeriod[]).sort((a, b) => a.start.localeCompare(b.start) || a.createdAt.localeCompare(b.createdAt)), [state.period]);
  // Exact times from line rosters, kept as long as the cell still holds the shift the lines gave it
  const genTimes = React.useMemo(() => {
    const m = new Map<string, { shift: ShiftCode; time: string }>();
    for (const e of generated.roster) if (e.time) m.set(`${e.personId}|${e.date}`, { shift: e.shift, time: e.time });
    return m;
  }, [generated]);
  const plan = React.useMemo(() => {
    const idx = new Map<string, ShiftCode>();
    for (const e of generated.roster) idx.set(`${e.personId}|${e.date}`, e.shift);
    const published = periods.filter((p) => p.status === "published").sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""));
    for (const p of published) {
      const days = periodDays(p);
      for (const [pid, row] of Object.entries(p.grid)) days.forEach((d, i) => idx.set(`${pid}|${d}`, row[i] as ShiftCode));
    }
    return idx;
  }, [generated, periods]);
  const overrides = React.useMemo(() => new Map(Object.entries(state.roster as Record<string, RosterOverride>)), [state.roster]);
  const absenceList = React.useMemo<Absence[]>(() => {
    const edits = state.absence;
    const seed = demoAbsences(clock.date, generated.people);
    const base = seed.map((a) => (edits[a.id] && !isRemoved(edits[a.id]) ? (edits[a.id] as Absence) : a)).filter((a) => !isRemoved(edits[a.id]));
    const added = Object.entries(edits).filter(([id, v]) => !isRemoved(v) && !seed.some((x) => x.id === id)).map(([, v]) => v as Absence);
    return [...base, ...added];
  }, [state.absence, clock.date, generated.people]);
  const ds = React.useMemo<Dataset>(() => {
    const profiles = state.profile as Record<string, ProfilePatch>;
    const people = generated.people.map((p) => (profiles[p.id] ? { ...p, ...profiles[p.id] } : p));
    const idx = new Map(plan);
    for (const [k, o] of overrides) idx.set(k, o.shift);
    const roster: RosterEntry[] = [];
    for (const [k, shift] of idx) {
      const [personId, date] = k.split("|");
      const t = genTimes.get(k);
      roster.push(t && t.shift === shift ? { personId, date, shift, time: t.time } : { personId, date, shift });
    }
    const absent = absenceList;
    const leftOn = new Map(people.filter((p) => p.leftOn).map((p) => [p.id, p.leftOn!]));
    const withAbsence = applyAbsences({ roster: leftOn.size ? roster.filter((r) => !leftOn.has(r.personId) || r.date <= leftOn.get(r.personId)!) : roster }, absent).roster;
    const adv = state.advice as Record<string, FlightAdvice>;
    let flights = Object.keys(adv).length ? generated.flights.map((f) => (adv[f.id]?.gate && adv[f.id].gate !== f.gate ? { ...f, gate: adv[f.id].gate!, gateFrom: f.gate } : f)) : generated.flights;
    // Day-of changes: cancelled / delayed / remain overnight (a RON departure reappears on its new date)
    if (Object.values(adv).some((a) => a?.ops)) {
      const extra: Flight[] = [];
      flights = flights.map((f) => {
        const ops = adv[f.id]?.ops;
        if (!ops) return f;
        if (ops.status === "ron" && ops.newDate) {
          extra.push({ ...f, id: `${f.id}-ron`, date: ops.newDate, std: ops.newStd ?? f.std, ronOf: f.id, overnight: true, ops: adv[`${f.id}-ron`]?.ops });
        }
        return { ...f, ops };
      });
      if (extra.length) flights = [...flights, ...extra].sort((a, b) => (a.date + a.std).localeCompare(b.date + b.std));
    }
    return { ...generated, people, roster: withAbsence, flights };
  }, [generated, plan, overrides, state.profile, state.advice, absenceList, genTimes]);
  const liveIdx = React.useMemo(() => new Map(ds.roster.map((r) => [`${r.personId}|${r.date}`, r.shift])), [ds]);

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
    const st = state.feedback as Record<string, Partial<FeedbackItem>>;
    const seeded = ds.feedback.map((f) => (st[f.id] ? { ...f, ...st[f.id], id: f.id } : { ...f, source: f.source ?? ("seed" as const), rating: f.rating ?? seedRating(f) }));
    const seedIds = new Set(ds.feedback.map((f) => f.id));
    const added = Object.entries(st).filter(([id, v]) => !seedIds.has(id) && v && typeof v.airline === "string").map(([, v]) => v as FeedbackItem);
    return [...added, ...seeded].sort((a, b) => (b.at ?? b.date).localeCompare(a.at ?? a.date));
  }, [ds, state.feedback]);
  const requests = React.useMemo(() => (Object.values(state.request) as PasswordRequest[]).sort((a, b) => b.at.localeCompare(a.at)), [state.request]);
  const rosterEdits = React.useMemo<RosterEdit[]>(() => [...overrides.values()].map((o) => ({ personId: o.personId, date: o.date, shift: o.shift, at: o.at })), [overrides]);

  const by = session?.name ?? "system";
  const actor: Actor = React.useMemo(() => ({ id: session?.personId ?? "system", name: session?.name ?? "System", role: session?.role ?? "admin" }), [session]);
  const audit = React.useMemo(() => (Object.values(state.audit) as AuditEntry[]).sort((a, b) => b.at.localeCompare(a.at)), [state.audit]);
  const nameOf = React.useCallback((id: string) => {
    const p = people.get(id);
    return p ? `${p.firstName} ${p.lastName}` : id;
  }, [people]);
  const teamsOf = React.useCallback((ids: string[]) => [...new Set(ids.map((id) => people.get(id)).filter(Boolean).map((p) => teamOf(p!)).filter(Boolean) as TeamKey[])], [people]);
  const entry = React.useCallback(
    (e: Omit<AuditEntry, "id" | "at" | "actor">) => {
      const full: AuditEntry = { ...e, id: crypto.randomUUID(), at: new Date().toISOString(), actor };
      return { kind: "audit" as Kind, id: full.id, payload: full };
    },
    [actor],
  );

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
        // Flight number and date ride along so Rampline (and the Hub page) can match the turn without Gateline's ids
        const f = ds.flights.find((x) => x.id === log.flightId);
        const ref = { flightId: log.flightId, flightNo: f?.flightNo, date: log.date, airline: log.airline, gate: f?.gate };
        void publish({ module: "gateline", type: change.type, payload: { ...ref, ...change.payload } }).then(() => setEvents(localEvents()));
        const ev = change.payload.event as GateEventType | undefined;
        if (ev === "door_close") void publish({ module: "gateline", type: EVENT_TYPES.doorClose, payload: { ...ref, at: change.payload.at } });
        if (ev === "pushback") void publish({ module: "gateline", type: EVENT_TYPES.pushback, payload: { ...ref, at: change.payload.at } });
      }
    },
    [offline, write, ds],
  );

  const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const SH: Record<string, string> = { E: "Early", M: "Mid", L: "Late", O: "Off", V: "Vacation" };
  const shiftWord = (s: ShiftCode | null | undefined) => (s ? SH[s] : "not rostered");

  const addReassignment = React.useCallback(
    (r: Omit<Reassignment, "id" | "at">, log = true) => {
      const full: Reassignment = { ...r, id: crypto.randomUUID(), at: new Date().toISOString() };
      const rows: { kind: Kind; id: string; payload: unknown }[] = [{ kind: "reassignment", id: full.id, payload: full }];
      if (log) {
        rows.push(entry({
          action: "cover.move",
          summary: `Moved ${nameOf(r.personId)} from ${r.fromAirline ?? "their team"} to ${r.toAirline} · ${fmtDay(r.date)} ${shiftWord(r.shift as ShiftCode)}`,
          teams: [r.toAirline, ...(r.fromAirline ? [r.fromAirline] : [])],
          personId: r.personId,
          date: r.date,
          ref: full.id,
          reason: r.overrideReason ?? null,
        }));
      }
      write(rows);
      void publish({ module: "gateline", type: EVENT_TYPES.agentReassigned, payload: { ...full } }).then(() => setEvents(localEvents()));
      return full.id;
    },
    [write, entry, nameOf],
  );
  const removeReassignment = React.useCallback(
    (id: string) => {
      const r = state.reassignment[id] as Reassignment | undefined;
      const rows: { kind: Kind; id: string; payload: unknown; deleted?: boolean }[] = [{ kind: "reassignment", id, payload: {}, deleted: true }];
      if (r) rows.push(entry({ action: "cover.cancel", summary: `Cancelled ${nameOf(r.personId)}'s move to ${r.toAirline} · ${fmtDay(r.date)}`, teams: [r.toAirline], personId: r.personId, date: r.date, ref: id }));
      write(rows);
    },
    [write, entry, nameOf, state.reassignment],
  );
  const setFeedbackStatus = React.useCallback(
    (id: string, status: FeedbackItem["status"], response?: string) => {
      const cur = feedback.find((f) => f.id === id);
      if (!cur) return;
      const isAdded = !ds.feedback.some((f) => f.id === id);
      const patch = { status, ...(response !== undefined ? { response } : {}) };
      write([{ kind: "feedback", id, payload: isAdded ? { ...cur, ...patch } : { ...(state.feedback[id] ?? {}), ...patch } }]);
    },
    [write, feedback, ds.feedback, state.feedback],
  );

  /** Rows that put cells to given shifts: an override, or none when it matches the plan. */
  const cellRows = React.useCallback(
    (edits: CellEdit[]) => {
      const at = new Date().toISOString();
      return edits.map((e) => {
        const id = `${e.personId}|${e.date}`;
        if (plan.get(id) === e.shift) return { kind: "roster" as Kind, id, payload: {}, deleted: true };
        return { kind: "roster" as Kind, id, payload: { ...e, at, by, byId: actor.id, byRole: actor.role } satisfies RosterOverride };
      });
    },
    [plan, by, actor],
  );
  const changesOf = React.useCallback(
    (edits: CellEdit[]): CellChange[] => edits.map((e) => ({ personId: e.personId, date: e.date, from: liveIdx.get(`${e.personId}|${e.date}`) ?? null, to: e.shift })).filter((c) => c.from !== c.to),
    [liveIdx],
  );

  const setCells = React.useCallback(
    (edits: CellEdit[], meta: CellMeta = {}) => {
      const cells = changesOf(edits);
      if (!cells.length) return;
      const rows: { kind: Kind; id: string; payload: unknown; deleted?: boolean }[] = cellRows(edits);
      const source = meta.source ?? "manual";
      if (source === "manual") {
        for (const c of cells) {
          rows.push(entry({ action: "shift.change", summary: `${nameOf(c.personId)} · ${fmtDay(c.date)}: ${shiftWord(c.from)} → ${shiftWord(c.to)}`, teams: teamsOf([c.personId]), personId: c.personId, date: c.date, cells: [c], reason: meta.reason ?? null }));
        }
      } else {
        const ids = [...new Set(cells.map((c) => c.personId))];
        rows.push(entry({
          action: source === "optimise" ? "roster.optimise" : "roster.fix",
          summary: meta.title ?? `${source === "optimise" ? "Optimised" : "Fixed"}: ${cells.length} shift${cells.length > 1 ? "s" : ""} for ${ids.length} ${ids.length > 1 ? "people" : "person"}`,
          teams: teamsOf(ids),
          personId: ids.length === 1 ? ids[0] : undefined,
          date: cells[0].date,
          cells,
          reason: meta.reason ?? null,
        }));
      }
      write(rows);
      void publish({ module: "gateline", type: "roster.changed", payload: { cells: cells.length, by } }).then(() => setEvents(localEvents()));
    },
    [write, by, cellRows, changesOf, entry, nameOf, teamsOf],
  );
  const revertCells = React.useCallback(
    (keys: { personId: string; date: string }[]) => {
      const rows: { kind: Kind; id: string; payload: unknown; deleted?: boolean }[] = keys.map((k) => ({ kind: "roster" as Kind, id: `${k.personId}|${k.date}`, payload: {}, deleted: true }));
      for (const k of keys) {
        const c: CellChange = { personId: k.personId, date: k.date, from: liveIdx.get(`${k.personId}|${k.date}`) ?? null, to: plan.get(`${k.personId}|${k.date}`) ?? null };
        rows.push(entry({ action: "shift.revert", summary: `${nameOf(k.personId)} · ${fmtDay(k.date)}: back to plan (${shiftWord(c.from)} → ${shiftWord(c.to)})`, teams: teamsOf([k.personId]), personId: k.personId, date: k.date, cells: [c] }));
      }
      write(rows);
    },
    [write, liveIdx, plan, entry, nameOf, teamsOf],
  );

  const applyFix = React.useCallback(
    (fix: Fix, overrideReason: string | null = null) => {
      const cells = changesOf(fix.edits);
      const rows: { kind: Kind; id: string; payload: unknown; deleted?: boolean }[] = cellRows(fix.edits);
      let refId: string | undefined;
      if (fix.reassignment) {
        const full: Reassignment = { ...fix.reassignment, overrideReason, approvedBy: by, id: crypto.randomUUID(), at: new Date().toISOString() };
        refId = full.id;
        rows.push({ kind: "reassignment", id: full.id, payload: full });
        void publish({ module: "gateline", type: EVENT_TYPES.agentReassigned, payload: { ...full } }).then(() => setEvents(localEvents()));
      }
      const ids = [...new Set([...cells.map((c) => c.personId), ...(fix.reassignment ? [fix.reassignment.personId] : [])])];
      rows.push(entry({
        action: fix.reassignment && !cells.length ? "cover.move" : "roster.fix",
        summary: fix.title,
        teams: [...new Set([...teamsOf(ids), ...(fix.reassignment ? [fix.reassignment.toAirline] : [])])],
        personId: ids.length === 1 ? ids[0] : undefined,
        date: fix.reassignment?.date ?? cells[0]?.date,
        cells,
        ref: refId,
        reason: overrideReason,
      }));
      write(rows);
      return { refId, cells };
    },
    [write, cellRows, changesOf, entry, teamsOf, by],
  );

  const saveAirline = React.useCallback(
    (a: Airline) => {
      const isNew = !airlines.some((x) => x.code === a.code);
      write([{ kind: "airline", id: a.code, payload: a }, entry({ action: "airline.change", summary: `${isNew ? "Added" : "Updated"} ${a.name} (${a.code})`, teams: [a.code], ref: a.code })]);
    },
    [write, entry, airlines],
  );
  const updateSla = React.useCallback(
    (code: string, sla: Airline["sla"], meta: { agreedOn: string; agreedWith: string; note?: string }) => {
      const a = airlines.find((x) => x.code === code);
      if (!a) return;
      const now = new Date().toISOString();
      const prev = { ...(a.slaAgreement ?? { agreedOn: "", agreedWith: a.slaConfirmed ? "" : "Placeholder figures", recordedBy: "", recordedAt: "" }), sla: a.sla, replacedAt: now };
      const next: Airline = {
        ...a,
        sla: { ...sla, jetBridge: a.usesJetBridge ? sla.jetBridge : 0 },
        slaConfirmed: true,
        slaAgreement: { agreedOn: meta.agreedOn, agreedWith: meta.agreedWith, note: meta.note, recordedBy: actor?.name ?? "Manager", recordedAt: now },
        slaHistory: [prev, ...(a.slaHistory ?? [])].slice(0, 20),
      };
      const fig = (x: Airline["sla"]) => `${x.counter} counter, ${x.gate} gate${a.usesJetBridge ? `, ${x.jetBridge} jet bridge` : ""}, ${x.lead} lead`;
      write([
        { kind: "airline", id: code, payload: next },
        entry({ action: "airline.change", summary: `New SLA for ${a.name}: ${fig(next.sla)} (was ${fig(a.sla)}), agreed with ${meta.agreedWith}`, teams: [code], ref: code }),
      ]);
    },
    [write, entry, airlines, actor],
  );
  const removeAirline = React.useCallback(
    (code: string) => {
      const isSeed = AIRLINES.some((a) => a.code === code);
      write([{ kind: "airline", id: code, payload: { removed: true }, deleted: !isSeed }, entry({ action: "airline.change", summary: `Removed ${airlines.find((a) => a.code === code)?.name ?? code}`, teams: [code], ref: code })]);
    },
    [write, entry, airlines],
  );
  const saveRoute = React.useCallback(
    (r: RouteTemplate) => write([{ kind: "route", id: r.flightNo, payload: r }, entry({ action: "schedule.change", summary: `Saved ${r.flightNo} to ${r.dest} · STD ${r.std}`, teams: [r.airline], ref: r.flightNo })]),
    [write, entry],
  );
  const removeRoute = React.useCallback(
    (flightNo: string) => {
      const isSeed = ROUTES.some((r) => r.flightNo === flightNo);
      const r = routes.find((x) => x.flightNo === flightNo);
      write([{ kind: "route", id: flightNo, payload: { removed: true }, deleted: !isSeed }, entry({ action: "schedule.change", summary: `Removed ${flightNo} from the schedule`, teams: r ? [r.airline] : [], ref: flightNo })]);
    },
    [write, entry, routes],
  );
  const saveCharter = React.useCallback(
    (c: Charter) => {
      const prev = charters.find((x) => x.id === c.id);
      const verb = !prev ? "Added" : prev.status !== c.status ? (c.status === "cancelled" ? "Cancelled" : c.status === "confirmed" ? "Confirmed" : "Marked tentative") : "Updated";
      write([{ kind: "charter", id: c.id, payload: c }, entry({ action: "charter.change", summary: `${verb} charter ${c.flightNo} · ${c.operator} · ${formatDate(c.date)} STD ${c.std}`, teams: [c.handledAs], date: c.date, ref: c.id })]);
    },
    [write, entry, charters],
  );
  const removeCharter = React.useCallback(
    (id: string) => {
      const c = charters.find((x) => x.id === id);
      const isSeed = id.startsWith("chr-demo-");
      write([{ kind: "charter", id, payload: { removed: true }, deleted: !isSeed }, entry({ action: "charter.change", summary: `Deleted charter ${c?.flightNo ?? id}${c ? ` · ${c.operator}` : ""}`, teams: c ? [c.handledAs] : [], date: c?.date, ref: id })]);
    },
    [write, entry, charters],
  );
  const uploadLogo = React.useCallback(async (code: string, file: File) => {
    try {
      const { blob, colour } = await prepareLogo(file);
      const url = await uploadAirlineLogo(code, blob);
      return url ? { url, colour } : null;
    } catch {
      return null;
    }
  }, []);
  const adviceFor = React.useCallback(
    (flightId: string): FlightAdvice => {
      const stored = state.advice[flightId] as FlightAdvice | undefined;
      if (stored) return stored;
      const f = generated.flights.find((x) => x.id === flightId);
      return { flightId, ssr: f ? demoSsr(f) : [] };
    },
    [state.advice, generated.flights],
  );
  const saveAdvice = React.useCallback((a: FlightAdvice) => write([{ kind: "advice", id: a.flightId, payload: a }]), [write]);

  const notices = React.useMemo(() => {
    const me = session?.personId;
    if (!me) return [];
    return (Object.values(state.notice) as Notice[]).filter((n) => n.to.includes(me)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50);
  }, [state.notice, session]);
  const unread = notices.filter((n) => !n.readBy.includes(session?.personId ?? "")).length;
  const notify = React.useCallback(
    (n: Omit<Notice, "id" | "at" | "by" | "readBy"> & { by?: string }) => {
      const to = [...new Set(n.to)].filter((id) => id && id !== session?.personId);
      if (!to.length) return;
      const full: Notice = { ...n, to, id: crypto.randomUUID(), at: new Date().toISOString(), by: n.by ?? session?.name ?? "Gateline", readBy: [] };
      write([{ kind: "notice", id: full.id, payload: full }]);
      sendPush(to, n.title, n.body, n.href, `${n.kind}-${n.href}`);
    },
    [write, session],
  );
  const markRead = React.useCallback(
    (ids: string[]) => {
      const me = session?.personId;
      if (!me) return;
      const rows = ids
        .map((id) => state.notice[id] as Notice | undefined)
        .filter((n): n is Notice => !!n && !n.readBy.includes(me))
        .map((n) => ({ kind: "notice" as Kind, id: n.id, payload: { ...n, readBy: [...n.readBy, me] } }));
      if (rows.length) write(rows);
    },
    [write, state.notice, session],
  );
  const logFeedback = React.useCallback(
    (f: Omit<FeedbackItem, "id" | "status" | "at">) => {
      const item: FeedbackItem = { ...f, id: `fb-${crypto.randomUUID().slice(0, 8)}`, status: "open", at: new Date().toISOString() };
      write([{ kind: "feedback", id: item.id, payload: item }]);
      const a = generated.airlines.find((x) => x.code === f.airline);
      const fl = f.flightId ? generated.flights.find((x) => x.id === f.flightId) : undefined;
      const to = generated.people.filter((p) => p.role === "manager" || (f.kind === "complaint" && p.role === "supervisor" && p.homeTerminal === a?.terminal && stationOf(p) === stationOf(a))).map((p) => p.id);
      notify({
        to,
        kind: "team",
        title: `${f.kind === "complaint" ? "Complaint" : "Compliment"} from ${a?.name ?? f.airline}${fl ? ` · ${fl.flightNo}` : ""}`,
        body: `${f.rating ? `${"★".repeat(f.rating)}${"☆".repeat(5 - f.rating)} · ` : ""}${f.summary.slice(0, 120)}`,
        href: "/feedback",
        by: f.source === "link" ? `${f.from} · ${a?.name ?? f.airline}` : undefined,
      });
    },
    [write, generated, notify],
  );
  const setFeedbackLink = React.useCallback(
    (code: string, on: boolean) => {
      const a = airlines.find((x) => x.code === code);
      if (!a) return null;
      const token = on ? newShareToken() : null;
      write([{ kind: "airline", id: code, payload: { ...a, feedbackToken: token } }, entry({ action: "airline.change", summary: `${on ? "Turned on" : "Turned off"} the feedback link for ${a.name}`, teams: [code], ref: code })]);
      return token;
    },
    [airlines, write, entry],
  );
  const absences = React.useMemo(() => [...absenceList].sort((a, b) => b.from.localeCompare(a.from)), [absenceList]);
  const absenceOn = React.useCallback((personId: string, date: string) => absences.find((a) => a.personId === personId && absenceCovers(a, date)), [absences]);
  const saveAbsence = React.useCallback(
    (a: Omit<Absence, "id" | "by" | "at"> & { id?: string }) => {
      const full: Absence = { ...a, id: a.id ?? crypto.randomUUID(), by: session?.name ?? "", at: new Date().toISOString() };
      const p = generated.people.find((x) => x.id === a.personId);
      const name = p ? `${p.firstName} ${p.lastName}` : a.personId;
      const range = a.from === a.to ? fmtDay(a.from) : `${fmtDay(a.from)} – ${fmtDay(a.to)}`;
      const team = p?.coreAirline ?? (p?.role === "supervisor" ? (p.homeTerminal === "US" ? "SUP-US" : "SUP-INTL") : "POOL");
      write([{ kind: "absence", id: full.id, payload: full }, entry({ action: "absence.change", summary: `${name}: ${ABSENCE_TYPES[a.type].label.toLowerCase()} · ${range}${a.note ? ` · ${a.note}` : ""}`, teams: [team], personId: a.personId, date: a.from, ref: full.id })]);
      // A call-out for today or the next two days: tell the supervisors so they can find cover
      if ((a.type === "sick" || a.type === "noshow" || a.type === "personal") && a.from <= addDays(clock.date, 2) && a.to >= clock.date && p) {
        const sups = generated.people.filter((x) => x.role === "supervisor" && x.homeTerminal === p.homeTerminal).map((x) => x.id);
        notify({ to: sups, kind: "team", title: `${ABSENCE_TYPES[a.type].label} · ${name}`, body: `${p.coreAirline ?? "Float pool"} · ${range}. Check coverage for a cover.`, href: "/coverage" });
      }
    },
    [write, entry, session, generated.people, clock.date, notify],
  );
  const removeAbsence = React.useCallback(
    (id: string) => {
      const a = absenceList.find((x) => x.id === id);
      if (!a) return;
      const p = generated.people.find((x) => x.id === a.personId);
      write([{ kind: "absence", id, payload: id.startsWith("abs-demo-") ? { removed: true } : {}, deleted: !id.startsWith("abs-demo-") }, entry({ action: "absence.change", summary: `Removed ${ABSENCE_TYPES[a.type].label.toLowerCase()} for ${p ? `${p.firstName} ${p.lastName}` : a.personId}`, teams: p?.coreAirline ? [p.coreAirline] : [], personId: a.personId, date: a.from, ref: id })]);
    },
    [write, entry, absenceList, generated.people],
  );

  const remindOnce = React.useCallback(
    (id: string, n: Omit<Notice, "id" | "at" | "by" | "readBy">) => {
      if (state.notice[id]) return;
      const to = [...new Set(n.to)].filter(Boolean);
      if (!to.length) return;
      write([{ kind: "notice", id, payload: { ...n, to, id, at: new Date().toISOString(), by: "Gateline", readBy: [] } satisfies Notice }]);
    },
    [write, state.notice],
  );

  // ---------------- Staff requests: shift swaps and leave ----------------
  const staffRequests = React.useMemo(() => {
    const saved = state.staffreq as Record<string, StaffRequest>;
    const seed = demoRequests(clock.date, generated.people, (pid, d) => plan.get(`${pid}|${d}`));
    const merged = [...seed.map((r) => saved[r.id] ?? r), ...Object.values(saved).filter((r) => !seed.some((x) => x.id === r?.id))];
    return merged.filter((r) => r && typeof r === "object" && "type" in r).sort((a, b) => b.at.localeCompare(a.at));
  }, [state.staffreq, clock.date, generated.people, plan]);
  const personOf = React.useCallback((id: string) => generated.people.find((x) => x.id === id), [generated.people]);
  const approversFor = React.useCallback(
    (p: Person | undefined, managersToo: boolean) => generated.people.filter((x) => x.active !== false && ((x.role === "supervisor" && x.homeTerminal === p?.homeTerminal) || (managersToo && x.role === "manager"))).map((x) => x.id),
    [generated.people],
  );
  const saveReq = React.useCallback((r: StaffRequest) => write([{ kind: "staffreq", id: r.id, payload: r }]), [write]);
  const requestSwap = React.useCallback(
    (r: Pick<SwapRequest, "with" | "date" | "myShift" | "theirShift" | "note">) => {
      if (!session) return;
      const full: SwapRequest = { ...r, type: "swap", id: `swap-${crypto.randomUUID().slice(0, 8)}`, by: session.personId, at: new Date().toISOString(), status: "awaiting_colleague" };
      saveReq(full);
      notify({ to: [r.with], kind: "team", title: `Shift swap request from ${session.name}`, body: `${fmtDay(r.date)}: you'd work ${shiftWord(r.myShift).toLowerCase()}${["E", "L", "M"].includes(r.theirShift) ? ` and they'd take your ${shiftWord(r.theirShift).toLowerCase()}` : " and they'd have the day off"}. Accept or decline on My schedule.`, href: "/me" });
    },
    [session, saveReq, notify],
  );
  const respondSwap = React.useCallback(
    (id: string, accept: boolean) => {
      const r = staffRequests.find((x) => x.id === id);
      if (!r || r.type !== "swap" || r.status !== "awaiting_colleague") return;
      const next: SwapRequest = { ...r, status: accept ? "awaiting_approval" : "declined", colleagueAt: new Date().toISOString(), ...(accept ? {} : { decidedBy: session?.name, decidedAt: new Date().toISOString(), decisionNote: "Colleague declined" }) };
      saveReq(next);
      const a = personOf(r.by);
      const b = personOf(r.with);
      const names = `${a ? `${a.firstName} ${a.lastName}` : "Agent"} ↔ ${b ? `${b.firstName} ${b.lastName}` : "colleague"}`;
      if (accept) notify({ to: approversFor(a, false), kind: "team", title: `Shift swap to approve · ${names}`, body: `${fmtDay(r.date)} · ${a?.coreAirline ?? "Float pool"}. Both agreed; rules already checked.`, href: "/requests" });
      notify({ to: [r.by], kind: "team", title: accept ? "Swap accepted, waiting for approval" : "Swap declined", body: `${b ? b.firstName : "Your colleague"} ${accept ? "accepted" : "declined"} your swap for ${fmtDay(r.date)}.`, href: "/me" });
    },
    [staffRequests, session, saveReq, personOf, approversFor, notify],
  );
  const requestLeave = React.useCallback(
    (r: Pick<LeaveRequest, "absenceType" | "from" | "to" | "note">) => {
      if (!session) return;
      const full: LeaveRequest = { ...r, type: "leave", id: `leave-${crypto.randomUUID().slice(0, 8)}`, by: session.personId, at: new Date().toISOString(), status: "awaiting_approval" };
      saveReq(full);
      const p = personOf(session.personId);
      const range = r.from === r.to ? fmtDay(r.from) : `${fmtDay(r.from)} – ${fmtDay(r.to)}`;
      notify({ to: approversFor(p, true), kind: "team", title: `${ABSENCE_TYPES[r.absenceType].label} request · ${session.name}`, body: `${range} · ${p?.coreAirline ?? "Float pool"}${r.note ? ` · ${r.note}` : ""}`, href: "/requests" });
    },
    [session, saveReq, personOf, approversFor, notify],
  );
  const decideRequest = React.useCallback(
    (id: string, approve: boolean, note?: string) => {
      const r = staffRequests.find((x) => x.id === id);
      if (!r || r.status !== "awaiting_approval") return;
      const decided = { decidedBy: session?.name, decidedAt: new Date().toISOString(), decisionNote: note || undefined };
      const a = personOf(r.by);
      if (r.type === "swap") {
        saveReq({ ...r, status: approve ? "approved" : "declined", ...decided });
        if (approve) {
          const b = personOf(r.with);
          setCells([{ personId: r.by, date: r.date, shift: r.theirShift }, { personId: r.with, date: r.date, shift: r.myShift }], { source: "manual", reason: `Shift swap approved: ${a?.firstName ?? ""} ↔ ${b?.firstName ?? ""}${note ? ` · ${note}` : ""}` });
        }
        notify({ to: [r.by, r.with], kind: "team", title: `Shift swap ${approve ? "approved" : "declined"}`, body: `${fmtDay(r.date)}${approve ? ": your roster is updated." : note ? `: ${note}` : "."}`, href: "/me" });
      } else {
        saveReq({ ...r, status: approve ? "approved" : "declined", ...decided });
        if (approve) saveAbsence({ personId: r.by, type: r.absenceType, from: r.from, to: r.to, note: r.note });
        notify({ to: [r.by], kind: "team", title: `${ABSENCE_TYPES[r.absenceType].label} ${approve ? "approved" : "declined"}`, body: `${r.from === r.to ? fmtDay(r.from) : `${fmtDay(r.from)} – ${fmtDay(r.to)}`}${note ? ` · ${note}` : ""}`, href: "/me" });
      }
      void a;
    },
    [staffRequests, session, personOf, saveReq, setCells, saveAbsence, notify],
  );
  const cancelRequest = React.useCallback(
    (id: string) => {
      const r = staffRequests.find((x) => x.id === id);
      if (!r || (r.status !== "awaiting_colleague" && r.status !== "awaiting_approval")) return;
      saveReq({ ...r, status: "cancelled" } as StaffRequest);
      if (r.type === "swap") notify({ to: [r.with], kind: "team", title: "Swap request withdrawn", body: `The swap for ${fmtDay(r.date)} was cancelled.`, href: "/me" });
    },
    [staffRequests, saveReq, notify],
  );

  const changeGate = React.useCallback(
    (flightId: string, gate: string, reason: string) => {
      const f = generated.flights.find((x) => x.id === flightId);
      if (!f) return;
      const cur = adviceFor(flightId);
      const from = cur.gate ?? f.gate;
      if (gate === from) return;
      const next: FlightAdvice = gate === f.gate ? { ...cur, gate: undefined, gateFrom: undefined, gateChangedAt: new Date().toISOString(), gateChangedBy: session?.name, gateReason: reason } : { ...cur, gate, gateFrom: f.gate, gateChangedAt: new Date().toISOString(), gateChangedBy: session?.name, gateReason: reason };
      write([{ kind: "advice", id: flightId, payload: next }, entry({ action: "schedule.change", summary: `Gate change ${f.flightNo} ${f.date}: ${from} → ${gate}${reason ? ` (${reason})` : ""}`, teams: [f.airline], date: f.date, ref: flightId })]);
      void publish({ module: "gateline", type: EVENT_TYPES.gateChange, payload: { flightId, flightNo: f.flightNo, from, to: gate, reason } });
      // Everyone working the flight, plus leads and supervisors on shift for that airline's terminal
      const log = (Object.values(state.log as Record<string, GateLog>).find((g) => g.flightId === flightId)) ?? generated.gateLogs.find((g) => g.flightId === flightId);
      const team = log ? log.team.map((t) => t.personId) : [];
      const sups = generated.people.filter((p) => p.role === "supervisor" && p.homeTerminal === f.terminal).map((p) => p.id);
      notify({ to: [...team, ...sups], kind: "gate", title: `Gate change · ${f.flightNo}`, body: `Now ${gate} (was ${from}) · STD ${f.std}${reason ? ` · ${reason}` : ""}`, href: `/gate/${flightId}` });
    },
    [generated, adviceFor, write, entry, session, state.log, notify],
  );
  const setFlightOps = React.useCallback(
    (flightId: string, ops: Omit<FlightOps, "by" | "at"> | null) => {
      const f = ds.flights.find((x) => x.id === flightId);
      if (!f) return;
      const cur = adviceFor(flightId);
      const next: FlightAdvice = { ...cur, ops: ops ? { ...ops, by: session?.name ?? "Duty manager", at: new Date().toISOString() } : undefined };
      const what = !ops
        ? `back on schedule`
        : ops.status === "cancelled"
          ? `cancelled (${ops.reason})`
          : ops.status === "delayed"
            ? `delayed to ${ops.newStd} (${ops.reason})`
            : `remaining overnight, departs ${ops.newDate ? fmtDay(ops.newDate) : "next day"} ${ops.newStd ?? f.std} (${ops.reason})`;
      write([{ kind: "advice", id: flightId, payload: next }, entry({ action: "schedule.change", summary: `${f.flightNo} ${fmtDay(f.date)} ${what}`, teams: [f.airline], date: f.date, ref: flightId })]);
      // The team on the flight, supervisors at that terminal and the airline's leads on shift that day
      const log = gateLogs.find((g) => g.flightId === flightId);
      const team = log ? log.team.map((t) => t.personId) : [];
      const sups = ds.people.filter((p) => p.role === "supervisor" && p.homeTerminal === f.terminal).map((p) => p.id);
      const leads = ds.people.filter((p) => p.role === "lead" && p.coreAirline === f.airline && ["E", "M", "L"].includes(liveIdx.get(`${p.id}|${f.date}`) ?? "")).map((p) => p.id);
      const title = !ops ? `${f.flightNo} back on schedule` : ops.status === "cancelled" ? `${f.flightNo} cancelled` : ops.status === "delayed" ? `${f.flightNo} delayed` : `${f.flightNo} remaining overnight`;
      notify({ to: [...new Set([...team, ...sups, ...leads])], kind: "gate", title, body: `${fmtDay(f.date)} · ${what}`, href: `/gate/${flightId}` });
    },
    [ds, adviceFor, write, entry, session, gateLogs, liveIdx, notify],
  );
  const setArrivalNeeds = React.useCallback(
    (flightId: string, needs: ArrivalNeeds | null) => {
      const f = ds.flights.find((x) => x.id === flightId);
      if (!f) return;
      const cur = adviceFor(flightId);
      const summary = needs ? [needs.wheelchairs && `${needs.wheelchairs} wheelchair`, needs.meetGreet && `${needs.meetGreet} meet & greet`, needs.special && `${needs.special} special service`].filter(Boolean).join(", ") || "no requests" : "cleared";
      write([{ kind: "advice", id: flightId, payload: { ...cur, arrivalNeeds: needs ?? undefined } }, entry({ action: "schedule.change", summary: `Arrival needs for ${f.inboundNo ?? f.flightNo}: ${summary}`, teams: [f.airline], date: f.date, ref: flightId })]);
    },
    [ds, adviceFor, write, entry],
  );
  const inbound = React.useMemo<InboundAlert[]>(() => {
    const fromRampline = events
      .filter((e) => e.type === EVENT_TYPES.inboundAlert)
      .map((e) => ({ ...(e.payload as Omit<InboundAlert, "id" | "at">), id: e.id, at: e.at }) as InboundAlert);
    return [...demoInbound(clock.date, generated.flights, clock.minutes), ...fromRampline];
  }, [events, clock.date, clock.minutes, generated.flights]);
  const alertsFor = React.useCallback(
    (flightId: string) => {
      const f = generated.flights.find((x) => x.id === flightId);
      if (!f) return [];
      const norm = (n: string) => n.replace(/\s/g, "").toUpperCase();
      return inbound.filter((a) => a.date === f.date && norm(a.flightNo) === norm(f.flightNo)).sort((a, b) => b.at.localeCompare(a.at));
    },
    [inbound, generated.flights],
  );
  const ackAlert = React.useCallback(
    (flightId: string, alertId: string) => {
      const cur = adviceFor(flightId);
      const at = new Date().toISOString();
      write([{ kind: "advice", id: flightId, payload: { ...cur, alertAcks: { ...(cur.alertAcks ?? {}), [alertId]: { by: session?.name ?? "Passenger services", at } } } }]);
      void publish({ module: "gateline", type: EVENT_TYPES.alertAck, payload: { flightId, alertId, by: session?.name, at } }).then(() => setEvents(localEvents()));
    },
    [adviceFor, write, session],
  );
  const postInboundAlert = React.useCallback(
    (a: Omit<InboundAlert, "id" | "at" | "by">) => {
      const by = "NFS Operations Control (Rampline)";
      void publish({ module: "rampline", type: EVENT_TYPES.inboundAlert, payload: { ...a, by } }).then(() => setEvents(localEvents()));
      const f = generated.flights.find((x) => x.date === a.date && x.flightNo === a.flightNo);
      if (!f) return;
      const log = (Object.values(state.log as Record<string, GateLog>).find((g) => g.flightId === f.id)) ?? generated.gateLogs.find((g) => g.flightId === f.id);
      const onShift = new Set(ds.roster.filter((r) => r.date === f.date && r.shift !== "O" && r.shift !== "V").map((r) => r.personId));
      const leads = generated.people.filter((p) => p.role === "lead" && p.coreAirline === f.airline && onShift.has(p.id)).map((p) => p.id);
      const sups = generated.people.filter((p) => (p.role === "supervisor" && p.homeTerminal === f.terminal) || p.role === "manager").map((p) => p.id);
      notify({
        to: [...(log?.team.map((t) => t.personId) ?? []), ...leads, ...sups],
        kind: "inbound",
        title: `${a.urgent ? "Urgent · " : ""}${a.category} · ${f.flightNo} inbound`,
        body: `${a.message}${a.wheelchairs ? ` · ${a.wheelchairs} wheelchair${a.wheelchairs > 1 ? "s" : ""} at the door` : ""}`,
        href: `/gate/${f.id}`,
      });
    },
    [generated, state.log, ds.roster, notify],
  );

  React.useEffect(() => {
    if (session?.personId) void rebindPush(session.personId);
  }, [session?.personId]);

  const savePerson = React.useCallback(
    (id: string, patch: Partial<Person>, log = true, note?: string) => {
      const cur = people.get(id);
      const rows: { kind: Kind; id: string; payload: unknown }[] = [{ kind: "person", id, payload: { ...(state.person[id] as object), ...patch } }];
      if (log && cur) {
        const prev: Record<string, unknown> = {};
        const parts: string[] = [];
        const label: Record<string, string> = { coreAirline: "team", role: "role", homeTerminal: "terminal", trainedAirlines: "qualified on", active: "active", leftOn: "last day" };
        for (const [k, v] of Object.entries(patch)) {
          const before = (cur as unknown as Record<string, unknown>)[k];
          if (JSON.stringify(before) === JSON.stringify(v)) continue;
          prev[k] = before ?? null;
          if (k === "leaving") continue;
          const show = (x: unknown) => (x === null || x === undefined ? (k === "coreAirline" ? "Float pool" : "none") : Array.isArray(x) ? x.join(", ") || "none" : String(x));
          parts.push(`${label[k] ?? k} ${show(before)} → ${show(v)}`);
        }
        if (parts.length) {
          const teams = [...new Set([teamOf(cur), teamOf({ ...cur, ...patch } as Person)].filter(Boolean) as TeamKey[])];
          rows.push(entry({ action: "team.assign", summary: `${nameOf(id)}: ${parts.join(" · ")}${note ? ` · ${note}` : ""}`, teams, personId: id, prev }));
        }
      }
      write(rows);
    },
    [write, state.person, people, entry, nameOf],
  );
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
  const saveRules = React.useCallback(
    (o: Partial<Record<RuleId, Partial<RuleSetting>>>) => write([{ kind: "rules", id: "config", payload: o }, entry({ action: "rules.change", summary: "Updated roster rule settings" })]),
    [write, entry],
  );

  // ---------- Roster periods ----------
  const periodTitle = React.useCallback(
    (p: Pick<RosterPeriod, "teams" | "start" | "weeks">) =>
      `${p.teams.length > 3 ? "All teams" : p.teams.map((t) => teamLabel(t, ds.airlines)).join(", ")} · ${fmtDay(p.start)} – ${fmtDay(periodEnd(p))} (${p.weeks} week${p.weeks > 1 ? "s" : ""})`,
    [ds.airlines],
  );
  const createPeriod = React.useCallback(
    (p: Omit<RosterPeriod, "id" | "createdBy" | "createdAt" | "status">) => {
      const full: RosterPeriod = { ...p, id: crypto.randomUUID(), status: "draft", createdBy: actor, createdAt: new Date().toISOString(), share: null };
      write([{ kind: "period", id: full.id, payload: full }, entry({ action: "period.create", summary: `Created draft roster: ${periodTitle(full)}`, teams: full.teams, date: full.start, ref: full.id })]);
      return full.id;
    },
    [write, entry, actor, periodTitle],
  );
  const editPeriodCells = React.useCallback(
    (id: string, edits: CellEdit[]) => {
      const p = state.period[id] as RosterPeriod | undefined;
      if (!p) return;
      const grid = { ...p.grid };
      const cells: CellChange[] = [];
      for (const e of edits) {
        const row = grid[e.personId];
        const i = Math.round((Date.parse(e.date) - Date.parse(p.start)) / 86400000);
        if (!row || i < 0 || i >= row.length || row[i] === e.shift) continue;
        cells.push({ personId: e.personId, date: e.date, from: row[i] as ShiftCode, to: e.shift });
        grid[e.personId] = row.slice(0, i) + e.shift + row.slice(i + 1);
      }
      if (!cells.length) return;
      const summary = cells.length === 1 ? `Draft · ${nameOf(cells[0].personId)} · ${fmtDay(cells[0].date)}: ${shiftWord(cells[0].from)} → ${shiftWord(cells[0].to)}` : `Draft · ${cells.length} shifts changed`;
      write([{ kind: "period", id, payload: { ...p, grid } }, entry({ action: "period.edit", summary, teams: teamsOf(cells.map((c) => c.personId)), personId: cells.length === 1 ? cells[0].personId : undefined, date: cells[0].date, cells, ref: id })]);
    },
    [write, entry, state.period, nameOf, teamsOf],
  );
  const publishPeriod = React.useCallback(
    (id: string) => {
      const p = state.period[id] as RosterPeriod | undefined;
      if (!p) return;
      const days = new Set(periodDays(p));
      const ids = new Set(Object.keys(p.grid));
      // Publishing replaces earlier hand changes inside the period for these people.
      const cleared = [...overrides.values()].filter((o) => ids.has(o.personId) && days.has(o.date));
      write([
        { kind: "period", id, payload: { ...p, status: "published", publishedBy: actor, publishedAt: new Date().toISOString() } },
        ...cleared.map((o) => ({ kind: "roster" as Kind, id: `${o.personId}|${o.date}`, payload: {}, deleted: true })),
        entry({ action: "period.publish", summary: `Published roster: ${periodTitle(p)}`, teams: p.teams, date: p.start, ref: id }),
      ]);
    },
    [write, entry, state.period, overrides, actor, periodTitle],
  );
  const deletePeriod = React.useCallback(
    (id: string) => {
      const p = state.period[id] as RosterPeriod | undefined;
      if (!p || p.status !== "draft") return;
      write([{ kind: "period", id, payload: {}, deleted: true }, entry({ action: "period.delete", summary: `Deleted draft: ${periodTitle(p)}`, teams: p.teams, date: p.start, ref: id })]);
    },
    [write, entry, state.period, periodTitle],
  );
  const setShareLink = React.useCallback(
    (id: string, on: boolean) => {
      const p = state.period[id] as RosterPeriod | undefined;
      if (!p || p.status !== "published") return null;
      if (!on) {
        write([{ kind: "period", id, payload: { ...p, share: null } }, entry({ action: "share.revoke", summary: `Revoked the share link for ${periodTitle(p)}`, teams: p.teams, ref: id })]);
        return null;
      }
      const share = { token: newShareToken(), createdAt: new Date().toISOString(), createdBy: actor.name, expires: periodEnd(p) };
      write([{ kind: "period", id, payload: { ...p, share } }, entry({ action: "share.create", summary: `Created a share link for ${periodTitle(p)}`, teams: p.teams, ref: id })]);
      return share.token;
    },
    [write, entry, state.period, actor, periodTitle],
  );

  // ---------- Undo from the change log ----------
  const undo = React.useCallback(
    (entryId: string) => {
      const e = state.audit[entryId] as AuditEntry | undefined;
      if (!e || e.undone) return false;
      const rows: { kind: Kind; id: string; payload: unknown; deleted?: boolean }[] = [];
      if (e.cells?.length && e.action !== "period.edit") {
        for (const c of e.cells) {
          const id = `${c.personId}|${c.date}`;
          if (!c.from || plan.get(id) === c.from) rows.push({ kind: "roster", id, payload: {}, deleted: true });
          else rows.push({ kind: "roster", id, payload: { personId: c.personId, date: c.date, shift: c.from, at: new Date().toISOString(), by, byId: actor.id, byRole: actor.role } satisfies RosterOverride });
        }
      }
      if ((e.action === "cover.move" || e.action === "roster.fix") && e.ref && state.reassignment[e.ref]) rows.push({ kind: "reassignment", id: e.ref, payload: {}, deleted: true });
      if (e.action === "team.assign" && e.personId && e.prev) rows.push({ kind: "person", id: e.personId, payload: { ...(state.person[e.personId] as object), ...e.prev } });
      if (!rows.length) return false;
      const at = new Date().toISOString();
      rows.push({ kind: "audit", id: e.id, payload: { ...e, undone: { by: actor.name, at } } });
      rows.push(entry({ action: "undo", summary: `Undid: ${ACTION_LABEL[e.action].toLowerCase()} by ${e.actor.name} — ${e.summary}`, teams: e.teams, personId: e.personId, date: e.date, undoOf: e.id }));
      write(rows);
      return true;
    },
    [write, entry, state.audit, state.reassignment, state.person, plan, by, actor],
  );

  const resetDemo = React.useCallback(() => {
    window.localStorage.removeItem(K_STATE);
    window.sessionStorage.removeItem(K_PENDING);
    clearLocalEvents();
    void resetRemote();
    reload();
  }, [reload]);

  // ---------------- Station scope ----------------
  const meP = session ? people.get(session.personId) ?? null : null;
  const canSwitchStation = STATIONS.length > 1 && (meP?.role === "manager" || meP?.role === "admin");
  const pickOk = stationPick && STATIONS.some((x) => x.code === stationPick) ? stationPick : null;
  const station = canSwitchStation ? pickOk ?? stationOf(meP) : stationOf(meP);
  const setStation = React.useCallback((code: string) => {
    setStationPick(code);
    save("local", K_STATION, code);
  }, []);
  // Arrival requests: what duty staff entered, plus wheelchairs Rampline flagged on the inbound
  const dsN = React.useMemo<Dataset>(() => {
    const adv = state.advice as Record<string, FlightAdvice>;
    const fromAlerts = new Map<string, number>();
    for (const a of inbound) if (a.wheelchairs) fromAlerts.set(`${a.flightNo}|${a.date}`, (fromAlerts.get(`${a.flightNo}|${a.date}`) ?? 0) + a.wheelchairs);
    if (!fromAlerts.size && !Object.values(adv).some((x) => x?.arrivalNeeds)) return ds;
    const flights = ds.flights.map((f) => {
      const entered = adv[f.id]?.arrivalNeeds;
      const ad = arrivalDateOf(f);
      const alertW = ad ? (fromAlerts.get(`${f.inboundNo ?? f.flightNo}|${ad}`) ?? (f.inboundNo ? 0 : fromAlerts.get(`${f.flightNo}|${ad}`) ?? 0)) : 0;
      if (!entered && !alertW) return f;
      const n = entered ?? { wheelchairs: 0, meetGreet: 0, special: 0 };
      return { ...f, arrivalNeeds: { ...n, wheelchairs: Math.max(n.wheelchairs, alertW) } };
    });
    return { ...ds, flights };
  }, [ds, state.advice, inbound]);

  const scoped = React.useMemo(() => {
    const ds = dsN;
    // Signed-out pages (the station manager's private link) see every station
    if (!meP) return { people, ds, gateLogs, feedback, reassignments, routes, charters, periods, audit, absences, staffRequests };
    const airlinesIn = ds.airlines.filter((a) => stationOf(a) === station);
    const codes = new Set(airlinesIn.map((a) => a.code));
    const peopleIn = ds.people
      .filter((p) => p.role === "manager" || p.role === "admin" || stationOf(p) === station)
      .map((p) => (p.trainedAirlines.every((c) => codes.has(c)) ? p : { ...p, trainedAirlines: p.trainedAirlines.filter((c) => codes.has(c)), training: p.training.filter((t) => codes.has(t.airline)) }));
    const ids = new Set(peopleIn.map((p) => p.id));
    const inTeams = (teams?: string[]) => !teams?.length || teams.some((t) => codes.has(t) || !/^[A-Z0-9]{2,3}$/.test(t) || !ds.airlines.some((a) => a.code === t));
    return {
      ds: {
        ...ds,
        airlines: airlinesIn,
        people: peopleIn,
        flights: ds.flights.filter((f) => codes.has(f.airline)),
        roster: ds.roster.filter((r) => ids.has(r.personId)),
        gateLogs: ds.gateLogs.filter((g) => codes.has(g.airline)),
        feedback: ds.feedback.filter((f) => codes.has(f.airline)),
      },
      gateLogs: gateLogs.filter((g) => codes.has(g.airline)),
      feedback: feedback.filter((f) => codes.has(f.airline)),
      reassignments: reassignments.filter((r) => ids.has(r.personId) || codes.has(r.toAirline)),
      routes: routes.filter((r) => codes.has(r.airline)),
      charters: charters.filter((c) => codes.has(c.handledAs)),
      periods: periods.filter((p) => inTeams(p.teams)),
      audit: audit.filter((e) => inTeams(e.teams)),
      absences: absences.filter((a) => ids.has(a.personId)),
      staffRequests: staffRequests.filter((r) => ids.has(r.by)),
      people: (() => { const byId = new Map(peopleIn.map((x) => [x.id, x])); return new Map([...people].map(([id, p]) => [id, byId.get(id) ?? p])); })(),
    };
  }, [dsN, people, meP, station, gateLogs, feedback, reassignments, routes, charters, periods, audit, absences, staffRequests]);

  const value: HubState = {
    ready: mounted,
    ds: scoped.ds,
    today: clock.date,
    nowMin: clock.minutes,
    session,
    me: session ? scoped.people.get(session.personId) ?? null : null,
    people: scoped.people,
    rules,
    gateLogs: scoped.gateLogs,
    logByFlight,
    reassignments: scoped.reassignments,
    feedback: scoped.feedback,
    events,
    overrides,
    rosterEdits,
    routes: scoped.routes,
    charters: scoped.charters,
    requests,
    periods: scoped.periods,
    audit: scoped.audit,
    synced,
    planShift: (personId: string, date: string) => plan.get(`${personId}|${date}`),
    offline,
    pendingCount: Object.keys(pending).length + (mounted ? outbox().length : 0),
    setOffline,
    saveLog,
    addReassignment,
    removeReassignment,
    setFeedbackStatus,
    logFeedback,
    setFeedbackLink,
    setCells,
    revertCells,
    applyFix,
    saveAirline,
    updateSla,
    removeAirline,
    saveRoute,
    removeRoute,
    saveCharter,
    removeCharter,
    absences: scoped.absences,
    absenceOn,
    saveAbsence,
    removeAbsence,
    adviceFor,
    saveAdvice,
    changeGate,
    setFlightOps,
    setArrivalNeeds,
    alertsFor,
    ackAlert,
    postInboundAlert,
    notices,
    unread,
    notify,
    remindOnce,
    staffRequests: scoped.staffRequests,
    requestSwap,
    respondSwap,
    requestLeave,
    decideRequest,
    cancelRequest,
    markRead,
    uploadLogo,
    savePerson,
    saveProfile,
    uploadPhoto,
    requestPassword,
    resolveRequest,
    saveRules,
    createPeriod,
    editPeriodCells,
    publishPeriod,
    deletePeriod,
    setShareLink,
    undo,
    refreshSession: () => setSession(readSession()),
    resetDemo,
    station,
    stations: STATIONS,
    canSwitchStation,
    setStation,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Seeded feedback predates star ratings; give each a stable one so averages read sensibly. */
function seedRating(f: FeedbackItem): number {
  let h = 0;
  for (const c of f.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return f.kind === "praise" ? 4 + (h % 2) : 2 + (h % 2);
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
