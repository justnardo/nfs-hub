"use client";
import * as React from "react";
import { cn } from "@nfs/ui";
import { NfsMark } from "./brand";

const STEPS = [
  { at: 0, text: "Connecting to the NFS Hub" },
  { at: 30, text: "Loading today’s flights" },
  { at: 58, text: "Building rosters" },
  { at: 80, text: "Checking SLA coverage" },
  { at: 100, text: "Ready for departure" },
];

/**
 * First-load screen: a plane crosses a dotted flight path while the status line says what is
 * really happening. Shown only for as long as loading takes. The plane moves with transforms only,
 * so it stays smooth while the browser is busy building the day.
 */
export function SiteLoader({ progress, offline, leaving }: { progress: number; offline?: boolean; leaving?: boolean }) {
  const pct = Math.max(4, Math.min(100, progress));
  const step = [...STEPS].reverse().find((s) => pct >= s.at) ?? STEPS[0];
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={offline ? "Slow connection" : step.text}
      className={cn("gl-loader fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-ink-900 text-white transition-opacity duration-500", leaving && "pointer-events-none opacity-0")}
    >
      {/* soft runway glow */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[-30%] h-[70%] bg-[radial-gradient(ellipse_at_center,rgba(14,154,167,0.22),transparent_65%)]" />
      <div aria-hidden className="gl-stars pointer-events-none absolute inset-0 opacity-40" />

      <div className="relative flex w-[min(86vw,420px)] flex-col items-center">
        {/* Flight path */}
        <div className="relative h-[150px] w-[400px] shrink-0 scale-[0.8] min-[480px]:scale-100">
          <svg viewBox="0 0 400 150" className="absolute inset-0 h-full w-full" aria-hidden>
            <path d="M20 140 A190 190 0 0 1 380 140" fill="none" stroke="rgba(255,200,45,0.22)" strokeWidth="2" strokeDasharray="2 9" strokeLinecap="round" />
            <path d="M20 140 A190 190 0 0 1 380 140" fill="none" stroke="#FFC82D" strokeWidth="2.5" strokeLinecap="round" pathLength={100} strokeDasharray={`${pct} 100`} className="transition-[stroke-dasharray] duration-700 ease-out" />
            <circle cx="20" cy="140" r="5" fill="#0E9AA7" />
            <circle cx="380" cy="140" r="5" fill={pct >= 100 ? "#FFC82D" : "rgba(255,255,255,0.25)"} className="transition-colors duration-500" />
          </svg>
          {/* plane on a pivot at the arc's centre: rotating the arm flies it along the curve */}
          <div aria-hidden className="gl-arm absolute left-1/2 top-[13px] h-[190px] w-0 origin-bottom" style={{ transformOrigin: "50% 100%" }}>
            <svg viewBox="0 0 24 24" className="gl-plane absolute -left-[13px] -top-[13px] size-[26px] drop-shadow-[0_0_10px_rgba(255,200,45,0.55)]">
              <path fill="#FFC82D" d="M21.5 11.2 14 9.6 10.4 3.2a.9.9 0 0 0-.8-.5h-.9l1.6 6.5-4.7-.9-1.5-2.4H3.3l.8 4.1-.8 4.1h.8l1.5-2.4 4.7-.9-1.6 6.5h.9a.9.9 0 0 0 .8-.5L14 14.4l7.5-1.6a.8.8 0 0 0 0-1.6Z" />
            </svg>
          </div>
          <span className="absolute left-[20px] top-[154px] -translate-x-1/2 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-200/70">Check-in</span>
          <span className="absolute left-[380px] top-[154px] -translate-x-1/2 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-200/70">Departed</span>
        </div>

        <div className="mt-10 flex items-center gap-3">
          <NfsMark dark className="h-11 w-14" />
          <div className="leading-tight">
            <div className="font-display text-[26px] font-semibold tracking-tight">Gateline</div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-200/80">Nassau Flight Services</div>
          </div>
        </div>

        <p key={offline ? "off" : step.text} className="gl-step mt-7 h-5 text-sm font-medium text-ink-300">
          {offline ? "Slow connection · opening with what’s on this device" : `${step.text}${pct >= 100 ? "" : "…"}`}
        </p>
        <div className="mt-3 h-1 w-40 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-gold-400 transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

/**
 * Real progress for the first load: page shell → day built → shared state synced.
 * Gives up waiting for the network after a few seconds and opens offline instead.
 */
export function useFirstLoad(ready: boolean, synced: boolean) {
  const [shown, setShown] = React.useState(true);
  const [leaving, setLeaving] = React.useState(false);
  const [timedOut, setTimedOut] = React.useState(false);
  const [mountedAt] = React.useState(() => (typeof performance !== "undefined" ? performance.now() : 0));
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 4000);
    const i = setInterval(() => setTick((n) => n + 1), 250);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, []);
  const done = ready && (synced || timedOut);
  // Creep forward while waiting so the plane never looks stuck, but only real milestones pass them
  const elapsed = (typeof performance !== "undefined" ? performance.now() : 0) - mountedAt;
  const creep = Math.min(22, elapsed / 140);
  const progress = done ? 100 : ready ? 62 + Math.min(16, tick * 1.5) : 8 + creep;
  React.useEffect(() => {
    if (!done || leaving) return;
    const a = setTimeout(() => setLeaving(true), 380); // let the plane land
    const b = setTimeout(() => setShown(false), 900);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  return { shown, leaving, progress, offline: timedOut && !synced && ready };
}
