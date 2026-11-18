"use client";
import * as React from "react";
import {
  addDays, formatDate, nassauNow, type Airline, type FeedbackItem, type GateEventType, type GateLog, type HubEvent, type Person,
  type Reassignment, type RosterEntry, type ShiftCode,
} from "@nfs/db";
import { AIRLINES, ROUTES, demoCharters, generateDataset, type Charter, type Dataset, type RouteTemplate } from "@nfs/demo";
import { resolveRules, type CellEdit, type Fix, type RosterEdit, type RuleId, type RuleSetting, type RuleSettings } from "@nfs/rules";
import { readSession, type Session } from "@nfs/auth";
import { EVENT_TYPES, flush, isOnline, localEvents, outbox, publish, pullRecent, setForcedOffline, subscribe, clearLocalEvents } from "@nfs/events";
import { ACTION_LABEL, newShareToken, periodDays, periodEnd, teamLabel, teamOf, type Actor, type AuditAction, type AuditEntry, type CellChange, type RosterPeriod, type TeamKey } from "./periods";
import { ABSENCE_TYPES, absenceCovers, applyAbsences, type Absence } from "./absence";
import { demoInbound, demoSsr, type FlightAdvice, type InboundAlert, type Notice } from "./advice";
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
  setFeedbackStatus: (id: string, status: FeedbackItem["status"]) => void;
  setCells: (edits: CellEdit[], meta?: CellMeta) => void;
  revertCells: (keys: { personId: string; date: string }[]) => void;
  applyFix: (fix: Fix, overrideReason?: string | null) => void;
  saveAirline: (a: Airline) => void;
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
  /** Issues on inbound flights posted by Rampline operations, for a flight (by flight number and date). */
  alertsFor: (flightId: string) => InboundAlert[];
  ackAlert: (flightId: string, alertId: string) => void;
  /** Demo stand-in for Rampline: posts an inbound alert as the operations team would. */
  postInboundAlert: (a: Omit<InboundAlert, "id" | "at" | "by">) => void;
  /** Alerts for the person signed in, newest first. */
  notices: Notice[];
  unread: number;
  notify: (n: Omit<Notice, "id" | "at" | "by" | "readBy">) => void;
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
  const ds = React.useMemo<Dataset>(() => {
    const profiles = state.profile as Record<string, ProfilePatch>;
    const people = generated.people.map((p) => (profiles[p.id] ? { ...p, ...profiles[p.id] } : p));
    const idx = new Map(plan);
    for (const [k, o] of overrides) idx.set(k, o.shift);
    const roster: RosterEntry[] = [];
    for (const [k, shift] of idx) {
      const [personId, date] = k.split("|");
      roster.push({ personId, date, shift });
    }
    const absent = Object.values(state.absence) as Absence[];
    const leftOn = new Map(people.filter((p) => p.leftOn).map((p) => [p.id, p.leftOn!]));
    const withAbsence = applyAbsences({ roster: leftOn.size ? roster.filter((r) => !leftOn.has(r.personId) || r.date <= leftOn.get(r.personId)!) : roster }, absent).roster;
    const adv = state.advice as Record<string, FlightAdvice>;
    const flights = Object.keys(adv).length ? generated.flights.map((f) => (adv[f.id]?.gate && adv[f.id].gate !== f.gate ? { ...f, gate: adv[f.id].gate!, gateFrom: f.gate } : f)) : generated.flights;
    return { ...generated, people, roster: withAbsence, flights };
  }, [generated, plan, overrides, state.profile, state.advice, state.absence]);
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
    const st = state.feedback as Record<string, { status: FeedbackItem["status"] }>;
    return ds.feedback.map((f) => (st[f.id] ? { ...f, status: st[f.id].status } : f));
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
        void publish({ module: "gateline", type: change.type, payload: { flightId: log.flightId, airline: log.airline, ...change.payload } }).then(() => setEvents(localEvents()));
        const ev = change.payload.event as GateEventType | undefined;
        if (ev === "door_close") void publish({ module: "gateline", type: EVENT_TYPES.doorClose, payload: { flightId: log.flightId, at: change.payload.at } });
        if (ev === "pushback") void publish({ module: "gateline", type: EVENT_TYPES.pushback, payload: { flightId: log.flightId, at: change.payload.at } });
      }
    },
    [offline, write],
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
  const setFeedbackStatus = React.useCallback((id: string, status: FeedbackItem["status"]) => write([{ kind: "feedback", id, payload: { status } }]), [write]);

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
    (n: Omit<Notice, "id" | "at" | "by" | "readBy">) => {
      const to = [...new Set(n.to)].filter((id) => id && id !== session?.personId);
      if (!to.length) return;
      const full: Notice = { ...n, to, id: crypto.randomUUID(), at: new Date().toISOString(), by: session?.name ?? "Gateline", readBy: [] };
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
  const absences = React.useMemo(() => (Object.values(state.absence) as Absence[]).sort((a, b) => b.from.localeCompare(a.from)), [state.absence]);
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
      const a = state.absence[id] as Absence | undefined;
      if (!a) return;
      const p = generated.people.find((x) => x.id === a.personId);
      write([{ kind: "absence", id, payload: {}, deleted: true }, entry({ action: "absence.change", summary: `Removed ${ABSENCE_TYPES[a.type].label.toLowerCase()} for ${p ? `${p.firstName} ${p.lastName}` : a.personId}`, teams: p?.coreAirline ? [p.coreAirline] : [], personId: a.personId, date: a.from, ref: id })]);
    },
    [write, entry, state.absence, generated.people],
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
    charters,
    requests,
    periods,
    audit,
    synced,
    planShift: (personId: string, date: string) => plan.get(`${personId}|${date}`),
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
    saveCharter,
    removeCharter,
    absences,
    absenceOn,
    saveAbsence,
    removeAbsence,
    adviceFor,
    saveAdvice,
    changeGate,
    alertsFor,
    ackAlert,
    postInboundAlert,
    notices,
    unread,
    notify,
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
