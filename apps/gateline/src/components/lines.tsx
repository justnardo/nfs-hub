"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight, Copy, Download, FileSpreadsheet, Loader2, Plus, Rows3, Trash2 } from "lucide-react";
import { Badge, Button, Dialog, DialogContent, Input, Select, cn } from "@nfs/ui";
import { addDays, formatDate, weekStart, type Airline, type LineGroup, type Person, type RosterEntry, type RosterLine } from "@nfs/db";
import { entriesFromLines, lineAt, lineGroup, lineLabels, lineMembers, normaliseSpan, rosterSheet, standingLines, type SheetBlock } from "@nfs/rules";
import { useHub } from "@/lib/store";
import { cellTime, downloadRosterSheet, downloadRosterSheetXlsx, empNo, sheetName, weekHead } from "@/lib/sheet-pdf";
import { AirlineChip } from "./ops";

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const GROUPS: { key: LineGroup | undefined; label: string }[] = [{ key: undefined, label: "Agents" }, { key: "supervisor", label: "Supervisors" }, { key: "lead", label: "Leads" }];
/** Heading over the names: the airline's own, else its name without "Airlines"/"Airways" ("BREEZE", "AIR CANADA"). */
export const sheetHeading = (a: Airline) => a.sheetLabel || a.name.replace(/\s+(air\s*lines|airlines|airways)$/i, "").toUpperCase();

/** Everyone on an airline's printed roster: agents and leads, plus supervisors on its lines. */
export function useLineMembers(airline: Airline | undefined): Person[] {
  const hub = useHub();
  return React.useMemo(() => (airline ? lineMembers(airline, hub.ds.people, hub.ds.airlines) : []), [airline, hub.ds.people, hub.ds.airlines]);
}

/** Sundays of a month: the weeks a monthly roster sheet covers. */
function monthWeeks(month: string): string[] {
  const out: string[] = [];
  for (let d = weekStart(`${month}-01`); d.slice(0, 7) <= month; d = addDays(d, 7)) if (d.slice(0, 7) === month) out.push(d);
  return out;
}

/** The airline's roster sheet: lines for line-rostered airlines, otherwise worked out from the roster. */
export function useRosterSheet(airline: Airline | undefined, members: Person[], weeks: string[]): SheetBlock[] {
  const hub = useHub();
  return React.useMemo(() => {
    if (!airline || !members.length || !weeks.length) return [];
    let entryOf: (pid: string, d: string) => Pick<RosterEntry, "shift" | "time"> | undefined;
    if (airline.lines?.length) {
      // The issued roster is the lines themselves, not today's swaps and leave
      const idx = new Map(entriesFromLines(airline, members, weeks).map((e) => [`${e.personId}|${e.date}`, e]));
      entryOf = (pid, d) => idx.get(`${pid}|${d}`);
    } else {
      const idx = new Map(hub.ds.roster.map((e) => [`${e.personId}|${e.date}`, e]));
      entryOf = (pid, d) => idx.get(`${pid}|${d}`);
    }
    return rosterSheet(airline, members, weeks, entryOf);
  }, [airline, members, weeks, hub.ds.roster]);
}

