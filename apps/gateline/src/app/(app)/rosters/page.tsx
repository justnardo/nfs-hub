"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, Download, FileText, History, Loader2, Lock, Settings2, Sparkles, Users, XCircle } from "lucide-react";
import { Avatar, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, Label, PageHeader, Select, Textarea, cn } from "@nfs/ui";
import { ROLE_LABEL, can } from "@nfs/auth";
import { addDays, formatDate, rangeDays, shiftDemand, weekStart, type Person, type ShiftCode } from "@nfs/db";
import {
  CoverageContext, RULE_META, SHIFT_LABEL, SHIFT_TIMES, cellFromDay, check, eligibleFor, fairnessHistory, optimiseWeek,
  staffingOutlook, weekPatterns, type CellEdit, type CoverageCell, type Violation,
} from "@nfs/rules";
import { useHub, useEngineInput, personName } from "@/lib/store";
import { RequirePerm } from "@/components/guard";
import { AirlineChip, LEVEL_STYLE, PersonLink, ReassignDialog, ShiftChip } from "@/components/ops";
import { CoverageTimeline } from "@/components/timeline";
import { CellMenu } from "@/components/roster-grid";
import { allTeams, buildPeriod, periodEnd, rosterSections, teamLabel, teamMembers, type TeamKey } from "@/lib/periods";
import { downloadRosterPdf } from "@/lib/pdf";

export default function RostersPage() {
  return (
    <RequirePerm perm="roster.view">
      <Rosters />
    </RequirePerm>
  );
}

