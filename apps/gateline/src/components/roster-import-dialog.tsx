"use client";
import * as React from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Badge, Button, Dialog, DialogContent, Select, cn } from "@nfs/ui";
import { formatDate, type Airline, type LineGroup, type Person } from "@nfs/db";
import { useHub } from "@/lib/store";
import { guessAirline, guessGroup, linesFromImport, matchPerson, readRosterFile, type ImportedSheet } from "@/lib/roster-import";
import { cellTime, empNo, weekHead } from "@/lib/sheet-pdf";
import { AirlineChip } from "./ops";

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const SECTION: { v: string; label: string }[] = [{ v: "", label: "Agents" }, { v: "supervisor", label: "Supervisors" }, { v: "lead", label: "Leads" }];

/** Import a roster spreadsheet in NFS's line layout, check who matched, then apply it as the airline's lines. */
export function RosterImportDialog({ airline: initial, onClose }: { airline?: Airline; onClose: () => void }) {
  const hub = useHub();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [sheets, setSheets] = React.useState<ImportedSheet[]>([]);
  const [si, setSi] = React.useState(0);
  const [code, setCode] = React.useState(initial?.code ?? "");
  const [groups, setGroups] = React.useState<(LineGroup | undefined)[]>([]);
  const [picks, setPicks] = React.useState<Record<string, string>>({}); // "block|row" → personId or "" (skip)
  const [done, setDone] = React.useState(false);
  const sheet = sheets[si];
  const airlines = hub.ds.airlines.filter((a) => !a.charter);
  const airline = hub.ds.airlines.find((a) => a.code === code);

  const team = React.useMemo(() => hub.ds.people.filter((p) => p.active !== false && (p.role === "agent" || p.role === "lead") && p.coreAirline === code), [hub.ds.people, code]);
  const sups = React.useMemo(() => hub.ds.people.filter((p) => p.active !== false && p.role === "supervisor" && (!airline || p.homeTerminal === airline.terminal)), [hub.ds.people, airline]);
  const pool = React.useMemo(() => [...team, ...sups], [team, sups]);

  const load = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const parsed = await readRosterFile(f, hub.today);
      setFileName(f.name);
      setSheets(parsed);
      setSi(0);
      if (!parsed[0]?.blocks.length) setError(parsed[0]?.warnings[0] ?? "No roster found in this file.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  };

  // When the sheet changes: guess the airline, the sections and the people
  React.useEffect(() => {
    if (!sheet) return;
    const a = initial && sheets.length === 1 ? initial : guessAirline(sheet, airlines) ?? initial;
    if (a) setCode(a.code);
  }, [sheet]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!sheet) return;
    const everyone = hub.ds.people.filter((p) => p.active !== false);
    const local = (r: Parameters<typeof matchPerson>[0]) => matchPerson(r, pool) ?? matchPerson(r, everyone);
    setGroups(sheet.blocks.map((b) => guessGroup(b.rows, local)));
    const next: Record<string, string> = {};
    sheet.blocks.forEach((b, bi) => b.rows.forEach((r, ri) => { next[`${bi}|${ri}`] = local(r)?.id ?? ""; }));
    setPicks(next);
  }, [sheet, pool]); // eslint-disable-line react-hooks/exhaustive-deps

  const result = React.useMemo(() => (sheet ? linesFromImport(sheet.blocks, groups, (bi, ri) => picks[`${bi}|${ri}`] || undefined) : null), [sheet, groups, picks]);
  const matched = [...new Set(Object.values(picks).filter(Boolean))];
  const unmatched = Object.values(picks).filter((v) => !v).length;
  const missing = team.filter((p) => !matched.includes(p.id));
  const wrongTeam = matched.map((id) => hub.people.get(id)).filter((p): p is Person => !!p && p.role !== "supervisor" && p.coreAirline !== code);
  // Someone in a section that doesn't match their role wouldn't find their line (an agent in the Leads section)
  const wrongSection = sheet ? sheet.blocks.flatMap((b, bi) => b.rows.map((_, ri) => hub.people.get(picks[`${bi}|${ri}`] ?? "")).filter((p): p is Person => !!p && (groups[bi] === "supervisor" ? p.role !== "supervisor" : groups[bi] === "lead" ? p.role !== "lead" : p.role === "supervisor"))) : [];

  const apply = () => {
    if (!airline || !result) return;
    // Team members not in the file keep their current line if it still exists
    const keep: Record<string, string> = {};
    for (const p of missing) {
      const cur = airline.lineAssign?.[p.id];
      if (cur && result.lines.some((l) => l.label === cur)) keep[p.id] = cur;
    }
    hub.saveAirline({ ...airline, lines: result.lines, lineAssign: { ...keep, ...result.lineAssign }, lineWeeks: result.lineWeeks, sheetLabel: sheet.nameHeader || airline.sheetLabel });
    setDone(true);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-5xl"
        title="Import a roster from Excel"
        description="Upload the roster file in the usual layout: SUN to SAT, the names, EMP# and a column per week. Gateline reads the lines and who is on them; check the matches, then apply."
        footer={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button variant="outline" className="h-11 sm:h-9" onClick={onClose}>{done ? "Close" : "Cancel"}</Button>
            {!done ? <Button className="h-11 sm:h-9" disabled={!airline || !result?.lines.length || !matched.length} onClick={apply}>Apply to {airline?.name ?? "airline"}</Button> : null}
          </div>
        }
      >
        {done && airline ? (
          <div className="rounded-xl border border-green-200 bg-ok-soft p-5 text-center">
            <CheckCircle2 className="mx-auto size-8 text-ok" />
            <p className="mt-2 font-semibold">{airline.name} is now rostered from {fileName}</p>
            <p className="mt-1 text-sm text-muted">{result?.lines.length} lines · {matched.length} people. The roster, coverage and the printed sheet use them straight away. Change anything under Lines.</p>
          </div>
        ) : (
          <>
            <input ref={fileRef} type="file" accept=".xlsx,.csv,.xls" className="hidden" onChange={(e) => void load(e.target.files?.[0])} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); void load(e.dataTransfer.files?.[0]); }}
              className="flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/50 p-5 text-center transition-colors hover:border-brand-400 hover:bg-brand-50"
            >
              {busy ? <Loader2 className="size-6 animate-spin text-brand-600" /> : fileName ? <FileSpreadsheet className="size-6 text-brand-600" /> : <Upload className="size-6 text-brand-600" />}
              <span className="text-sm font-semibold">{fileName || "Choose or drop the roster file"}</span>
              <span className="text-xs text-muted">{fileName ? "Choose another file" : "Excel .xlsx or .csv"}</span>
            </button>
            {error ? <p className="mt-3 flex items-start gap-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-red-800"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}</p> : null}

            {sheet?.blocks.length ? (
              <>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {sheets.length > 1 ? (
                    <Select value={String(si)} onChange={(e) => setSi(Number(e.target.value))} aria-label="Sheet" className="h-10">
                      {sheets.map((s, i) => <option key={i} value={i}>{s.sheet}</option>)}
                    </Select>
                  ) : null}
                  <span className="text-sm">for</span>
                  <Select value={code} onChange={(e) => setCode(e.target.value)} aria-label="Airline" className="h-10">
                    <option value="">Choose the airline…</option>
                    {airlines.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
                  </Select>
                  {airline ? <AirlineChip airline={airline} /> : null}
                  <span className="text-xs text-muted">Heading on the sheet: <b>{sheet.nameHeader || "—"}</b></span>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone="brand">{result?.lines.length ?? 0} lines</Badge>
                  <Badge tone="ok">{matched.length} matched</Badge>
                  {unmatched ? <Badge tone="warn">{unmatched} not matched (skipped)</Badge> : null}
                  {missing.length ? <Badge tone="neutral">{missing.length} on the team but not in the file</Badge> : null}
                  {result?.weeks.length ? <Badge tone="neutral">Weeks {weekHead(result.weeks[0])} – {weekHead(result.weeks[result.weeks.length - 1])}</Badge> : null}
                </div>
                {[...sheet.warnings, ...(result?.renamed ?? [])].length ? (
                  <ul className="mt-2 space-y-0.5 text-xs text-amber-800">{[...sheet.warnings, ...(result?.renamed ?? [])].slice(0, 6).map((w) => <li key={w}>• {w}</li>)}</ul>
                ) : null}
                {wrongTeam.length ? <p className="mt-2 text-xs text-amber-800">• {wrongTeam.map((p) => `${p.firstName} ${p.lastName}`).join(", ")} {wrongTeam.length > 1 ? "aren't" : "isn't"} on {airline?.name}&apos;s team; add them under Team first or they won&apos;t be rostered from these lines.</p> : null}
                {wrongSection.length ? <p className="mt-2 text-xs text-amber-800">• {[...new Set(wrongSection.map((p) => `${p.firstName} ${p.lastName} (${p.role})`))].join(", ")} {wrongSection.length > 1 ? "are" : "is"} in a section that doesn&apos;t match their role. Change the section, or their role under Agents, so they get the right line.</p> : null}
                {missing.length ? <p className="mt-1 text-xs text-muted">Not in the file: {missing.map((p) => `${p.firstName} ${p.lastName}`).join(", ")}. They keep their current line if it still exists.</p> : null}

                <div className="mt-4 space-y-4">
                  {sheet.blocks.map((b, bi) => (
                    <div key={bi} className="rounded-xl border border-line">
                      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
                        <span className="text-xs font-semibold">Section</span>
                        <Select value={groups[bi] ?? ""} onChange={(e) => setGroups(groups.map((g, i) => (i === bi ? ((e.target.value || undefined) as LineGroup | undefined) : g)))} className="h-8 w-auto text-xs" aria-label={`Section for block ${bi + 1}`}>
                          {SECTION.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                        </Select>
                        <span className="text-xs text-muted">weeks of {b.weekStarts.map((w) => formatDate(w, { day: "numeric", month: "short" })).join(", ")}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[900px] border-collapse text-center text-[12px] tabular-nums">
                          <thead>
                            <tr className="text-[10px] font-bold text-muted">
                              <th className="w-8 px-1 py-1.5" />
                              {DAYS.map((d) => <th key={d} className="px-1 py-1.5">{d}</th>)}
                              <th className="px-2 py-1.5 text-left">IN THE FILE</th>
                              <th className="px-2 py-1.5 text-left">GATELINE STAFF</th>
                              {b.weekStarts.map((w) => <th key={w} className="px-1 py-1.5">{weekHead(w)}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {b.rows.map((r, ri) => {
                              const k = `${bi}|${ri}`;
                              const pid = picks[k] ?? "";
                              const options = groups[bi] === "supervisor" ? sups : team;
                              return (
                                <tr key={ri} className="border-t border-line">
                                  <td className="px-1 py-1.5 font-bold">{r.label}</td>
                                  {r.days.map((t, i) => <td key={i} className={cn("px-1 py-1.5", !t && "text-ink-400")}>{cellTime(t)}</td>)}
                                  <td className="whitespace-nowrap px-2 py-1.5 text-left"><span className="font-semibold">{r.name}</span> <span className="text-muted">· {r.emp || "no EMP#"}</span></td>
                                  <td className="px-2 py-1">
                                    <Select value={pid} onChange={(e) => setPicks({ ...picks, [k]: e.target.value })} className={cn("h-8 w-48 text-xs", pid ? "border-green-300 bg-ok-soft/60" : "border-amber-300 bg-warn-soft/60")} aria-label={`Match ${r.name}`}>
                                      <option value="">Skip this row</option>
                                      {(pid && !options.some((p) => p.id === pid) ? [hub.people.get(pid)!, ...options] : options).filter(Boolean).map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName} · {empNo(p.staffNo)}</option>)}
                                    </Select>
                                  </td>
                                  {r.weeks.map((w, i) => <td key={i} className="bg-brand-50 px-1 py-1.5 font-bold text-brand-800">{w}</td>)}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
