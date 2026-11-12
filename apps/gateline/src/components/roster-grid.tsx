"use client";
import * as React from "react";
import { RotateCcw } from "lucide-react";
import { Avatar, cn } from "@nfs/ui";
import { formatDate, type Person, type ShiftCode } from "@nfs/db";
import { SHIFT_LABEL, cellFromDay, type CoverageContext } from "@nfs/rules";
import { LEVEL_STYLE, ShiftChip } from "./ops";

export function CellMenu({ current, manual, onPick, onRevert, onClose }: { current: ShiftCode; manual?: boolean; onPick: (s: ShiftCode) => void; onRevert?: () => void; onClose: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", h), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", h);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="absolute left-1/2 top-full z-30 mt-1 w-40 -translate-x-1/2 rounded-xl border border-line bg-card p-1.5 text-left shadow-xl">
      {(["E", "M", "L", "O", "V"] as ShiftCode[]).map((c) => (
        <button key={c} onClick={() => onPick(c)} className={cn("flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors hover:bg-brand-50 hover:text-brand-700", c === current && "bg-brand-50 text-brand-700")}>
          <ShiftChip shift={c} />
          {SHIFT_LABEL[c]}
        </button>
      ))}
      {manual && onRevert ? (
        <button onClick={onRevert} className="mt-1 flex w-full cursor-pointer items-center gap-2 border-t border-line px-2 pb-1 pt-2 text-xs font-semibold text-muted transition-colors hover:text-brand-700">
          <RotateCcw className="size-3.5" /> Back to plan
        </button>
      ) : null}
    </div>
  );
}

/** Simple roster table: staff × 7 days, optional coverage rows and editing. */
export function RosterGrid({
  members, days, shiftOf, ctx, airlineCode, today, editable, onPick, highlightId, changed,
}: {
  members: Person[];
  days: string[];
  shiftOf: (personId: string, date: string) => ShiftCode | undefined;
  ctx?: CoverageContext;
  airlineCode?: string;
  today?: string;
  editable?: boolean;
  onPick?: (personId: string, date: string, s: ShiftCode) => void;
  highlightId?: string | null;
  changed?: (personId: string, date: string) => boolean;
}) {
  const [menu, setMenu] = React.useState<string | null>(null);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-y-1 text-sm">
        <thead>
          <tr>
            <th className="pl-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">Staff</th>
            {days.map((d) => (
              <th key={d} className={cn("px-1 text-center text-[11px] font-semibold", d === today ? "text-brand-600" : "text-muted")}>{formatDate(d, { weekday: "short", day: "numeric" })}</th>
            ))}
            <th className="px-1 text-center text-[11px] font-semibold text-muted">Hrs</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const hours = days.filter((d) => ["E", "M", "L"].includes(shiftOf(m.id, d) ?? "")).length * 8;
            const mine = m.id === highlightId;
            return (
              <tr key={m.id} id={`row-${m.id}`} className="group">
                <td className={cn("rounded-l-lg py-1 pl-2 pr-3 transition-colors", mine ? "bg-gold-100" : "group-hover:bg-brand-50/60")}>
                  <div className="flex items-center gap-2">
                    <Avatar name={`${m.firstName} ${m.lastName}`} src={m.photoUrl} tone={m.role === "lead" ? "dark" : "brand"} className="size-7" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{m.firstName} {m.lastName}</p>
                      <p className="text-[11px] text-muted">{m.role === "lead" ? "Lead" : m.role === "supervisor" ? "Supervisor" : m.staffNo}</p>
                    </div>
                  </div>
                </td>
                {days.map((d) => {
                  const s = shiftOf(m.id, d) ?? "O";
                  const k = `${m.id}|${d}`;
                  const can = editable && (!today || d >= today);
                  const isChanged = changed?.(m.id, d);
                  return (
                    <td key={d} className={cn("relative px-1 py-1 text-center transition-colors", mine ? "bg-gold-100" : "group-hover:bg-brand-50/60")}>
                      <button
                        disabled={!can}
                        onClick={() => setMenu(menu === k ? null : k)}
                        title={`${SHIFT_LABEL[s]}${isChanged ? " · changed since published" : ""}`}
                        className={cn("relative inline-block rounded-md transition-shadow", can && "cursor-pointer hover:ring-2 hover:ring-brand-400")}
                      >
                        <ShiftChip shift={s} />
                        {isChanged ? <span className="absolute -left-1 -top-1 size-2 rounded-full border border-card bg-gold-400" /> : null}
                      </button>
                      {menu === k && onPick ? (
                        <CellMenu
                          current={s}
                          onPick={(c) => {
                            onPick(m.id, d, c);
                            setMenu(null);
                          }}
                          onClose={() => setMenu(null)}
                        />
                      ) : null}
                    </td>
                  );
                })}
                <td className={cn("rounded-r-lg px-1 text-center text-xs font-semibold tabular text-muted transition-colors", mine ? "bg-gold-100" : "group-hover:bg-brand-50/60")}>{hours}</td>
              </tr>
            );
          })}
          {ctx && airlineCode
            ? (["E", "L"] as const).map((s) => (
                <tr key={s}>
                  <td className="pl-2 pt-2 text-[11px] font-semibold uppercase text-muted">{SHIFT_LABEL[s]} vs SLA</td>
                  {days.map((d) => {
                    const c = cellFromDay(ctx.day(airlineCode, d), s, ctx);
                    return (
                      <td key={d} className="px-1 pt-2 text-center">
                        <span className={cn("inline-grid h-7 min-w-11 place-items-center rounded-md border px-1 text-[11px] font-bold tabular", LEVEL_STYLE[c.level])}>{c.level === "none" ? "·" : `${c.assigned}/${c.required}`}</span>
                      </td>
                    );
                  })}
                  <td />
                </tr>
              ))
            : null}
        </tbody>
      </table>
    </div>
  );
}
