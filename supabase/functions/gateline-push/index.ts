import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Gateline phone alerts (Web Push). Deployed to the Gateline Supabase project as `gateline-push`.
 *  register   { endpoint, personId, subscription }    -> save this device for a person
 *  unregister { endpoint }                             -> remove this device
 *  notify     { to: personIds, title, body, url, tag } -> alert every device of those people
 * Subscriptions are only readable here (service role). The VAPID private key is the Edge Function
 * secret VAPID_PRIVATE_KEY. DEMO ONLY: callable with the anon key. Production: require a Supabase
 * Auth session and check the sender may alert these staff.
 */
const PUBLIC_KEY = "BDM5wIZMGcNMBVPa_OIBCyWB-Ay9mYuEiyhp9Ys15Ff0teOAqyO6gcdF_grWhEp0xZriQdKoj7ged5O05H4uAvc";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const PID = /^p\d{3,5}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const table = () => sb.schema("gateline").from("push_subscriptions");

  if (b.action === "register") {
    const endpoint = typeof b.endpoint === "string" ? b.endpoint : "";
    const personId = typeof b.personId === "string" && PID.test(b.personId) ? b.personId : "";
    const sub = b.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
    if (!endpoint.startsWith("https://") || !personId || sub?.endpoint !== endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return json({ error: "invalid subscription" }, 400);
    const { error } = await table().upsert({ endpoint, person_id: personId, subscription: sub, user_agent: typeof b.userAgent === "string" ? b.userAgent.slice(0, 200) : null, updated_at: new Date().toISOString() });
    return error ? json({ error: "save failed" }, 500) : json({ ok: true });
  }

  if (b.action === "unregister") {
    const endpoint = typeof b.endpoint === "string" ? b.endpoint : "";
    if (endpoint) await table().delete().eq("endpoint", endpoint);
    return json({ ok: true });
  }

  if (b.action === "notify") {
    const to = Array.isArray(b.to) ? b.to.filter((x): x is string => typeof x === "string" && PID.test(x)).slice(0, 60) : [];
    const title = typeof b.title === "string" ? b.title.slice(0, 80) : "";
    if (!to.length || !title) return json({ error: "missing fields" }, 400);
    const secret = Deno.env.get("VAPID_PRIVATE_KEY");
    if (!secret) return json({ sent: 0, reason: "phone alerts not configured" });
    webpush.setVapidDetails("mailto:support@1stglance.co", PUBLIC_KEY, secret);
    const { data } = await table().select("endpoint, subscription").in("person_id", to);
    const payload = JSON.stringify({
      title,
      body: typeof b.body === "string" ? b.body.slice(0, 200) : "",
      url: typeof b.url === "string" && b.url.startsWith("/") ? b.url.slice(0, 200) : "/",
      tag: typeof b.tag === "string" ? b.tag.slice(0, 60) : undefined,
    });
    let sent = 0;
    await Promise.all((data ?? []).map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, payload, { TTL: 3600, urgency: "high" });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await table().delete().eq("endpoint", row.endpoint);
      }
    }));
    return json({ sent });
  }
  return json({ error: "unknown action" }, 400);
});
