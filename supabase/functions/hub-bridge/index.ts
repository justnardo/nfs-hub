// NFS Hub bridge: lets another module (Rampline) publish onto the hub event bus (core.events).
// Server-to-server only: the caller sends its module key in `x-hub-key`; we compare its SHA-256
// with core.bridge_keys and insert with the service role. Gateline and the Hub page pick the
// event up over Realtime like any other.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/** What each module may publish. Anything else is refused. */
const ALLOWED: Record<string, string[]> = {
  rampline: ["ops.inbound_alert", "ramp.offload_done", "flight.gate_change", "flight.status", "hub.ping"],
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const key = req.headers.get("x-hub-key") ?? "";
  let body: { module?: string; type?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Body must be JSON" });
  }
  const module = String(body.module ?? "");
  const type = String(body.type ?? "");
  if (!ALLOWED[module]) return json(400, { error: "Unknown module" });
  if (!ALLOWED[module].includes(type)) return json(400, { error: `Type not allowed for ${module}` });
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
  if (JSON.stringify(payload).length > 8000) return json(413, { error: "Payload too large" });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "core" } });
  const { data: row } = await sb.from("bridge_keys").select("key_hash").eq("module", module).maybeSingle();
  if (!row || !key || (await sha256(key)) !== row.key_hash) return json(401, { error: "Bad key" });

  const { data, error } = await sb.from("events").insert({ module, type, payload }).select("id, at").single();
  if (error) return json(500, { error: error.message });
  return json(200, { ok: true, id: data.id, at: data.at });
});
