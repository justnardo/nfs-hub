"use client";
import * as React from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Download, XCircle } from "lucide-react";
import { Avatar, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Select, cn } from "@nfs/ui";
import { SHIFTS, addDays, formatDate, rangeDays, weekStart, type Person } from "@nfs/db";
import { RULES, buildShiftIndex, coverageCell, eligibleFor, validateRoster } from "@nfs/rules";
import { useHub, personName } from "@/lib/store";
import { RequirePerm } from "@/components/guard";
import { AirlineChip, LEVEL_STYLE, PersonLink, ShiftChip } from "@/components/ops";

export default function RostersPage() {
  return (
    <RequirePerm perm="roster.view">
      <Rosters />
    </RequirePerm>
  );
}

function Rosters() {
  const hub = useHub();
  const [team, setTeam] = React.useState<string>(hub.me?.coreAirline ?? "UA");
  const [ws, setWs] = React.useState(() => weekStart(hub.today));
  const days = rangeDays(ws, 7);
  const idx = React.useMemo(() => buildShiftIndex(hub.ds.roster), [hub.ds]);
  const airline = hub.ds.airlines.find((a) => a.code === team);

  const members: Person[] = hub.ds.people
    .filter((p) =>
      team === "POOL" ? p.role === "agent" && !p.coreAirline : team === "SUP" ? p.role === "supervisor" : (p.role === "agent" || p.role === "lead") && p.coreAirline === team,
    )
    .sort((a, b) => (a.role === b.role ? a.lastName.localeCompare(b.lastName) : a.role === "lead" ? -1 : 1));

  const memberIds = new Set(members.map((m) => m.id));
  const violations = validateRoster(hub.ds.roster.filter((r) => memberIds.has(r.personId)));
  const covers = hub.reassignments.filter((r) => days.includes(r.date));
  const input = { airlines: hub.ds.airlines, people: hub.ds.people, flights: hub.ds.flights, roster: hub.ds.roster, reassignments: hub.reassignments };

  const exportCsv = () => {
    const rows = [["Staff no", "Name", "Role", ...days.map((d) => formatDate(d))]];
    for (const m of members) rows.push([m.staffNo, personName(m), m.role, ...days.map((d) => idx.get(`${m.id}|${d}`) ?? "")]);
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `gateline-roster-${team}-${ws}.csv`;
    a.click();
  };

  return (
    <>
      <PageHeader
        eyebrow="Airline-specific rosters"
        title="Rosters"
        description="Each airline keeps its core team. Rotation runs early → late → off with the union rules enforced, and nobody is fixed to one pattern."
        actions={
          <>
            <Select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
              {hub.ds.airlines.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
              <option value="POOL">Float pool (backup)</option>
              <option value="SUP">Supervisors</option>
            </Select>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" disabled={ws <= hub.ds.windowStart} onClick={() => setWs(addDays(ws, -7))} aria-label="Previous week"><ChevronLeft /></Button>
              <span className="min-w-36 text-center text-sm font-semibold">{formatDate(ws, { day: "numeric", month: "short" })} – {formatDate(addDays(ws, 6), { day: "numeric", month: "short" })}</span>
              <Button variant="outline" size="icon" disabled={ws >= addDays(hub.ds.windowStart, 21)} onClick={() => setWs(addDays(ws, 7))} aria-label="Next week"><ChevronRight /></Button>
            </div>
            <Button variant="outline" onClick={exportCsv}><Download /> CSV</Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">{airline ? <AirlineChip airline={airline} size="md" /> : team === "POOL" ? "Float pool" : "Supervisors"}</CardTitle>
              <CardDescription>{members.length} staff · E {SHIFTS.E.start}–{SHIFTS.E.end} · L {SHIFTS.L.start}–{SHIFTS.L.end}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto px-2 sm:px-5">
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
                  const hours = days.filter((d) => ["E", "L"].includes(idx.get(`${m.id}|${d}`) ?? "")).length * 8;
                  const expired = airline ? !eligibleFor(m, airline, hub.today).ok : false;
                  return (
                    <tr key={m.id} className="group">
                      <td className="rounded-l-lg py-1 pl-2 pr-3 transition-colors group-hover:bg-brand-50/60">
                        <div className="flex items-center gap-2">
                          <Avatar name={personName(m)} tone={m.role === "lead" ? "dark" : "brand"} className="size-7" />
                          <div className="min-w-0">
                            <PersonLink p={m} />
                            <div className="flex items-center gap-1 text-[11px] text-muted">
                              {m.role === "lead" ? "Lead" : m.role === "supervisor" ? `Supervisor · ${m.homeTerminal}` : m.staffNo}
                              {expired ? <Badge tone="bad" className="ml-1">training expired</Badge> : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      {days.map((d) => {
                        const s = idx.get(`${m.id}|${d}`) ?? "";
                        const moved = covers.find((c) => c.personId === m.id && c.date === d);
                        return (
                          <td key={d} className="px-1 py-1 text-center transition-colors group-hover:bg-brand-50/60">
                            <div className="relative inline-block">
                              <ShiftChip shift={s} />
                              {moved ? <span title={`Covering ${moved.toAirline}`} className="absolute -right-1.5 -top-1.5 rounded bg-brand-500 px-1 text-[8.5px] font-bold text-white">{moved.toAirline}</span> : null}
                            </div>
                          </td>
                        );
                      })}
                      <td className="rounded-r-lg px-1 text-center text-xs font-semibold tabular text-muted transition-colors group-hover:bg-brand-50/60">{hours}</td>
                    </tr>
                  );
                })}
                {airline ? (
                  (["E", "L"] as const).map((s) => (
                    <tr key={s}>
                      <td className="pl-2 pt-2 text-[11px] font-semibold uppercase text-muted">{SHIFTS[s].label} vs SLA</td>
                      {days.map((d) => {
                        const c = coverageCell(input, airline, d, s, idx);
                        return (
                          <td key={d} className="px-1 pt-2 text-center">
                            <span className={cn("inline-grid h-7 min-w-11 place-items-center rounded-md border px-1 text-[11px] font-bold tabular", LEVEL_STYLE[c.level])}>
                              {c.level === "none" ? "·" : `${c.assigned}/${c.required}`}
                            </span>
                          </td>
                        );
                      })}
                      <td />
                    </tr>
                  ))
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader><div><CardTitle>Union & fatigue rules</CardTitle><CardDescription>Checked across all four weeks for this team</CardDescription></div></CardHeader>
            <CardContent className="space-y-2.5">
              {[
                [`${RULES.minRestHours}h rest between shifts`, "rest"],
                [`Max ${RULES.maxConsecutiveLates} late shifts in a row`, "late-run"],
                ["2 consecutive days off inside Sun–Sat", "days-off"],
                [`${RULES.weeklyHours}h standard week`, "hours"],
              ].map(([label, rule]) => {
                const n = violations.filter((v) => v.rule === rule).length;
                return (
                  <div key={rule} className="flex items-center gap-2 text-sm">
                    {n === 0 ? <CheckCircle2 className="size-4 text-ok" /> : <XCircle className="size-4 text-bad" />}
                    <span className="flex-1">{label}</span>
                    <Badge tone={n ? "bad" : "ok"}>{n ? `${n} issue${n > 1 ? "s" : ""}` : "OK"}</Badge>
                  </div>
                );
              })}
              {violations.slice(0, 4).map((v) => (
                <p key={v.personId + v.date + v.rule} className="rounded-md bg-bad-soft px-2 py-1 text-xs text-red-900">{personName(hub.people.get(v.personId))}: {v.message}</p>
              ))}
              <p className="pt-1 text-[11px] text-muted">Same rule engine as Rampline. Staff helping another team don't count toward their own team's headcount, so shortages show.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Key</CardTitle></div></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-xs">
              <span className="flex items-center gap-2"><ShiftChip shift="E" /> Early</span>
              <span className="flex items-center gap-2"><ShiftChip shift="L" /> Late</span>
              <span className="flex items-center gap-2"><ShiftChip shift="O" /> Day off</span>
              <span className="flex items-center gap-2"><ShiftChip shift="V" /> Vacation</span>
              <span className="col-span-2 flex items-center gap-2"><span className="rounded bg-brand-500 px-1 text-[8.5px] font-bold text-white">UA</span> Covering another airline that shift</span>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
