"use client";
import { flash } from "./flash";
import * as React from "react";

import { useRouter } from "next/navigation";
import { Accessibility, Bell, BellRing, DoorOpen, Luggage, Siren, Smartphone, Users, X } from "lucide-react";
import { Button, cn } from "@nfs/ui";
import { useHub } from "@/lib/store";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/remote";
import type { Notice } from "@/lib/advice";

const ICON: Record<Notice["kind"], React.ComponentType<{ className?: string }>> = { team: Users, gate: DoorOpen, ssr: Accessibility, offload: Luggage, inbound: Siren };

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Phone alert switch: asks permission and registers this device for the person signed in. */
export function PushToggle({ compact = false, onDone }: { compact?: boolean; onDone?: () => void }) {
  const hub = useHub();
  const [st, setSt] = React.useState<PushState | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    void pushState().then(setSt);
  }, []);
  if (!st || st === "unsupported") return compact ? null : <p className="text-xs text-muted">This browser can&apos;t show alerts.</p>;
  if (st === "needs-install") return <p className="text-xs text-muted">On iPhone, tap Share → Add to Home Screen, open Gateline from there, then turn on alerts.</p>;
  if (st === "denied") return <p className="text-xs text-muted">Alerts are blocked for this site. Allow notifications in the browser settings to turn them on.</p>;
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><Smartphone className="size-4 text-brand-600" /> Phone alerts {st === "on" ? "on" : "off"}</p>
        {!compact ? <p className="text-xs text-muted">Team assignments, gate changes and new assistance requests, even when Gateline is closed.</p> : null}
      </div>
      <Button
        size="sm"
        variant={st === "on" ? "outline" : "primary"}
        disabled={busy || !hub.session}
        onClick={async () => {
          setBusy(true);
          const brave = typeof navigator !== "undefined" && "brave" in navigator;
          try {
            if (st === "on") {
              await disablePush();
              setSt("off");
              flash({ title: "Phone alerts turned off", body: "You'll still see alerts here in Gateline while it's open." });
              onDone?.();
            } else {
              const next = await enablePush(hub.session!.personId);
              setSt(next);
              if (next === "on") {
                flash({ title: "Phone alerts turned on", body: "This phone will get team assignments, gate changes and assistance requests, even when Gateline is closed.", tone: "ok" });
                onDone?.();
              } else if (next === "denied") {
                flash({ title: "Alerts are blocked", body: "Notifications are blocked for this site. Allow them in your browser's site settings, then try again.", tone: "warn" }, 10000);
              } else {
                flash({ title: "Alerts weren't turned on", body: "Permission wasn't given, or the alert service couldn't be reached. Try again.", tone: "warn" }, 9000);
              }
            }
          } catch {
            flash({
              title: "This browser blocked phone alerts",
              body: brave
                ? "Brave blocks push alerts by default. In Brave settings → Privacy and security, turn on \"Use Google services for push messaging\", then try again. Or open Gateline in Chrome."
                : "The browser refused to set up alerts on this device. Try Chrome, or add Gateline to your home screen and try again.",
              tone: "warn",
            }, 14000);
          } finally {
            setBusy(false);
          }
        }}
      >
        {st === "on" ? "Turn off" : "Turn on"}
      </Button>
    </div>
  );
}

/** Bell with unread count, the alert list, and a toast when a new alert arrives while Gateline is open. */
export function NotificationBell() {
  const hub = useHub();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [toast, setToast] = React.useState<Notice | null>(null);
  const seen = React.useRef<Set<string> | null>(null);
  const box = React.useRef<HTMLDivElement>(null);
  const me = hub.session?.personId ?? "";

  // Toast for alerts that arrive after the page loaded
  React.useEffect(() => {
    const ids = new Set(hub.notices.map((n) => n.id));
    if (seen.current === null) {
      if (hub.synced) seen.current = ids;
      return;
    }
    const fresh = hub.notices.find((n) => !seen.current!.has(n.id) && !n.readBy.includes(me));
    seen.current = ids;
    if (fresh) {
      setToast(fresh);
      const t = setTimeout(() => setToast(null), 7000);
      return () => clearTimeout(t);
    }
  }, [hub.notices, hub.synced, me]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (n: Notice) => {
    hub.markRead([n.id]);
    setOpen(false);
    setToast(null);
    router.push(n.href);
  };

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn("relative grid size-9 cursor-pointer place-items-center rounded-lg transition-colors", open ? "bg-brand-50 text-brand-700" : "text-ink-700 hover:bg-brand-50 hover:text-brand-700")}
        aria-label={`Alerts${hub.unread ? `, ${hub.unread} unread` : ""}`}
      >
        {hub.unread ? <BellRing className="size-5" /> : <Bell className="size-5" />}
        {hub.unread ? <span className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-bad px-1 text-[10px] font-bold leading-[18px] text-white">{hub.unread > 9 ? "9+" : hub.unread}</span> : null}
      </button>

      {open ? (
        <div className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-xl border border-line bg-card shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[380px]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">Alerts</p>
            {hub.unread ? <button onClick={() => hub.markRead(hub.notices.map((n) => n.id))} className="cursor-pointer text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700">Mark all read</button> : null}
          </div>
          <ul className="max-h-[min(60vh,420px)] overflow-y-auto">
            {hub.notices.length === 0 ? <li className="px-4 py-8 text-center text-sm text-muted">No alerts yet. You&apos;ll see team assignments, gate changes and assistance requests here.</li> : null}
            {hub.notices.map((n) => {
              const Icon = ICON[n.kind];
              const unread = !n.readBy.includes(me);
              return (
                <li key={n.id}>
                  <button onClick={() => go(n)} className={cn("flex w-full cursor-pointer gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-50", unread && "bg-brand-50/40")}>
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", n.kind === "inbound" ? "bg-bad-soft text-red-700" : n.kind === "gate" ? "bg-gold-100 text-gold-700" : "bg-brand-100 text-brand-700")}><Icon className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><span className="truncate text-sm font-semibold">{n.title}</span>{unread ? <span className="size-2 shrink-0 rounded-full bg-brand-500" /> : null}</span>
                      <span className="block text-xs text-muted">{n.body}</span>
                      <span className="mt-0.5 block text-[11px] text-muted">{ago(n.at)} · {n.by}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-line bg-surface px-4 py-3"><PushToggle compact onDone={() => setOpen(false)} /></div>
        </div>
      ) : null}

      {toast && !open ? (
        <div role="status" className="fixed bottom-24 left-1/2 z-[70] w-[min(92vw,380px)] -translate-x-1/2 lg:bottom-6 lg:left-auto lg:right-6 lg:translate-x-0">
          <div className="flex items-start gap-3 rounded-xl border border-line bg-card p-3.5 shadow-2xl">
            {React.createElement(ICON[toast.kind], { className: "mt-0.5 size-5 shrink-0 text-brand-600" })}
            <button onClick={() => go(toast)} className="min-w-0 flex-1 cursor-pointer text-left">
              <p className="text-sm font-semibold">{toast.title}</p>
              <p className="text-xs text-muted">{toast.body}</p>
            </button>
            <button onClick={() => setToast(null)} className="cursor-pointer rounded p-0.5 text-muted transition-colors hover:text-brand-600" aria-label="Dismiss"><X className="size-4" /></button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

