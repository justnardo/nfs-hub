"use client";
import * as React from "react";
import { LayoutGrid } from "lucide-react";
import { cn } from "@nfs/ui";

const HUB = process.env.NEXT_PUBLIC_NFS_HUB_HOME || "/hub";
const RAMPLINE = process.env.NEXT_PUBLIC_RAMPLINE_URL || "https://rampline-three.vercel.app";

/** The NFS Hub app switcher: hub home and Rampline. Hidden when neither address is set. */
export function HubSwitcher() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  if (!HUB && !RAMPLINE) return null;
  const item = "flex flex-col rounded-lg px-3 py-2 text-sm transition-colors hover:bg-brand-50 hover:text-brand-700";
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="NFS Hub apps"
        aria-expanded={open}
        title="NFS Hub apps"
        className={cn("grid size-9 cursor-pointer place-items-center rounded-lg transition-colors hover:bg-brand-50 hover:text-brand-700", open ? "bg-brand-50 text-brand-700" : "text-ink-700")}
      >
        <LayoutGrid className="size-[18px]" />
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-line bg-card p-1.5 shadow-lg">
          <p className="px-3 pt-1.5 pb-1 text-[10px] font-bold tracking-[0.14em] text-muted uppercase">NFS Hub</p>
          {HUB ? (
            <a className={item} href={HUB}><span className="font-semibold">Hub home</span><span className="text-xs text-muted">All NFS systems, live connection</span></a>
          ) : null}
          {RAMPLINE ? (
            <a className={item} href={RAMPLINE}><span className="font-semibold">Rampline</span><span className="text-xs text-muted">Ramp rostering and operations</span></a>
          ) : null}
          <span className={cn(item, "bg-brand-50 text-brand-700")}><span className="font-semibold">Gateline</span><span className="text-xs">Passenger services · you are here</span></span>
        </div>
      ) : null}
    </div>
  );
}
