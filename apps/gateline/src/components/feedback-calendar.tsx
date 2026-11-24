"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button, Card, cn } from "@nfs/ui";
import { formatDate, type FeedbackItem } from "@nfs/db";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const monthKey = (d: string) => d.slice(0, 7);
const shiftMonth = (m: string, by: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

/** Month calendar of feedback: a green dot for praise, red for complaints. Tap a day to see that day's feedback. */
export function FeedbackCalendar({
  items, today, minDate, selected, onSelect,
}: {
  items: FeedbackItem[];
  today: string;
  minDate: string;
  selected: string | null;
  onSelect: (d: string | null) => void;
}) {
  const [month, setMonth] = React.useState(monthKey(selected ?? today));
  const byDay = React.useMemo(() => {
    const m = new Map<string, { praise: number; complaint: number }>();
    for (const f of items) {
      const x = m.get(f.date) ?? { praise: 0, complaint: 0 };
      x[f.kind === "praise" ? "praise" : "complaint"]++;
      m.set(f.date, x);
    }
    return m;
  }, [items]);
  const [y, mo] = month.split("-").map(Number);
  const lead = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
  const daysIn = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)] as (string | null)[];
  const inMonth = items.filter((f) => monthKey(f.date) === month);
  const canBack = month > monthKey(minDate);
  const canFwd = month < monthKey(today);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="icon" aria-label="Previous month" disabled={!canBack} onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft /></Button>
        <div className="text-center">
          <p className="font-display text-sm font-semibold">{formatDate(`${month}-01`, { month: "long", year: "numeric" })}</p>
          <p className="text-[11px] text-muted">
            {inMonth.filter((f) => f.kind === "praise").length} praise · {inMonth.filter((f) => f.kind !== "praise").length} complaint{inMonth.filter((f) => f.kind !== "praise").length === 1 ? "" : "s"}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Next month" disabled={!canFwd} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight /></Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w, i) => <span key={i} className="pb-1 text-[10px] font-semibold text-muted">{w}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={`b${i}`} />;
          const c = byDay.get(d);
          const future = d > today;
          const on = selected === d;
          return (
            <button
              key={d}
              disabled={future}
              onClick={() => onSelect(on ? null : d)}
              aria-pressed={on}
              aria-label={`${formatDate(d)}${c ? `: ${c.praise} praise, ${c.complaint} complaints` : ""}`}
              className={cn(
                "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-xs tabular transition-colors",
                future ? "cursor-default text-ink-300" : "cursor-pointer hover:bg-brand-50 hover:text-brand-700",
                d === today && !on && "font-bold text-brand-700 ring-1 ring-brand-300",
                on && "bg-brand-500 font-semibold text-white hover:bg-brand-600 hover:text-white",
                c && !on && "font-semibold",
              )}
            >
              {Number(d.slice(8))}
              <span className="flex h-1.5 gap-0.5">
                {c?.praise ? <span className={cn("size-1.5 rounded-full", on ? "bg-white" : "bg-ok")} /> : null}
                {c?.complaint ? <span className={cn("size-1.5 rounded-full", on ? "bg-red-200" : "bg-bad")} /> : null}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-ok" /> Praise</span>
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-bad" /> Complaint</span>
        </span>
        {selected ? (
          <button onClick={() => onSelect(null)} className="inline-flex cursor-pointer items-center gap-0.5 font-semibold text-brand-700 transition-colors hover:text-brand-500"><X className="size-3" /> Show all dates</button>
        ) : <span>Tap a day to filter</span>}
      </div>
    </Card>
  );
}
