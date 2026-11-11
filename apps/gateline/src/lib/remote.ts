"use client";
/**
 * Cross-device sync for the live demo via Supabase (gateline.demo_state + Realtime).
 * Active only when NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are set;
 * otherwise the store stays browser-only.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FeedbackItem, GateLog, Reassignment } from "@nfs/db";

let client: SupabaseClient | null = null;
function sb(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export const remoteEnabled = () => !!sb();

export interface RemoteState {
  logs: Record<string, GateLog>;
  reassignments: Reassignment[];
  feedback: Record<string, FeedbackItem["status"]>;
}

type Row = { kind: "log" | "reassignment" | "feedback"; id: string; payload: unknown; deleted: boolean };

export async function pullState(): Promise<RemoteState | null> {
  const c = sb();
  if (!c) return null;
  const { data, error } = await c.schema("gateline").from("demo_state").select("kind,id,payload,deleted").eq("deleted", false);
  if (error || !data) return null;
  const out: RemoteState = { logs: {}, reassignments: [], feedback: {} };
  for (const r of data as Row[]) {
    if (r.kind === "log") out.logs[r.id] = r.payload as GateLog;
    else if (r.kind === "reassignment") out.reassignments.push(r.payload as Reassignment);
    else if (r.kind === "feedback") out.feedback[r.id] = (r.payload as { status: FeedbackItem["status"] }).status;
  }
  out.reassignments.sort((a, b) => a.at.localeCompare(b.at));
  return out;
}

async function upsert(kind: Row["kind"], id: string, payload: unknown, deleted = false) {
  const c = sb();
  if (!c) return true;
  const { error } = await c.schema("gateline").from("demo_state").upsert({ kind, id, payload, deleted, updated_at: new Date().toISOString() });
  return !error;
}

export const pushLog = (log: GateLog) => upsert("log", log.flightId, log);
export const pushReassignment = (r: Reassignment) => upsert("reassignment", r.id, r);
export const removeReassignmentRemote = (id: string) => upsert("reassignment", id, {}, true);
export const pushFeedback = (id: string, status: FeedbackItem["status"]) => upsert("feedback", id, { status });

export async function resetRemote() {
  const c = sb();
  if (!c) return;
  await c.schema("gateline").from("demo_state").delete().neq("id", "");
  await c.schema("core").from("events").delete().eq("module", "gateline"); // ignored by RLS if not permitted
}

/** Calls back on any change from any device. */
export function subscribeState(onChange: () => void): () => void {
  const c = sb();
  if (!c) return () => {};
  const ch = c
    .channel("gateline-demo-state")
    .on("postgres_changes", { event: "*", schema: "gateline", table: "demo_state" }, () => onChange())
    .subscribe();
  return () => void c.removeChannel(ch);
}