function Rosters() {
  const hub = useHub();
  const input = useEngineInput();
  const editable = can(hub.session?.role, "roster.edit");
  const assign = can(hub.session?.role, "staff.assign");
  const [team, setTeam] = React.useState<TeamKey>(hub.me?.coreAirline ?? "UA");
  const [ws, setWs] = React.useState(() => weekStart(hub.today));
  const [createOpen, setCreateOpen] = React.useState(false);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  React.useEffect(() => {
    // Deep links from roster periods: /rosters?team=UA&week=2026-11-23
    const q = new URLSearchParams(window.location.search);
    if (q.get("team")) setTeam(q.get("team")!);
    if (q.get("week")) setWs(weekStart(q.get("week")!));
  }, []);
  const maxWs = weekStart(hub.ds.horizonEnd);
  const [menu, setMenu] = React.useState<{ personId: string; date: string } | null>(null);
  const [gapCell, setGapCell] = React.useState<CoverageCell | null>(null);
  const [optOpen, setOptOpen] = React.useState(false);
  const [teamOpen, setTeamOpen] = React.useState(false);
  const days = rangeDays(ws, 7);
  const [day, setDay] = React.useState(() => (days.includes(hub.today) ? hub.today : days[0]));
  React.useEffect(() => setDay((d) => (days.includes(d) ? d : days.includes(hub.today) ? hub.today : days[0])), [ws]); // eslint-disable-line react-hooks/exhaustive-deps

  const airline = hub.ds.airlines.find((a) => a.code === team);
  const members = teamMembers(hub.ds.people, team);
  const memberIds = members.map((m) => m.id);
  const ctx = React.useMemo(() => new CoverageContext(input), [input]);
  const violations = React.useMemo(
    () => check(input, { from: ws, days: 7, personIds: memberIds, airlines: airline ? [airline.code] : [], rules: hub.rules, edits: hub.rosterEdits }, ctx),
    [input, ws, memberIds.join(","), airline?.code, hub.rules, hub.rosterEdits, ctx], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const byCell = new Map<string, Violation[]>();
  const byPerson = new Map<string, Violation[]>();
  for (const v of violations) {
    if (!v.personId) continue;
    const k = `${v.personId}|${v.date}`;
    if (days.includes(v.date) && v.date !== ws) byCell.set(k, [...(byCell.get(k) ?? []), v]);
    else byPerson.set(v.personId, [...(byPerson.get(v.personId) ?? []), v]);
  }
  const outlook = airline ? staffingOutlook(input, airline.code, ws, hub.rules, ctx) : null;
  const cells = airline ? days.flatMap((d) => (["E", "L"] as const).map((s) => cellFromDay(ctx.day(airline.code, d), s, ctx))) : [];
  const gaps = cells.filter((c) => (c.level === "red" || c.level === "amber") && c.date >= hub.today);
  const covers = hub.reassignments.filter((r) => days.includes(r.date));
  const manual = [...hub.overrides.values()].filter((o) => memberIds.includes(o.personId) && days.includes(o.date));

  const unrostered = members.length > 0 && members.every((m) => days.every((d) => ctx.shift(m.id, d) === undefined));
  const periodsHere = hub.periods.filter((p) => p.teams.includes(team) && (editable || p.status === "published")).sort((a, b) => b.start.localeCompare(a.start));
  const livePeriod = hub.periods.filter((p) => p.status === "published" && p.teams.includes(team) && p.start <= ws && periodEnd(p) >= ws).sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))[0];
  const recent = hub.audit.filter((e) => e.teams?.includes(team) && e.action !== "undo").slice(0, 6);

  const exportPdf = async () => {
    setPdfBusy(true);
    try {
      await downloadRosterPdf({
        title: `${teamLabel(team, hub.ds.airlines)} · Passenger Service roster`,
        subtitle: `Week of ${formatDate(ws, { day: "numeric", month: "long", year: "numeric" })}`,
        status: "live",
        meta: [livePeriod?.publishedBy ? `Published by ${livePeriod.publishedBy.name}` : "Engine roster with live changes", `Printed by ${hub.session?.name ?? ""}`],
        sections: rosterSections(input, [team], ws, 1),
        filename: `NFS-roster-${team}-${ws}.pdf`,
      });
    } finally {
      setPdfBusy(false);
    }
  };

  const ruleSummary = RULE_META.filter((m) => hub.rules[m.id].enabled).map((m) => ({ m, list: violations.filter((v) => v.ruleId === m.id) }));
  const hard = violations.filter((v) => v.severity === "hard").length;

  const exportCsv = () => {
    const rows = [["Staff no", "Name", "Role", ...days.map((d) => formatDate(d))]];
    for (const m of members) rows.push([m.staffNo, personName(m), m.role, ...days.map((d) => ctx.shift(m.id, d) ?? "")]);
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `gateline-roster-${team}-${ws}.csv`;
    a.click();
  };

  return (
    <>
      <PageHeader
        eyebrow="Roster engine"
        title="Rosters"
        description="Airline-specific rosters built by the engine against SLA demand and the union rules. Managers can change any cell — rules re-check instantly — or let the engine optimise the week."
        actions={
          <>
            <Select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
              {hub.ds.airlines.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
              <option value="POOL">Float pool</option>
              <option value="SUP-US">Supervisors · US</option>
              <option value="SUP-INTL">Supervisors · International</option>
            </Select>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" disabled={ws <= hub.ds.windowStart} onClick={() => setWs(addDays(ws, -7))} aria-label="Previous week"><ChevronLeft /></Button>
              <span className="min-w-36 text-center text-sm font-semibold">{formatDate(ws, { day: "numeric", month: "short" })} – {formatDate(addDays(ws, 6), { day: "numeric", month: "short" })}</span>
              <Button variant="outline" size="icon" disabled={ws >= maxWs} onClick={() => setWs(addDays(ws, 7))} aria-label="Next week"><ChevronRight /></Button>
            </div>
            {assign && airline ? <Button variant="outline" onClick={() => setTeamOpen(true)}><Users /> Team</Button> : null}
            <Button variant="outline" onClick={exportPdf} disabled={pdfBusy || unrostered}>{pdfBusy ? <Loader2 className="animate-spin" /> : <FileText />} PDF</Button>
            <Button variant="outline" onClick={exportCsv} disabled={unrostered}><Download /> CSV</Button>
            {editable && addDays(ws, 6) >= hub.today && !unrostered ? <Button variant="outline" onClick={() => setOptOpen(true)}><Sparkles /> Optimise week</Button> : null}
            {editable ? <Button onClick={() => setCreateOpen(true)}><CalendarPlus /> Create roster</Button> : null}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">{airline ? <AirlineChip airline={airline} size="md" /> : team === "POOL" ? "Float pool" : team === "SUP-US" ? "Supervisors · US Departures" : "Supervisors · International"}</CardTitle>
                <CardDescription>
                  {members.filter((m) => m.role === "lead").length} leads · {members.filter((m) => m.role === "agent").length} agents · E {SHIFT_TIMES.E.start}–{SHIFT_TIMES.E.end} · M {SHIFT_TIMES.M.start}–{SHIFT_TIMES.M.end} · L {SHIFT_TIMES.L.start}–{SHIFT_TIMES.L.end}
                  {manual.length ? ` · ${manual.length} hand change${manual.length > 1 ? "s" : ""}` : ""}
                  {livePeriod ? ` · published ${formatDate(livePeriod.publishedAt!.slice(0, 10), { day: "numeric", month: "short" })} by ${livePeriod.publishedBy?.name}` : ""}
                </CardDescription>
              </div>
              <Badge tone={hard ? "bad" : "ok"}>{hard ? `${hard} to fix` : "Rules clear"}</Badge>
            </CardHeader>
            <CardContent className="overflow-x-auto px-2 sm:px-5">
              {unrostered ? (
                <div className="grid place-items-center gap-3 rounded-xl border border-dashed border-line px-6 py-12 text-center">
                  <CalendarPlus className="size-8 text-brand-500" />
                  <div>
                    <p className="font-semibold">This week isn&apos;t rostered yet</p>
                    <p className="mt-1 text-sm text-muted">Flights are scheduled, so the engine can build it against SLA demand and the rules.</p>
                  </div>
                  {editable ? <Button onClick={() => setCreateOpen(true)}><CalendarPlus /> Create roster</Button> : <p className="text-xs text-muted">Your supervisor will publish it.</p>}
                </div>
              ) : (
              <table className="w-full border-separate border-spacing-y-1 text-sm">
                <thead>
                  <tr>
                    <th className="pl-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">Staff</th>
                    {days.map((d) => (
                      <th key={d} className={cn("px-1 text-center text-[11px] font-semibold", d === hub.today ? "text-brand-600" : "text-muted")}>{formatDate(d, { weekday: "short", day: "numeric" })}</th>
                    ))}
                    <th className="px-1 text-center text-[11px] font-semibold text-muted">Hrs</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const hours = days.filter((d) => ["E", "M", "L"].includes(ctx.shift(m.id, d) ?? "")).length * 8;
                    const notCurrent = airline && m.role === "agent" ? !eligibleFor(m, airline, ws).ok : false;
                    const rowV = byPerson.get(m.id) ?? [];
                    return (
                      <tr key={m.id} className="group">
                        <td className="rounded-l-lg py-1 pl-2 pr-3 transition-colors group-hover:bg-brand-50/60">
                          <div className="flex items-center gap-2">
                            <Avatar name={personName(m)} src={m.photoUrl} tone={m.role === "lead" ? "dark" : "brand"} className="size-7" />
                            <div className="min-w-0">
                              <PersonLink p={m} />
                              <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
                                {m.role === "lead" ? "Lead" : m.role === "supervisor" ? "Supervisor" : m.staffNo}
                                {notCurrent ? <Badge tone="bad">training expired</Badge> : null}
                                {rowV.length ? <span title={rowV.map((v) => v.message).join("\n")} className="inline-flex items-center gap-0.5 text-amber-700"><AlertTriangle className="size-3" />{rowV.length}</span> : null}
                              </div>
                            </div>
                          </div>
                        </td>
                        {days.map((d) => {
                          const s = ctx.shift(m.id, d) ?? "O";
                          const k = `${m.id}|${d}`;
                          const v = byCell.get(k) ?? [];
                          const worst = v.some((x) => x.severity === "hard") ? "hard" : v.length ? "soft" : null;
                          const moved = covers.find((c) => c.personId === m.id && c.date === d);
                          const isManual = hub.overrides.has(k);
                          const ov = hub.overrides.get(k);
                          const past = d < hub.today;
                          return (
                            <td key={d} className="relative px-1 py-1 text-center transition-colors group-hover:bg-brand-50/60">
                              <button
                                disabled={!editable || past}
                                onClick={() => setMenu(menu?.personId === m.id && menu.date === d ? null : { personId: m.id, date: d })}
                                title={[`${SHIFT_LABEL[s]}${ov ? ` · changed by ${ov.by}${ov.byRole ? ` (${ROLE_LABEL[ov.byRole as keyof typeof ROLE_LABEL]})` : ""} on ${new Date(ov.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}`, ...v.map((x) => x.message)].join("\n")}
                                className={cn(
                                  "relative inline-block rounded-md transition-shadow",
                                  editable && !past && "cursor-pointer hover:ring-2 hover:ring-brand-400",
                                  worst === "hard" && "ring-2 ring-bad",
                                  worst === "soft" && "ring-2 ring-amber-400",
                                )}
                              >
                                <ShiftChip shift={s} />
                                {isManual ? <span className="absolute -left-1 -top-1 size-2 rounded-full border border-card bg-gold-400" /> : null}
                                {moved ? <span className="absolute -right-1.5 -top-1.5 rounded bg-brand-500 px-1 text-[8.5px] font-bold text-white">{moved.toAirline}</span> : null}
                              </button>
                              {menu?.personId === m.id && menu.date === d ? (
                                <CellMenu
                                  current={s}
                                  manual={isManual}
                                  onPick={(code) => {
                                    hub.setCells([{ personId: m.id, date: d, shift: code }]);
                                    setMenu(null);
                                  }}
                                  onRevert={() => {
                                    hub.revertCells([{ personId: m.id, date: d }]);
                                    setMenu(null);
                                  }}
                                  onClose={() => setMenu(null)}
                                />
                              ) : null}
                            </td>
                          );
                        })}
                        <td className={cn("rounded-r-lg px-1 text-center text-xs font-semibold tabular transition-colors group-hover:bg-brand-50/60", hours > hub.rules["weekly-hours-max"].params.hours ? "text-bad" : "text-muted")}>{hours}</td>
                      </tr>
                    );
                  })}
                  {airline
                    ? (["E", "L"] as const).map((s) => (
                        <tr key={s}>
                          <td className="pl-2 pt-2 text-[11px] font-semibold uppercase text-muted">{SHIFT_LABEL[s]} vs SLA</td>
                          {days.map((d) => {
                            const c = cells.find((x) => x.date === d && x.shift === s)!;
                            return (
                              <td key={d} className="px-1 pt-2 text-center">
                                <button
                                  disabled={c.level === "none"}
                                  onClick={() => {
                                    setDay(d);
                                    if (c.level !== "green") setGapCell(c);
                                  }}
                                  className={cn("inline-grid h-7 min-w-11 place-items-center rounded-md border px-1 text-[11px] font-bold tabular transition-colors", LEVEL_STYLE[c.level], c.level !== "none" && "cursor-pointer")}
                                >
                                  {c.level === "none" ? "·" : `${c.assigned}/${c.required}`}
                                </button>
                              </td>
                            );
                          })}
                          <td />
                        </tr>
                      ))
                    : null}
                </tbody>
              </table>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-4 px-2 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-gold-400" /> Changed by hand (hover to see who; the engine keeps it when optimising)</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded ring-2 ring-bad" /> Breaks a rule</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded ring-2 ring-amber-400" /> Should fix</span>
                {editable ? <span>Click a cell to change it · past days are locked</span> : null}
              </div>
            </CardContent>
          </Card>

          {airline ? (
            <Card>
              <CardHeader>
                <div><CardTitle>Coverage through the day</CardTitle><CardDescription>{airline.name} · trained agents on duty against SLA need, every 15 minutes</CardDescription></div>
                <Select value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day">
                  {days.map((d) => <option key={d} value={d}>{formatDate(d, { weekday: "long", day: "numeric", month: "short" })}</option>)}
                </Select>
              </CardHeader>
              <CardContent>
                <CoverageTimeline dc={ctx.day(airline.code, day)} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div><CardTitle>Roster periods</CardTitle><CardDescription>{editable ? "Drafts and published rosters for this team" : "Published rosters for this team"}</CardDescription></div>
              {editable ? <Button variant="ghost" size="icon" onClick={() => setCreateOpen(true)} title="Create roster"><CalendarPlus /></Button> : null}
            </CardHeader>
            <CardContent className="space-y-1.5">
              {periodsHere.length === 0 ? <p className="text-sm text-muted">No roster periods yet. The current weeks come from the engine&apos;s baseline.</p> : null}
              {periodsHere.slice(0, 6).map((p) => (
                <Link key={p.id} href={`/rosters/periods/${p.id}`} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 transition-colors hover:border-brand-400 hover:bg-brand-50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{formatDate(p.start, { day: "numeric", month: "short" })} – {formatDate(periodEnd(p), { day: "numeric", month: "short" })}</p>
                    <p className="truncate text-xs text-muted">{p.weeks} week{p.weeks > 1 ? "s" : ""} · {p.teams.length > 1 ? `${p.teams.length} teams` : teamLabel(p.teams[0], hub.ds.airlines)}{p.share ? " · shared" : ""}</p>
                  </div>
                  <Badge tone={p.status === "published" ? "ok" : "warn"}>{p.status === "published" ? "Published" : "Draft"}</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>

          {editable ? (
            <Card>
              <CardHeader>
                <div><CardTitle>Recent changes</CardTitle><CardDescription>Who changed this team&apos;s roster</CardDescription></div>
                {can(hub.session?.role, "audit.view") ? <Button variant="ghost" size="icon" asChild title="Change log"><Link href={`/changes?team=${team}`}><History /></Link></Button> : null}
              </CardHeader>
              <CardContent className="space-y-2">
                {recent.length === 0 ? <p className="text-sm text-muted">No changes yet.</p> : null}
                {recent.map((e) => (
                  <div key={e.id} className={cn("text-xs", e.undone && "opacity-50 line-through")}>
                    <p className="font-medium text-ink-900">{e.summary}</p>
                    <p className="text-muted">{e.actor.name} · {ROLE_LABEL[e.actor.role]} · {new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {outlook ? (
            <Card className={cn(outlook.verdict === "short" && "border-red-200", outlook.verdict === "rearrange" && "border-amber-200")}>
              <CardHeader><div><CardTitle>Staffing outlook</CardTitle><CardDescription>Can this week be covered by moving shifts, or does it need people?</CardDescription></div></CardHeader>
              <CardContent className="space-y-3">
                <Badge tone={outlook.verdict === "short" ? "bad" : outlook.verdict === "rearrange" ? "warn" : "ok"}>{outlook.verdict === "short" ? `Short ${outlook.extraPeople} ${outlook.extraPeople > 1 ? "people" : "person"}` : outlook.verdict === "rearrange" ? "Fixable by rearranging" : "Covered"}</Badge>
                <p className="text-sm">{outlook.summary}</p>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {outlook.days.map((d) => (
                    <div key={d.date} className={cn("rounded-md py-1", d.short ? "bg-bad-soft" : d.gaps ? "bg-warn-soft" : "bg-surface")}>
                      <div className="text-[10px] font-semibold text-muted">{formatDate(d.date, { weekday: "narrow" })}</div>
                      <div className="text-[11px] font-bold tabular">{d.available}/{d.needPeople}</div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted">Available current agents / people needed that day (early + late peaks).</p>
              </CardContent>
            </Card>
          ) : null}

          {airline ? (
            <Card>
              <CardHeader><div><CardTitle>Gaps to fix</CardTitle><CardDescription>From today forward · ranked fixes from the engine</CardDescription></div></CardHeader>
              <CardContent className="space-y-1.5">
                {gaps.length === 0 ? <p className="text-sm text-muted">No open gaps for {airline.code} this week.</p> : null}
                {gaps.map((c) => (
                  <button key={c.date + c.shift} onClick={() => setGapCell(c)} className="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2 text-left transition-colors hover:border-brand-400 hover:bg-brand-50 cursor-pointer">
                    <span className="flex-1 text-sm">{formatDate(c.date)} · {SHIFT_LABEL[c.shift]}</span>
                    <Badge tone={c.level === "red" ? "bad" : "warn"}>{c.assigned}/{c.required}{c.leadsAssigned < c.leadsRequired ? " · no lead" : ""}</Badge>
                    <span className="text-xs font-semibold text-brand-600">Fix</span>
                  </button>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div><CardTitle>Rule checks</CardTitle><CardDescription>This team and week, seams with last week included</CardDescription></div>
              {can(hub.session?.role, "rules.edit") ? <Button variant="ghost" size="icon" asChild title="Rule settings"><Link href="/settings"><Settings2 /></Link></Button> : null}
            </CardHeader>
            <CardContent className="space-y-2">
              {ruleSummary.map(({ m, list }) => {
                const sev = hub.rules[m.id].severity;
                return (
                  <div key={m.id} className="flex items-center gap-2 text-sm">
                    {list.length === 0 ? <CheckCircle2 className="size-4 text-ok" /> : sev === "hard" ? <XCircle className="size-4 text-bad" /> : <AlertTriangle className="size-4 text-warn" />}
                    <span className="flex-1">{m.name}</span>
                    {list.length ? <Badge tone={sev === "hard" ? "bad" : "warn"}>{list.length}</Badge> : <span className="text-xs text-muted">OK</span>}
                  </div>
                );
              })}
              {violations.slice(0, 5).map((v, i) => (
                <p key={i} className={cn("rounded-md px-2 py-1 text-xs", v.severity === "hard" ? "bg-bad-soft text-red-900" : "bg-warn-soft text-amber-900")}>{v.message}</p>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <ReassignDialog cell={gapCell ? cells.find((c) => c.date === gapCell.date && c.shift === gapCell.shift) ?? gapCell : null} open={!!gapCell} onOpenChange={(v) => !v && setGapCell(null)} />
      {optOpen ? <OptimiseDialog team={team} members={members} ws={ws} onClose={() => setOptOpen(false)} /> : null}
      {teamOpen && airline ? <TeamDialog airlineCode={airline.code} onClose={() => setTeamOpen(false)} /> : null}
      {createOpen ? <CreateRosterDialog defaultTeam={team} defaultStart={unrostered ? ws : undefined} onClose={() => setCreateOpen(false)} /> : null}
    </>
  );
}

function OptimiseDialog({ team, members, ws, onClose }: { team: TeamKey; members: Person[]; ws: string; onClose: () => void }) {
  const hub = useHub();
  const input = useEngineInput();
  const airline = hub.ds.airlines.find((a) => a.code === team);
  const result = React.useMemo(() => {
    const ctx = new CoverageContext(input);
    const days = rangeDays(ws, 7);
    const prevDays = rangeDays(addDays(ws, -7), 7);
    const histDays = rangeDays(addDays(ws, -21), 21);
    const patterns = weekPatterns(hub.rules);
    const flightsOf = (d: string) => hub.ds.flights.filter((f) => f.date === d);
    const groups: { people: Person[]; demand: (d: string, s: "E" | "L") => number }[] = airline
      ? [
          { people: members.filter((m) => m.role === "agent"), demand: (d, s) => shiftDemand(flightsOf(d), airline, s).agents },
          { people: members.filter((m) => m.role === "lead"), demand: (d, s) => Math.min(1, shiftDemand(flightsOf(d), airline, s).leads) },
        ]
      : [{ people: members, demand: () => 1 }];
    const edits: CellEdit[] = [];
    const notes: string[] = [];
    for (const g of groups) {
      if (!g.people.length) continue;
      const plan = optimiseWeek({
        members: g.people,
        weekStart: ws,
        demand: g.demand,
        prevWeek: (id) => prevDays.map((d) => ctx.shift(id, d)),
        locked: (id, i) => {
          const d = days[i];
          const cur = ctx.shift(id, d);
          if (d < hub.today) return cur; // the past is fixed
          if (hub.overrides.has(`${id}|${d}`)) return cur; // manager's changes are kept
          if (cur === "V") return "V";
          return undefined;
        },
        history: (id) => fairnessHistory(id, histDays, (pid, d) => ctx.shift(pid, d)),
        counts: (id) => (airline ? eligibleFor(hub.people.get(id)!, airline, ws).ok : true),
        rules: hub.rules,
        seed: `opt-${team}-${ws}-${Date.now()}`,
        restarts: 5,
      }, patterns);
      notes.push(...plan.notes);
      for (const p of g.people) {
        plan.patterns.get(p.id)!.forEach((s, i) => {
          if (ctx.shift(p.id, days[i]) !== s) edits.push({ personId: p.id, date: days[i], shift: s });
        });
      }
    }
    const measure = (roster: typeof input.roster) => {
      const c2 = new CoverageContext({ ...input, roster });
      const v = check({ ...input, roster }, { from: ws, days: 7, personIds: members.map((m) => m.id), airlines: airline ? [airline.code] : [], rules: hub.rules }, c2);
      const short = airline ? days.reduce((s, d) => s + c2.day(airline.code, d).gaps.filter((g) => g.kind === "agents").length, 0) : 0;
      return { hard: v.filter((x) => x.severity === "hard").length, soft: v.filter((x) => x.severity !== "hard").length, gaps: short };
    };
    const editKey = new Map(edits.map((e) => [`${e.personId}|${e.date}`, e.shift]));
    const after = input.roster.map((r) => (editKey.has(`${r.personId}|${r.date}`) ? { ...r, shift: editKey.get(`${r.personId}|${r.date}`)! } : r));
    return { edits, notes, before: measure(input.roster), after: measure(after) };
  }, [input, ws, team]); // eslint-disable-line react-hooks/exhaustive-deps

  const better = result.after.hard < result.before.hard || (result.after.hard === result.before.hard && result.after.gaps < result.before.gaps);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl" title="Optimise week" description={`${airline?.name ?? "Team"} · week of ${formatDate(ws, { day: "numeric", month: "long" })}. Past days and manager changes stay as they are.`}>
        <div className="grid grid-cols-3 gap-2 text-center">
          {(["gaps", "hard", "soft"] as const).map((k) => (
            <div key={k} className="rounded-lg border border-line p-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted">{k === "gaps" ? "Coverage gaps" : k === "hard" ? "Rule breaks" : "Should fix"}</div>
              <div className="mt-1 font-display text-lg font-semibold tabular">
                {result.before[k]} <span className="text-muted">→</span> <span className={result.after[k] < result.before[k] ? "text-ok" : result.after[k] > result.before[k] ? "text-bad" : ""}>{result.after[k]}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm">{result.edits.length ? `${result.edits.length} cell${result.edits.length > 1 ? "s" : ""} would change.` : "The current roster is already the best the engine can find."}</p>
        {result.notes.length ? (
          <div className="mt-3 space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">What the engine can't cover</p>
            {result.notes.map((n) => <p key={n} className="rounded-md bg-warn-soft px-2 py-1.5 text-xs text-amber-900">{n}</p>)}
          </div>
        ) : null}
        {result.edits.length ? (
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer font-semibold text-brand-600">See the changes</summary>
            <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto">
              {result.edits.map((e) => {
                const p = hub.people.get(e.personId);
                return <li key={e.personId + e.date}>{personName(p)} · {formatDate(e.date)}: <span className="font-semibold">{SHIFT_LABEL[e.shift]}</span></li>;
              })}
            </ul>
          </details>
        ) : null}
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!result.edits.length || !better} onClick={() => { hub.setCells(result.edits, { source: "optimise", title: `Optimised ${teamLabel(team, hub.ds.airlines)} · week of ${formatDate(ws, { day: "numeric", month: "short" })}: ${result.edits.length} shift${result.edits.length > 1 ? "s" : ""}` }); onClose(); }}>
            <Lock className="size-4" /> Apply {result.edits.length || ""} change{result.edits.length === 1 ? "" : "s"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TeamDialog({ airlineCode, onClose }: { airlineCode: string; onClose: () => void }) {
  const hub = useHub();
  const airline = hub.ds.airlines.find((a) => a.code === airlineCode)!;
  const staff = hub.ds.people
    .filter((p) => (p.role === "agent" || p.role === "lead") && p.active !== false)
    .filter((p) => p.coreAirline === airlineCode || !p.coreAirline || p.trainedAirlines.includes(airlineCode))
    .sort((a, b) => Number(b.coreAirline === airlineCode) - Number(a.coreAirline === airlineCode) || a.lastName.localeCompare(b.lastName));
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl" title={`${airline.name} team`} description="Move staff onto or off this airline's core team. Rosters rebuild with the change; training still comes from TakeFlight.">
        <div className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
          {staff.map((p) => {
            const current = eligibleFor(p, airline, hub.today).ok;
            return (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border border-line p-2.5">
                <Avatar name={personName(p)} src={p.photoUrl} tone={p.role === "lead" ? "dark" : "brand"} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{personName(p)} <span className="font-normal text-muted">· {p.role === "lead" ? "Lead" : "Agent"}</span></p>
                  <p className="text-xs text-muted">{current ? `Current on ${airline.code}` : `Not current on ${airline.code}`}</p>
                </div>
                <Select
                  value={p.coreAirline ?? ""}
                  onChange={(e) => hub.savePerson(p.id, { coreAirline: e.target.value || null })}
                  aria-label={`Team for ${personName(p)}`}
                  className="h-9 text-xs"
                >
                  <option value="">Float pool</option>
                  {hub.ds.airlines.map((a) => <option key={a.code} value={a.code}>Core {a.code}</option>)}
                </Select>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end"><Button onClick={onClose}>Done</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function CreateRosterDialog({ defaultTeam, defaultStart, onClose }: { defaultTeam: TeamKey; defaultStart?: string; onClose: () => void }) {
  const hub = useHub();
  const input = useEngineInput();
  const router = useRouter();
  const thisWeek = weekStart(hub.today);
  const lastStart = weekStart(hub.ds.horizonEnd);
  const starts: string[] = [];
  for (let d = thisWeek; d <= lastStart; d = addDays(d, 7)) starts.push(d);
  const ctx = React.useMemo(() => new CoverageContext(input), [input]);
  const firstOpen = (t: TeamKey) => {
    const ms = t === "ALL" ? hub.ds.people.filter((p) => p.role === "agent") : teamMembers(hub.ds.people, t);
    return starts.find((w) => ms.every((m) => rangeDays(w, 7).every((d) => ctx.shift(m.id, d) === undefined))) ?? addDays(thisWeek, 7);
  };
  const [team, setTeam] = React.useState<string>(defaultTeam);
  const [start, setStart] = React.useState(() => defaultStart ?? firstOpen(defaultTeam));
  const [weeks, setWeeks] = React.useState(4);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const maxWeeks = Math.min(4, Math.round((Date.parse(lastStart) - Date.parse(start)) / (7 * 86400000)) + 1);
  React.useEffect(() => setWeeks((w) => Math.min(w, maxWeeks)), [maxWeeks]);
  const teams = team === "ALL" ? allTeams(hub.ds.airlines) : [team];
  const end = addDays(start, weeks * 7 - 1);
  const overlaps = hub.periods.filter((p) => p.teams.some((t) => teams.includes(t)) && p.start <= end && periodEnd(p) >= start);
  const coversLive = start <= addDays(hub.ds.windowStart, 27);

  const build = () => {
    setBusy(true);
    setTimeout(() => {
      const grid = buildPeriod({ input, teams, start, weeks, rules: hub.rules, today: hub.today, seed: `period-${Date.now()}` });
      const id = hub.createPeriod({ teams, start, weeks, grid, note: note.trim() || undefined });
      router.push(`/rosters/periods/${id}`);
    }, 30);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-lg" title="Create roster" description="The engine builds a draft against flight demand, SLA minimums and the rules. You review and edit it, then publish it to staff.">
        <div className="space-y-4">
          <div>
            <Label htmlFor="cr-team">Team</Label>
            <Select id="cr-team" value={team} onChange={(e) => { setTeam(e.target.value); if (!defaultStart) setStart(firstOpen(e.target.value)); }} className="mt-1 w-full">
              {hub.ds.airlines.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
              <option value="POOL">Float pool</option>
              <option value="SUP-US">Supervisors · US</option>
              <option value="SUP-INTL">Supervisors · International</option>
              <option value="ALL">All teams</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="cr-start">Starting week</Label>
            <Select id="cr-start" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 w-full">
              {starts.map((w) => <option key={w} value={w}>Week of Sun {formatDate(w, { day: "numeric", month: "long" })}{w === thisWeek ? " (this week)" : ""}</option>)}
            </Select>
          </div>
          <div>
            <Label>Length</Label>
            <div className="mt-1 grid grid-cols-4 gap-1.5">
              {[1, 2, 3, 4].map((n) => (
                <button key={n} disabled={n > maxWeeks} onClick={() => setWeeks(n)} className={cn("h-10 cursor-pointer rounded-lg border text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40", weeks === n ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line hover:border-brand-400 hover:text-brand-700")}>
                  {n} week{n > 1 ? "s" : ""}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">{formatDate(start, { weekday: "short", day: "numeric", month: "short" })} – {formatDate(end, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {teams.length > 1 ? `${teams.length} teams` : teamLabel(teams[0], hub.ds.airlines)}</p>
          </div>
          <div>
            <Label htmlFor="cr-note">Note for staff (optional)</Label>
            <Textarea id="cr-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1" placeholder="e.g. Holiday schedule, swap requests to your supervisor by Friday" />
          </div>
          {overlaps.length || coversLive ? (
            <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-amber-900">
              {overlaps.length ? `Overlaps ${overlaps.length} existing period${overlaps.length > 1 ? "s" : ""}. ` : ""}
              Publishing replaces the live roster for these dates (past days and booked leave are kept).
            </p>
          ) : null}
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={build} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy ? "Building…" : "Build draft"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
