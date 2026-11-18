"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@nfs/ui";
import { addDays, formatDate } from "@nfs/db";

export type WeekState = "past" | "now" | "published" | "draft" | "rostered" | "none";
export const WEEK_STATE: Record<WeekState, { label: string; dot: string }> = {
  past: { label: "History", dot: "bg-ink-300" },
  now: { label: "This week", dot: "bg-brand-500" },
  published: { label: "Published", dot: "bg-ok" },
  draft: { label: "Draft", dot: "bg-gold-500" },
  rostered: { label: "Rostered", dot: "bg-brand-400" },
  none: { label: "Not rostered", dot: "bg-transparent ring-1 ring-ink-300" },
};

/** A scrollable row of weeks with what state each is in: pick one to view it. */
export function WeekStrip({ weeks, value, onChange, today }: { weeks: { ws: string; state: WeekState; note?: string }[]; value: string; onChange: (ws: string) => void; today: string }) {
  const box = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    box.current?.querySelector<HTMLElement>(`[data-ws="${value}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [value]);
  const i = weeks.findIndex((w) => w.ws === value);
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" disabled={i <= 0} onClick={() => onChange(weeks[i - 1].ws)} aria-label="Previous week" className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-line bg-card text-ink-700 transition-colors hover:border-brand-400 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="size-4" /></button>
      <div ref={box} className="nav-scroll flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5">
        {weeks.map((w) => {
          const on = w.ws === value;
          const isNow = today >= w.ws && today <= addDays(w.ws, 6);
          const st = WEEK_STATE[w.state];
          return (
            <button
              key={w.ws}
              type="button"
              data-ws={w.ws}
              onClick={() => onChange(w.ws)}
              title={w.note}
              className={cn(
                "min-w-[118px] shrink-0 cursor-pointer rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                on ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-line bg-card hover:border-brand-400 hover:bg-brand-50/60",
              )}
            >
              <span className={cn("block text-xs font-semibold tabular", on ? "text-brand-800" : "text-ink-900")}>{formatDate(w.ws, { day: "numeric", month: "short" })} – {formatDate(addDays(w.ws, 6), { day: "numeric", month: "short" })}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] font-medium text-muted">
                <span className={cn("size-1.5 rounded-full", st.dot)} />
                {isNow ? `This week · ${st.label.toLowerCase()}` : st.label}
              </span>
            </button>
          );
        })}
      </div>
      <button type="button" disabled={i >= weeks.length - 1} onClick={() => onChange(weeks[i + 1].ws)} aria-label="Next week" className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-line bg-card text-ink-700 transition-colors hover:border-brand-400 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="size-4" /></button>
    </div>
  );
}