export function SheetTable({ airline, block }: { airline: Airline; block: SheetBlock }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[760px] border-collapse text-center text-[12px] tabular-nums">
        <thead>
          <tr className="bg-brand-600 text-[11px] font-bold text-white">
            <th className="w-8 border border-brand-700 px-1 py-1.5" />
            {DAYS.map((d) => <th key={d} className="border border-brand-700 px-1 py-1.5">{d}</th>)}
            <th className="border border-brand-700 px-2 py-1.5 text-left">{sheetHeading(airline)}</th>
            <th className="border border-brand-700 px-1 py-1.5">EMP#</th>
            {block.weekStarts.map((w) => <th key={w} className="border border-brand-700 px-1 py-1.5">{weekHead(w)}</th>)}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((r) => (
            <tr key={r.person.id}>
              <td className="border border-line px-1 py-1.5 font-bold">{r.label}</td>
              {r.days.map((t, i) => <td key={i} className={cn("border border-line px-1 py-1.5", t ? "font-semibold" : "bg-surface text-ink-400")}>{cellTime(t)}</td>)}
              <td className="whitespace-nowrap border border-line px-2 py-1.5 text-left font-semibold">{sheetName(r.person.firstName, r.person.lastName)}</td>
              <td className="border border-line px-1 py-1.5">{empNo(r.person.staffNo)}</td>
              {r.weeks.map((l, i) => <td key={i} className="border border-line bg-brand-50 px-1 py-1.5 font-bold text-brand-800">{l}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Preview and PDF of the roster sheet, in the layout agents already get. */
export function RosterSheetDialog({ airline, initialWeek, onClose }: { airline: Airline; members?: Person[]; initialWeek: string; onClose: () => void }) {
  const hub = useHub();
  const members = useLineMembers(airline);
  const [month, setMonth] = React.useState(initialWeek.slice(0, 7));
  const [busy, setBusy] = React.useState(false);
  const minMonth = hub.ds.windowStart.slice(0, 7);
  const maxMonth = hub.ds.horizonEnd.slice(0, 7);
  const known = (w: string) => w >= hub.ds.windowStart && w <= hub.ds.horizonEnd;
  const weeks = monthWeeks(month).filter((w) => !!airline.lines?.length || (known(w) && w <= hub.ds.windowDays[hub.ds.windowDays.length - 1]));
  const blocks = useRosterSheet(airline, members, weeks);
  const shift = (n: number) => {
    const d = new Date(`${month}-15T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  const period = `${formatDate(`${month}-01`, { month: "long", year: "numeric" })} · weeks of ${weeks.map(weekHead).join(", ")}`;
  const notice = Number(hub.rules["change-notice"].params.hours) || 48;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-5xl"
        title={`${airline.name} roster sheet`}
        description={airline.lines?.length ? "The roster as agents receive it: each line's week, who is on it, and their line each week." : "Worked out from the roster: each distinct week becomes a line. Set up lines for this airline to fix them."}
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" disabled={month <= minMonth} onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft /></Button>
              <span className="min-w-32 text-center text-sm font-semibold">{formatDate(`${month}-01`, { month: "long", year: "numeric" })}</span>
              <Button variant="outline" size="icon" disabled={month >= maxMonth} onClick={() => shift(1)} aria-label="Next month"><ChevronRight /></Button>
            </div>
            <span className="flex-1" />
            <Button variant="outline" className="h-11 sm:h-9" onClick={onClose}>Close</Button>
            <Button variant="outline" className="h-11 sm:h-9" disabled={!blocks.length} onClick={() => void downloadRosterSheetXlsx({ airlineName: airline.name, sheetLabel: sheetHeading(airline), blocks, noticeHours: notice, filename: `NFS-${airline.code}-roster-${month}.xlsx` })}><FileSpreadsheet /> Excel</Button>
            <Button
              className="h-11 sm:h-9"
              disabled={!blocks.length || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await downloadRosterSheet({ airlineName: airline.name, sheetLabel: sheetHeading(airline), airlineLogo: airline.logoUrl, blocks, period, noticeHours: notice, filename: `NFS-${airline.code}-roster-${month}.pdf`, generatedBy: hub.session?.name });
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Download />} Download PDF
            </Button>
          </div>
        }
      >
        <div className="mb-3 flex items-center gap-2">
          <AirlineChip airline={airline} size="lg" />
          <div>
            <p className="font-display text-base font-semibold">{airline.name.toUpperCase()}</p>
            <p className="text-xs text-muted">{period}</p>
          </div>
        </div>
        {blocks.length === 0 ? <p className="rounded-lg bg-surface p-4 text-sm text-muted">No roster for this month yet.</p> : null}
        <div className="space-y-4">
          {blocks.map((b, i) => <SheetTable key={i} airline={airline} block={b} />)}
        </div>
        {blocks.length ? <p className="mt-4 rounded bg-[#ffec99] px-3 py-1.5 text-[11px] font-bold text-red-700">NOTE: ROSTERED SHIFTS SUBJECT TO CHANGE WITH A MINIMUM {notice} HOURS NOTICE BY VERBAL OR WRITTEN COMMUNICATION</p> : null}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Line editor ---------------- */

const blankWeek = (): (string | null)[] => [null, null, null, null, null, null, null];

/** Set up and edit an airline's lines, and who is on which line each week. */
export function LinesDialog({ airline, week, onClose }: { airline: Airline; members?: Person[]; week: string; onClose: () => void }) {
  const hub = useHub();
  const teamMembers = useLineMembers(airline);
  const terminalSups = hub.ds.people.filter((p) => p.role === "supervisor" && p.active !== false && p.homeTerminal === airline.terminal);
  const [lines, setLines] = React.useState<RosterLine[]>(() => airline.lines?.map((l) => ({ ...l, days: [...l.days] })) ?? []);
  const [assign, setAssign] = React.useState<Record<string, string>>(() => Object.fromEntries(standingLines(airline, teamMembers)));
  const [label, setLabel] = React.useState(airline.sheetLabel ?? "");
  const [weeksMap, setWeeksMap] = React.useState<Record<string, Record<string, string>>>(() => structuredClone(airline.lineWeeks ?? {}));
  const [tab, setTab] = React.useState<"lines" | "people">(airline.lines?.length ? "people" : "lines");
  const [bad, setBad] = React.useState<string | null>(null);
  const weeks = [0, 1, 2, 3, 4].map((n) => addDays(weekStart(week), n * 7));
  const labels = lineLabels(lines);
  // Supervisors shown: those on the lines now (or about to be), when there are supervisor lines
  const hasSupLines = lines.some((l) => l.group === "supervisor");
  const supIds = Object.keys(assign).filter((id) => terminalSups.some((p) => p.id === id));
  const members = [...teamMembers.filter((p) => p.role !== "supervisor"), ...(hasSupLines ? terminalSups.filter((p) => supIds.includes(p.id) || teamMembers.some((m) => m.id === p.id)) : [])];

  // Start from the roster as it stands this week: each distinct week becomes a line
  const derive = () => {
    const idx = new Map(hub.ds.roster.map((e) => [`${e.personId}|${e.date}`, e]));
    const blocks = rosterSheet({ ...airline, lines: [] }, members, [weekStart(week)], (pid, d) => idx.get(`${pid}|${d}`));
    const seen = new Map<string, RosterLine>();
    const a: Record<string, string> = {};
    for (const b of blocks) for (const r of b.rows) {
      const group = r.person.role === "lead" ? ("lead" as const) : undefined;
      const k = `${group ?? ""}${r.label}`;
      if (!seen.has(k)) seen.set(k, { label: r.label, group, days: r.days.map((t) => (t ? normaliseSpan(t) : null)) });
      a[r.person.id] = r.label;
    }
    setLines([...seen.values()].sort((x, y) => (x.group ?? "").localeCompare(y.group ?? "") || x.label.localeCompare(y.label)));
    setAssign(a);
  };

  const setDay = (i: number, d: number, v: string) => {
    const t = v.trim().toUpperCase();
    const next = [...lines];
    if (!t || t === "OFF" || t === "O") next[i] = { ...next[i], days: next[i].days.map((x, j) => (j === d ? null : x)) };
    else {
      const n = normaliseSpan(t);
      if (!n) {
        setBad(`${next[i].label} ${DAYS[d]}: use a time like 0700-1500, or OFF`);
        return;
      }
      next[i] = { ...next[i], days: next[i].days.map((x, j) => (j === d ? n : x)) };
    }
    setBad(null);
    setLines(next);
  };
  const addLine = (group?: LineGroup) => {
    const inGroup = lines.filter((l) => (l.group ?? undefined) === group);
    const nextLabel = String.fromCharCode(65 + lineLabels(lines, group).length);
    const copy = inGroup.length ? [...inGroup[inGroup.length - 1].days] : group ? ["09:00-17:00", "09:00-17:00", "09:00-17:00", "09:00-17:00", "09:00-17:00", null, null] : blankWeek();
    setLines([...lines, { label: nextLabel, ...(group ? { group } : {}), days: copy }]);
  };
  // A new version of a line from a given week: the old one stops the day before
  const splitFrom = (i: number, from: string) => {
    const l = lines[i];
    const next = [...lines];
    next[i] = { ...l, to: addDays(from, -1) };
    next.splice(i + 1, 0, { label: l.label, from, to: l.to, days: [...l.days] });
    setLines(next);
  };
  const save = () => {
    hub.saveAirline({ ...airline, lines, lineAssign: assign, lineWeeks: weeksMap, sheetLabel: label.trim() || undefined });
    onClose();
  };
  const pick = (pid: string, ws: string, v: string) => {
    const next = structuredClone(weeksMap);
    if (!v || v === assign[pid]) {
      if (next[ws]) delete next[ws][pid];
    } else next[ws] = { ...(next[ws] ?? {}), [pid]: v };
    setWeeksMap(next);
  };
  const off = (l: RosterLine) => l.days.filter((x) => !x).length;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-5xl"
        title={`${airline.name} lines`}
        description="Each line is a fixed week of shift times. Put each agent on a line; change a week when someone moves. Gateline builds the roster, coverage and the printed sheet from these."
        footer={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" className="h-11 sm:h-9" onClick={onClose}>Cancel</Button>
            <Button className="h-11 sm:h-9" disabled={!lines.length || !!bad} onClick={save}>Save lines</Button>
          </div>
        }
      >
        <div className="mb-4 inline-flex rounded-lg border border-line bg-card p-1">
          {(["lines", "people"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} disabled={t === "people" && !lines.length} className={cn("cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40", tab === t ? "bg-brand-600 text-white" : "text-muted enabled:hover:bg-brand-50 enabled:hover:text-brand-700")}>
              {t === "lines" ? `Lines (${labels.length})` : "Who's on which line"}
            </button>
          ))}
        </div>

        {tab === "lines" ? (
          <>
            {!lines.length ? (
              <div className="rounded-xl border border-dashed border-brand-200 bg-brand-50/50 p-5 text-center">
                <Rows3 className="mx-auto size-6 text-brand-600" />
                <p className="mt-2 text-sm font-semibold">{airline.name} isn&apos;t on lines yet</p>
                <p className="mt-1 text-xs text-muted">Start from this week&apos;s roster (each distinct week becomes a line), or add lines by hand.</p>
                <div className="mt-3 flex justify-center gap-2">
                  <Button variant="outline" onClick={derive}><Copy /> Start from this week</Button>
                  <Button onClick={() => addLine()}><Plus /> Add a line</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {GROUPS.map((g) => {
                  const idxs = lines.map((l, i) => ({ l, i })).filter(({ l }) => (l.group ?? undefined) === g.key);
                  if (!idxs.length && g.key) return (
                    <Button key={g.label} variant="outline" size="sm" onClick={() => addLine(g.key)}><Plus /> Add {g.key === "lead" ? "lead" : "supervisor"} lines</Button>
                  );
                  if (!idxs.length) return null;
                  return (
                    <div key={g.label}>
                      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-700">{g.label}</p>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[820px] border-separate border-spacing-y-1 text-center text-xs">
                          <thead>
                            <tr className="text-[10px] font-bold uppercase text-muted">
                              <th className="w-10">Line</th>
                              {DAYS.map((d) => <th key={d}>{d}</th>)}
                              <th className="text-left">Runs</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {idxs.map(({ l, i }) => (
                              <tr key={`${l.group ?? ""}-${l.label}-${l.from ?? ""}-${i}`}>
                                <td><span className={cn("grid size-8 place-items-center rounded-lg font-display text-sm font-bold text-white", g.key === "lead" ? "bg-brand-600" : g.key === "supervisor" ? "bg-gold-500 text-ink-900" : "bg-ink-800")}>{l.label}</span></td>
                                {l.days.map((t, d) => (
                                  <td key={d} className="px-0.5">
                                    <Input
                                      defaultValue={t ? t.replace(/:/g, "") : "OFF"}
                                      onBlur={(e) => setDay(i, d, e.target.value)}
                                      aria-label={`${g.label} line ${l.label} ${DAYS[d]}`}
                                      className={cn("h-9 px-1 text-center text-xs tabular-nums", !t && "bg-surface text-ink-400")}
                                    />
                                  </td>
                                ))}
                                <td className="whitespace-nowrap px-2 text-left text-[11px] text-muted">
                                  {l.from || l.to ? `${l.from ? `from ${formatDate(l.from, { day: "numeric", month: "short" })}` : ""}${l.from && l.to ? " " : ""}${l.to ? `to ${formatDate(l.to, { day: "numeric", month: "short" })}` : ""}` : "every week"}
                                  <span className="block">{7 - off(l)} shifts · {(7 - off(l)) * 8}h</span>
                                </td>
                                <td className="whitespace-nowrap">
                                  {!l.to ? (
                                    <Select aria-label={`Change line ${l.label} from a week`} value="" onChange={(e) => e.target.value && splitFrom(i, e.target.value)} className="h-8 w-auto text-[11px]">
                                      <option value="">Change from…</option>
                                      {weeks.slice(1).filter((w) => !l.from || w > l.from).map((w) => <option key={w} value={w}>{formatDate(w, { day: "numeric", month: "short" })}</option>)}
                                    </Select>
                                  ) : null}
                                  <Button variant="ghost" size="icon" aria-label={`Remove line ${l.label}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <Button variant="outline" size="sm" className="mt-1" onClick={() => addLine(g.key)}><Plus /> Add {g.key === "lead" ? "a lead" : g.key === "supervisor" ? "a supervisor" : "an agent"} line</Button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <span className="text-xs font-semibold">Heading over names on the printed roster</span>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={airline.name.split(" ")[0].toUpperCase()} className="h-9 w-40" />
            </div>
            {bad ? <p className="mt-2 text-xs font-semibold text-bad">{bad}</p> : <p className="mt-2 text-[11px] text-muted">Type times like 0700-1500, or OFF. Leads and supervisors can have lines of their own, lettered from A, as on the printed roster. To change a line part-way through the month, use “Change from…”.</p>}
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-separate border-spacing-y-1 text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase text-muted">
                  <th className="text-left">Staff</th>
                  <th>Usual line</th>
                  {weeks.map((w) => <th key={w}>{weekHead(w)}</th>)}
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((p) => {
                  const g = lineGroup(lines, p);
                  const opts = lineLabels(lines, g);
                  return (
                    <tr key={p.id}>
                      <td className="py-1 pr-3">
                        <p className="font-semibold">{p.firstName} {p.lastName}</p>
                        <p className="text-[11px] text-muted">{p.role === "lead" ? "Lead" : p.role === "supervisor" ? "Supervisor" : "Agent"} · {empNo(p.staffNo)}{g ? ` · ${g} lines` : ""}</p>
                      </td>
                      <td className="px-1 text-center">
                        <Select value={assign[p.id] ?? ""} onChange={(e) => setAssign({ ...assign, [p.id]: e.target.value })} className="h-9 w-20 font-bold" aria-label={`${p.firstName}'s usual line`}>
                          {opts.map((l) => <option key={l}>{l}</option>)}
                        </Select>
                      </td>
                      {weeks.map((w) => {
                        const v = weeksMap[w]?.[p.id] ?? assign[p.id] ?? "";
                        const moved = !!weeksMap[w]?.[p.id] && weeksMap[w][p.id] !== assign[p.id];
                        const line = v ? lineAt(lines, v, w, g) : undefined;
                        return (
                          <td key={w} className="px-1 text-center">
                            <Select value={v} onChange={(e) => pick(p.id, w, e.target.value)} title={line ? line.days.map((t, i) => `${DAYS[i]} ${t ?? "OFF"}`).join(" · ") : ""} className={cn("h-9 w-20", moved && "border-gold-400 bg-gold-100 font-bold")} aria-label={`${p.firstName} week of ${weekHead(w)}`}>
                              {opts.map((l) => <option key={l}>{l}</option>)}
                            </Select>
                          </td>
                        );
                      })}
                      <td>
                        {p.role === "supervisor" ? (
                          <Button variant="ghost" size="icon" aria-label={`Take ${p.firstName} off the lines`} onClick={() => { const next = { ...assign }; delete next[p.id]; setAssign(next); }}><Trash2 className="size-4" /></Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {hasSupLines ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold">Put a supervisor on these lines</span>
                <Select value="" onChange={(e) => e.target.value && setAssign({ ...assign, [e.target.value]: lineLabels(lines, "supervisor")[0] })} className="h-9 w-auto">
                  <option value="">Choose…</option>
                  {terminalSups.filter((p) => !members.some((m) => m.id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                </Select>
              </div>
            ) : null}
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted"><Badge tone="warn">Gold</Badge> a week someone is moved off their usual line.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
