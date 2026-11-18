"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CalendarRange, CornerDownLeft, FileText, Plane, PlaneTakeoff, Search, UserRound, X } from "lucide-react";
import { Avatar, cn } from "@nfs/ui";
import { ROLE_LABEL, can, type Permission } from "@nfs/auth";
import { addDays, formatDate } from "@nfs/db";
import { useHub, personName } from "@/lib/store";
import { teamLabel } from "@/lib/periods";
import { AirlineChip } from "./ops";

export type SearchPage = { href: string; label: string; perm?: Permission };

type Kind = "page" | "person" | "airline" | "flight" | "date" | "roster";
type Result = { id: string; kind: Kind; title: string; sub?: string; href: string; score: number; icon?: React.ReactNode };

const KIND_LABEL: Record<Kind, string> = { date: "Dates", flight: "Flights", person: "Staff", airline: "Airlines", roster: "Rosters", page: "Pages" };
const ORDER: Kind[] = ["date", "flight", "person", "airline", "roster", "page"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const compact = (s: string) => norm(s).replace(/[\s-]/g, "");

const bonus = (s: number, n: number) => (s > 0 ? Math.max(1, s + n) : 0);

/** 0 = no match; higher is better. Whole-string prefix beats word prefix beats substring. */
function scoreText(q: string, text: string): number {
  const t = norm(text);
  if (!q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.split(/[\s·(),/-]+/).some((w) => w.startsWith(q))) return 60;
  if (q.length >= 3 && compact(text).includes(q.replace(/[\s-]/g, ""))) return 40;
  return 0;
}

/** Understands "today", "yesterday", "tomorrow", "12 nov", "nov 12", "12/11", "2026-11-12", weekday names. */
function parseDate(raw: string, today: string): string | null {
  const q = norm(raw);
  if (!q) return null;
  if (q === "today") return today;
  if (q === "yesterday") return addDays(today, -1);
  if (q === "tomorrow") return addDays(today, 1);
  let m = q.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  const year = Number(today.slice(0, 4));
  const build = (d: number, mo: number) => {
    if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
    let s = `${year}-${pad(mo + 1)}-${pad(d)}`;
    if (s > addDays(today, 180)) s = `${year - 1}-${pad(mo + 1)}-${pad(d)}`;
    if (s < addDays(today, -185)) s = `${year + 1}-${pad(mo + 1)}-${pad(d)}`;
    return s;
  };
  m = q.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]{3,})$/);
  if (m) {
    const mo = MONTHS.findIndex((x) => m![2].startsWith(x));
    return mo >= 0 ? build(+m[1], mo) : null;
  }
  m = q.match(/^([a-z]{3,}) (\d{1,2})(?:st|nd|rd|th)?$/);
  if (m) {
    const mo = MONTHS.findIndex((x) => m![1].startsWith(x));
    return mo >= 0 ? build(+m[2], mo) : null;
  }
  m = q.match(/^(\d{1,2})\/(\d{1,2})$/); // day/month, as written in The Bahamas
  if (m) return build(+m[1], +m[2] - 1);
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const wd = q.length >= 3 ? days.findIndex((d) => d.startsWith(q.replace(/^(last|next) /, ""))) : -1;
  if (wd >= 0) {
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
    if (q.startsWith("next ")) return addDays(today, ((wd - dow + 7) % 7) || 7);
    return addDays(today, -(((dow - wd + 7) % 7) || 7)); // most recent past one
  }
  return null;
}

