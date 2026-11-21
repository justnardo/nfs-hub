"use client";
import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@nfs/ui";
import { addDays, formatDate } from "@nfs/db";

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/**
 * Calendar popover for picking a day. Days outside [min, max] are disabled; `marks` adds a dot
 * (e.g. days with charters) and `counts` shows how many flights operate.
 */
export function DatePicker({
  value,
  onChange,
  min,
  max,
  today,
  marks,
  markLabel = "Charter",
  label,
}: {
  value: string;
  onChange: (d: string) => void;
  min?: string;
  max?: string;
  today: string;
  marks?: Set<string>;
  /** What a dot under a date means, shown in the calendar's footer. */
  markLabel?: string;
  label?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState(() => ({ y: Number(value.slice(0, 4)), m: Number(value.slice(5, 7)) - 1 }));
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open) setView({ y: Number(value.slice(0, 4)), m: Number(value.slice(5, 7)) - 1 });
  }, [open, value]);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const first = new Date(Date.UTC(view.y, view.m, 1));
  const lead = first.getUTCDay();
  const daysIn = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => ymd(view.y, view.m, i + 1))];
  while (cells.length % 7) cells.push(null);
  const monthStart = ymd(view.y, view.m, 1);
  const monthEnd = ymd(view.y, view.m, daysIn);
  const canPrev = !min || monthStart > min;
  const canNext = !max || monthEnd < max;
  const shift = (n: number) => setView((v) => {
    const m = v.m + n;
    return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
  });
  const pick = (d: string) => {
    onChange(d);
    setOpen(false);
  };
  const quick: [string, string][] = [["Yesterday", addDays(today, -1)], ["Today", today], ["Tomorrow", addDays(today, 1)]];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "inline-flex h-9 min-w-44 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors",
          open ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-card hover:border-brand-400 hover:text-brand-700",
        )}
      >
        <CalendarDays className="size-4 text-brand-600" />
        {label ?? formatDate(value, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
      </button>
      {open ? (
        <div role="dialog" aria-label="Choose a date" className="absolute right-0 top-11 z-40 w-[296px] rounded-xl border border-line bg-card p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" disabled={!canPrev} onClick={() => shift(-1)} aria-label="Previous month" className="grid size-8 cursor-pointer place-items-center rounded-lg text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-30">
              <ChevronLeft className="size-4" />
            </button>
            <span className="font-display text-sm font-semibold">{formatDate(monthStart, { month: "long", year: "numeric" })}</span>
            <button type="button" disabled={!canNext} onClick={() => shift(1)} aria-label="Next month" className="grid size-8 cursor-pointer place-items-center rounded-lg text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-30">
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-[10px] font-bold uppercase text-muted">
            {DOW.map((d) => <span key={d} className="py-1">{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (!d) return <span key={`x${i}`} />;
              const off = (min && d < min) || (max && d > max);
              const sel = d === value;
              const isToday = d === today;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={!!off}
                  onClick={() => pick(d)}
                  title={off ? "Outside the records held in this demo" : formatDate(d, { weekday: "long", day: "numeric", month: "long" })}
                  className={cn(
                    "relative h-9 cursor-pointer rounded-lg text-sm tabular transition-colors disabled:cursor-not-allowed disabled:text-ink-300",
                    sel ? "bg-brand-600 font-semibold text-white" : "hover:bg-brand-50 hover:text-brand-700",
                    !sel && isToday && "font-bold text-brand-700 ring-1 ring-inset ring-brand-400",
                    !sel && d < today && !off && "text-ink-700",
                  )}
                >
                  {Number(d.slice(8))}
                  {marks?.has(d) ? <span className={cn("absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full", sel ? "bg-white" : "bg-gold-500")} /> : null}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
            <div className="flex gap-1">
              {quick.map(([k, d]) => (
                <button
                  key={k}
                  type="button"
                  disabled={(!!min && d < min) || (!!max && d > max)}
                  onClick={() => pick(d)}
                  className="cursor-pointer rounded-md px-2 py-1 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 hover:text-brand-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {k}
                </button>
              ))}
            </div>
            {marks?.size ? <span className="flex items-center gap-1 text-[11px] text-muted"><span className="size-1.5 rounded-full bg-gold-500" /> {markLabel}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
