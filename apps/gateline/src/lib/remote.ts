"use client";
/**
 * Cross-device sync for the live demo via Supabase (gateline.demo_state + Realtime) and
 * profile photos (gateline-avatars bucket). Active only when the Supabase env vars are set.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type Kind = "log" | "reassignment" | "feedback" | "roster" | "airline" | "route" | "person" | "profile" | "request" | "rules" | "period" | "audit" | "charter" | "advice" | "notice" | "absence";
export const KINDS: Kind[] = ["log", "reassignment", "feedback", "roster", "airline", "route", "person", "profile", "request", "rules", "period", "audit", "charter", "advice", "notice", "absence"];
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

/**
 * Prepare an airline logo: trim empty margins (transparent or near-white), fit within 400×160
 * without cropping, keep transparency, and suggest a brand colour from the most common saturated pixel hue.
 */
export async function prepareLogo(file: File): Promise<{ blob: Blob; colour: string | null }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const w = img.naturalWidth || 400;
    const h = img.naturalHeight || 160;
    const src = document.createElement("canvas");
    src.width = w;
    src.height = h;
    const sx = src.getContext("2d", { willReadFrequently: true })!;
    sx.drawImage(img, 0, 0, w, h);
    const px = sx.getImageData(0, 0, w, h).data;
    const empty = (i: number) => px[i + 3] < 16 || (px[i] > 245 && px[i + 1] > 245 && px[i + 2] > 245);
    let top = h, left = w, right = -1, bottom = -1;
    const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (empty(i)) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        const r = px[i], g = px[i + 1], b = px[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        if (max - min < 60 || max < 50) continue; // greys, black and white say nothing about the brand
        const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
        const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
        e.n++; e.r += r; e.g += g; e.b += b;
        buckets.set(key, e);
      }
    }
    if (right < 0) { left = 0; top = 0; right = w - 1; bottom = h - 1; }
    const pad = 4;
    left = Math.max(0, left - pad); top = Math.max(0, top - pad);
    right = Math.min(w - 1, right + pad); bottom = Math.min(h - 1, bottom + pad);
    const cw = right - left + 1, ch = bottom - top + 1;
    const scale = Math.min(1, 400 / cw, 160 / ch);
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(cw * scale));
    out.height = Math.max(1, Math.round(ch * scale));
    const ox = out.getContext("2d")!;
    ox.imageSmoothingQuality = "high";
    ox.drawImage(src, left, top, cw, ch, 0, 0, out.width, out.height);
    const blob = await new Promise<Blob>((res) => out.toBlob((b) => res(b!), "image/png"));
    let colour: string | null = null;
    let best = 0;
    for (const e of buckets.values()) {
      if (e.n > best) {
        best = e.n;
        const hex = (v: number) => Math.round(v / e.n).toString(16).padStart(2, "0");
        colour = `#${hex(e.r)}${hex(e.g)}${hex(e.b)}`;
      }
    }
    return { blob, colour };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Upload an airline logo; returns its public URL (or a data URL when Supabase isn't configured). */
export async function uploadAirlineLogo(code: string, blob: Blob): Promise<string | null> {
  const c = sb();
  if (!c) {
    return await new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsDataURL(blob);
    });
  }
  const path = `${code}-${Date.now()}.png`;
  const { error } = await c.storage.from("gateline-airline-logos").upload(path, blob, { contentType: "image/png", upsert: false });
  if (error) return null;
  return c.storage.from("gateline-airline-logos").getPublicUrl(path).data.publicUrl;
}

/* ---------------- Phone alerts (Web Push) ---------------- */

/** Public half of the Web Push key pair (safe to ship); the private half is a Supabase Edge Function secret. */
const VAPID_PUBLIC = "BDM5wIZMGcNMBVPa_OIBCyWB-Ay9mYuEiyhp9Ys15Ff0teOAqyO6gcdF_grWhEp0xZriQdKoj7ged5O05H4uAvc";

const b64ToBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

/** What this phone/browser can do. iPhones only allow alerts once Gateline is added to the Home Screen. */
export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
    const ios = typeof navigator !== "undefined" && /iphone|ipad/i.test(navigator.userAgent);
    return ios ? "needs-install" : "unsupported";
  }
  if (!("PushManager" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

/** Calls the gateline-push edge function (subscriptions and the signing key stay server-side). */
async function pushFn(body: Record<string, unknown>): Promise<boolean> {
  const c = sb();
  if (!c) return false;
  const { error } = await c.functions.invoke("gateline-push", { body });
  return !error;
}

/** Ask permission, subscribe this device and register it for the person signed in. */
export async function enablePush(personId: string): Promise<PushState> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? VAPID_PUBLIC;
  if (!("serviceWorker" in navigator)) return "unsupported";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
  const ok = await pushFn({ action: "register", endpoint: sub.endpoint, personId, subscription: sub.toJSON(), userAgent: navigator.userAgent });
  return ok ? "on" : "off";
}

/** Point this device's alerts at whoever is signed in now (shared phones change hands at shift change). */
export async function rebindPush(personId: string) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("Notification" in window) || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await pushFn({ action: "register", endpoint: sub.endpoint, personId, subscription: sub.toJSON(), userAgent: navigator.userAgent });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await pushFn({ action: "unregister", endpoint: sub.endpoint });
  await sub.unsubscribe();
}

/** Send phone alerts (fire and forget; the in-app alert is already saved). */
export function sendPush(to: string[], title: string, body: string, url: string, tag?: string) {
  if (!to.length) return;
  void pushFn({ action: "notify", to, title, body, url, tag });
}