export function GlobalSearch({ pages, variant = "bar" }: { pages: SearchPage[]; variant?: "bar" | "icon" }) {
  const hub = useHub();
  const router = useRouter();
  const role = hub.session?.role;
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [mobile, setMobile] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const deferred = React.useDeferredValue(q);

  // ⌘K / Ctrl+K or "/" focuses search from anywhere
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      const mine = variant === "icon" ? window.innerWidth < 768 : window.innerWidth >= 768; // only one copy answers
      if (mine && (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !typing))) {
        e.preventDefault();
        if (variant === "icon") setMobile(true);
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant]);
  React.useEffect(() => {
    if (!open || variant === "icon") return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, variant]);

  const airlineBy = React.useMemo(() => new Map(hub.ds.airlines.map((a) => [a.code, a])), [hub.ds.airlines]);
  const results = React.useMemo<Result[]>(() => {
    const query = norm(deferred);
    if (!query) return [];
    const out: Result[] = [];
    const staff = can(role, "staff.view");
    const min = hub.ds.windowStart;
    const max = hub.ds.horizonEnd;

    const d = staff ? parseDate(query, hub.today) : null;
    if (d && d >= min && d <= max) {
      const n = hub.ds.flights.filter((f) => f.date === d).length;
      out.push({ id: `date-${d}`, kind: "date", title: `Flights on ${formatDate(d, { weekday: "long", day: "numeric", month: "long" })}`, sub: `${n} departures${d < hub.today ? " · gate records" : ""}`, href: `/flights?date=${d}`, score: 200, icon: <CalendarDays className="size-4" /> });
    }

    if (staff) {
      // Flights: one result per flight number, pointing at the next time it operates (or the last, if none ahead)
      const byNo = new Map<string, typeof hub.ds.flights>();
      for (const f of hub.ds.flights) byNo.set(f.flightNo, [...(byNo.get(f.flightNo) ?? []), f]);
      for (const [no, list] of byNo) {
        const f0 = list[0];
        const air = airlineBy.get(f0.airline);
        const s = Math.max(bonus(scoreText(query, no), 20), scoreText(query, `${f0.destinationName} ${f0.destination}`), f0.adhoc ? scoreText(query, f0.adhoc.operator) : 0, air && !air.charter ? bonus(scoreText(query, air.name), -30) : 0);
        if (s <= 0) continue;
        const next = list.find((f) => f.date >= hub.today) ?? list[list.length - 1];
        const when = next.date === hub.today ? "Today" : formatDate(next.date);
        out.push({
          id: `f-${no}`,
          kind: "flight",
          title: `${no} · ${f0.destinationName}`,
          sub: `${f0.adhoc ? `Charter · ${f0.adhoc.operator} · ` : ""}${when} · STD ${next.std} · Gate ${next.gate}`,
          href: `/flights?date=${next.date}&focus=${next.id}`,
          score: s,
          icon: air ? <AirlineChip airline={air} /> : <PlaneTakeoff className="size-4" />,
        });
      }
      for (const p of hub.ds.people) {
        if (p.active === false) continue;
        const name = personName(p);
        const s = Math.max(scoreText(query, name), scoreText(query, p.lastName), bonus(scoreText(query, p.staffNo), 10), scoreText(query, p.staffNo.replace("NFS-", "")));
        if (s <= 0) continue;
        const team = p.coreAirline ? airlineBy.get(p.coreAirline)?.name : p.role === "agent" ? "Float pool" : null;
        out.push({ id: `p-${p.id}`, kind: "person", title: name, sub: `${p.staffNo} · ${ROLE_LABEL[p.role]}${team ? ` · ${team}` : ""}`, href: `/agents/${p.id}`, score: s, icon: <Avatar name={name} src={p.photoUrl} className="size-6 text-[10px]" /> });
      }
      for (const a of hub.ds.airlines) {
        const s = Math.max(scoreText(query, a.name), bonus(scoreText(query, a.code), 10));
        if (s > 0) out.push({ id: `a-${a.code}`, kind: "airline", title: a.name, sub: a.charter ? "Charter and ad-hoc flights" : `${a.code} · ${a.terminal === "US" ? "US Departures" : "International"} · SLA and core team`, href: `/airlines/${a.code}`, score: s, icon: <AirlineChip airline={a} /> });
      }
    }
    if (can(role, "roster.view")) {
      for (const p of hub.periods) {
        const label = `${p.teams.map((t) => teamLabel(t, hub.ds.airlines)).join(", ")} roster`;
        const s = Math.max(scoreText(query, label), bonus(scoreText(query, "roster"), -20));
        if (s > 0) out.push({ id: `r-${p.id}`, kind: "roster", title: label, sub: `${p.status === "draft" ? "Draft" : "Published"} · ${p.weeks} week${p.weeks > 1 ? "s" : ""} from ${formatDate(p.start)}`, href: `/rosters/periods/${p.id}`, score: s, icon: <CalendarRange className="size-4" /> });
      }
    }
    for (const pg of pages) {
      if (pg.perm && !can(role, pg.perm)) continue;
      const s = scoreText(query, pg.label);
      if (s > 0) out.push({ id: `pg-${pg.href}`, kind: "page", title: pg.label, sub: "Go to page", href: pg.href, score: s, icon: <FileText className="size-4" /> });
    }

    const grouped: Result[] = [];
    for (const k of ORDER) grouped.push(...out.filter((r) => r.kind === k).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, k === "person" || k === "flight" ? 5 : 4));
    // Strong matches first across groups, keeping groups together
    const best = new Map<Kind, number>();
    for (const r of grouped) best.set(r.kind, Math.max(best.get(r.kind) ?? 0, r.score));
    return grouped.sort((a, b) => (a.kind === b.kind ? 0 : (best.get(b.kind) ?? 0) - (best.get(a.kind) ?? 0) || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)));
  }, [deferred, role, hub.ds, hub.today, hub.periods, pages, airlineBy]);

  React.useEffect(() => setActive(0), [deferred]);

  const go = (r: Result) => {
    router.push(r.href);
    setQ("");
    setOpen(false);
    setMobile(false);
    inputRef.current?.blur();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setMobile(false);
      inputRef.current?.blur();
    }
  };

  const panel = open && q.trim() ? (
    <div className={cn("overflow-hidden rounded-xl border border-line bg-card shadow-xl", variant === "bar" ? "absolute left-0 right-0 top-11 z-50" : "mt-2")}>
      {results.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted">No matches for “{q.trim()}”. Try a name, staff ID, flight number, airline or a date like “12 Nov”.</p>
      ) : (
        <ul role="listbox" className="max-h-[min(70vh,440px)] overflow-y-auto py-1.5">
          {results.map((r, i) => (
            <React.Fragment key={r.id}>
              {i === 0 || results[i - 1].kind !== r.kind ? <li className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{KIND_LABEL[r.kind]}</li> : null}
              <li role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(r)}
                  className={cn("flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left transition-colors", i === active ? "bg-brand-50 text-brand-800" : "hover:bg-brand-50/60")}
                >
                  <span className="grid w-9 shrink-0 place-items-center text-brand-600">{r.icon ?? <Plane className="size-4" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{r.title}</span>
                    {r.sub ? <span className="block truncate text-xs text-muted">{r.sub}</span> : null}
                  </span>
                  {i === active ? <CornerDownLeft className="size-3.5 shrink-0 text-brand-500" /> : null}
                </button>
              </li>
            </React.Fragment>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[11px] text-muted">
        <span>↑ ↓ to move · Enter to open · Esc to close</span>
        <span className="hidden sm:inline">⌘K or / to search</span>
      </div>
    </div>
  ) : null;

  const input = (
    <div className="relative flex items-center">
      <Search className="pointer-events-none absolute left-3 size-4 text-muted" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={can(role, "staff.view") ? "Search staff, flights, airlines, dates…" : "Search pages…"}
        aria-label="Search Gateline"
        aria-expanded={open && !!q.trim()}
        role="combobox"
        aria-autocomplete="list"
        className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-16 text-sm outline-none transition-colors placeholder:text-muted hover:border-brand-300 focus:border-brand-500 focus:bg-card focus:ring-2 focus:ring-brand-500/15"
      />
      {q ? (
        <button type="button" onClick={() => { setQ(""); inputRef.current?.focus(); }} className="absolute right-2 cursor-pointer rounded p-1 text-muted transition-colors hover:text-brand-600" aria-label="Clear search"><X className="size-3.5" /></button>
      ) : (
        <kbd className="pointer-events-none absolute right-2 rounded border border-line bg-card px-1.5 py-0.5 font-sans text-[10px] font-semibold text-muted">⌘K</kbd>
      )}
    </div>
  );

  if (variant === "icon") {
    return (
      <>
        <button onClick={() => { setMobile(true); setOpen(true); requestAnimationFrame(() => inputRef.current?.focus()); }} className="cursor-pointer rounded-lg p-2 text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-700" aria-label="Search"><Search className="size-5" /></button>
        {mobile ? (
          <div className="fixed inset-0 z-[60] bg-ink-900/40 backdrop-blur-[2px]" onClick={() => { setMobile(false); setOpen(false); }}>
            <div className="bg-card p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2">
                <div className="flex-1">{input}</div>
                <button onClick={() => { setMobile(false); setOpen(false); }} className="cursor-pointer rounded-lg px-2 py-1.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50">Cancel</button>
              </div>
              {panel}
            </div>
          </div>
        ) : null}
      </>
    );
  }
  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      {input}
      {panel}
    </div>
  );
}
