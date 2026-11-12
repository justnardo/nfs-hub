"use client";
/**
 * Cross-device sync for the live demo via Supabase (gateline.demo_state + Realtime) and
 * profile photos (gateline-avatars bucket). Active only when the Supabase env vars are set.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type Kind = "log" | "reassignment" | "feedback" | "roster" | "airline" | "route" | "person" | "profile" | "request" | "rules" | "period" | "audit";
export const KINDS: Kind[] = ["log", "reassignment", "feedback", "roster", "airline", "route", "person", "profile", "request", "rules", "period", "audit"];
export type StateMap = Record<Kind, Record<string, unknown>>;

export const emptyState = (): StateMap => Object.fromEntries(KINDS.map((k) => [k, {}])) as StateMap;

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

type Row = { kind: Kind; id: string; payload: unknown; deleted: boolean };

export async function pullAll(): Promise<StateMap | null> {
  const c = sb();
  if (!c) return null;
  const { data, error } = await c.schema("gateline").from("demo_state").select("kind,id,payload,deleted").eq("deleted", false).limit(5000);
  if (error || !data) return null;
  const out = emptyState();
  for (const r of data as Row[]) if (out[r.kind]) out[r.kind][r.id] = r.payload;
  return out;
}

export async function upsert(kind: Kind, id: string, payload: unknown, deleted = false): Promise<boolean> {
  const c = sb();
  if (!c) return true;
  const { error } = await c.schema("gateline").from("demo_state").upsert({ kind, id, payload: payload ?? {}, deleted, updated_at: new Date().toISOString() });
  return !error;
}

export async function upsertMany(rows: { kind: Kind; id: string; payload: unknown; deleted?: boolean }[]): Promise<boolean> {
  const c = sb();
  if (!c || !rows.length) return true;
  const at = new Date().toISOString();
  const { error } = await c.schema("gateline").from("demo_state").upsert(rows.map((r) => ({ kind: r.kind, id: r.id, payload: r.payload ?? {}, deleted: !!r.deleted, updated_at: at })));
  return !error;
}

export async function resetRemote() {
  const c = sb();
  if (!c) return;
  await c.schema("gateline").from("demo_state").delete().neq("id", "");
}

export function subscribeState(onChange: () => void): () => void {
  const c = sb();
  if (!c) return () => {};
  const ch = c
    .channel("gateline-demo-state")
    .on("postgres_changes", { event: "*", schema: "gateline", table: "demo_state" }, () => onChange())
    .subscribe();
  return () => void c.removeChannel(ch);
}

/** Resize to a 256px square JPEG in the browser. */
export async function resizePhoto(file: File, size = 256): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    c.getContext("2d")!.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Upload a profile photo; returns its public URL (or a data URL when Supabase isn't configured). */
export async function uploadAvatar(personId: string, blob: Blob): Promise<string | null> {
  const c = sb();
  if (!c) {
    return await new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsDataURL(blob);
    });
  }
  const path = `${personId}-${Date.now()}.jpg`;
  const { error } = await c.storage.from("gateline-avatars").upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) return null;
  return c.storage.from("gateline-avatars").getPublicUrl(path).data.publicUrl;
}
