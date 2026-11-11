/**
 * One login across the NFS hub. Role-based access per module.
 * Demo mode keeps the session in the browser; production swaps in Supabase Auth
 * (single sign-on across *.nfs-hub subdomains) without changing these permission checks.
 */
import type { Person, Role } from "@nfs/db";

export const ROLE_LABEL: Record<Role, string> = {
  agent: "Agent",
  lead: "Lead",
  supervisor: "Supervisor",
  manager: "Manager",
  admin: "Admin",
};

export const ROLE_RANK: Record<Role, number> = { agent: 1, lead: 2, supervisor: 3, manager: 4, admin: 5 };

export type Permission =
  | "gate.log"
  | "roster.view"
  | "roster.edit"
  | "reassign.request"
  | "reassign.approve"
  | "reassign.override"
  | "analytics.view"
  | "records.share"
  | "airlines.edit"
  | "feedback.manage"
  | "staff.view";

const GRANTS: Record<Role, Permission[]> = {
  agent: ["roster.view"],
  lead: ["roster.view", "gate.log", "staff.view"],
  supervisor: ["roster.view", "gate.log", "staff.view", "reassign.request", "analytics.view", "records.share"],
  manager: ["roster.view", "gate.log", "staff.view", "roster.edit", "reassign.request", "reassign.approve", "reassign.override", "analytics.view", "records.share", "feedback.manage"],
  admin: ["roster.view", "gate.log", "staff.view", "roster.edit", "reassign.request", "reassign.approve", "reassign.override", "analytics.view", "records.share", "feedback.manage", "airlines.edit"],
};

export function can(role: Role | undefined, perm: Permission): boolean {
  return !!role && GRANTS[role].includes(perm);
}

export interface Session {
  personId: string;
  name: string;
  role: Role;
  module: "gateline";
  signedInAt: string;
}

const KEY = "nfs-hub.session";

/**
 * Session is held per tab (sessionStorage) so a lead's phone view and a manager's dashboard
 * can run side by side in one browser during demos; localStorage remembers the last sign-in for new tabs.
 */
export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY) ?? window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function signIn(person: Person): Session {
  const s: Session = { personId: person.id, name: `${person.firstName} ${person.lastName}`, role: person.role, module: "gateline", signedInAt: new Date().toISOString() };
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(s));
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — session lives in memory only */
  }
  return s;
}

export function signOut() {
  try {
    window.sessionStorage.removeItem(KEY);
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Where each role lands after signing in. */
export function homeFor(role: Role): string {
  switch (role) {
    case "agent":
      return "/me";
    case "lead":
      return "/gate";
    default:
      return "/";
  }
}
