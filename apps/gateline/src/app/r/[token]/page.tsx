"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import { CalendarPlus, FileText, Loader2, Search, X } from "lucide-react";
import { Avatar, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Select, cn } from "@nfs/ui";
import { addDays, formatDate, rangeDays } from "@nfs/db";
import { CoverageContext, SHIFT_LABEL, SHIFT_TIMES } from "@nfs/rules";
import { useEngineInput, useHub } from "@/lib/store";
import { periodDays, periodEnd, periodShift, rosterSections, teamLabel, teamMembers, teamOf } from "@/lib/periods";
import { downloadRosterPdf } from "@/lib/pdf";
import { downloadText, shiftsIcs } from "@/lib/ics";
import { FirstGlanceCredit, NfsWordmark } from "@/components/brand";
import { RosterGrid } from "@/components/roster-grid";
import { ShiftChip } from "@/components/ops";

const ME_KEY = "gateline.share.me";

export default function SharedRosterPage() {
  const { token } = useParams<{ token: string }>();
  const hub = useHub();
  const input = useEngineInput();
  const ctx = React.useMemo(() => new CoverageContext(input), [input]);
  const [me, setMe] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [team, setTeam] = React.useState<string | null>(null);
  const [week, setWeek] = React.useState(0);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  React.useEffect(() => {
    try {
      setMe(window.localStorage.getItem(ME_KEY));
    } catch {
      /* ignore */
    }
  }, []);
  const pick = (id: string | null) => {
    setMe(id);
    setQ("");
    try {
      if (id) window.localStorage.setItem(ME_KEY, id);
      else window.localStorage.removeItem(ME_KEY);
    } catch {
      /* ignore */
    }
  };

  const p = hub.periods.find((x) => x.share?.token === token);
  const shell = (body: React.ReactNode) => (
    <div className="min-h-dvh bg-surface">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <NfsWordmark size="sm" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Staff roster</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-5">{body}</main>
      <footer className="mx-auto max-w-5xl px-4 pb-8 pt-2"><FirstGlanceCredit /></footer>
    </div>
  );

  if (!hub.ready || !hub.synced) return shell(<div className="grid place-items-center py-24 text-muted"><Loader2 className="size-6 animate-spin" /></div>);
  if (!p || p.status !== "published" || !p.share || p.share.expires < hub.today) {
    return shell(
      <Card className="mx-auto mt-8 max-w-md">
        <CardContent className="py-10 text-center">
          <p className="font-semibold">This roster link isn&apos;t active</p>
          <p className="mt-1 text-sm text-muted">It may have expired or been replaced. Ask your supervisor for the latest link.</p>
        </CardContent>
      </Card>,
    );
  }

  const people = p.teams.flatMap((t) => teamMembers(input.people, t));
  const person = me ? people.find((x) => x.id === me) ?? null : null;
  const activeTeam = team && p.teams.includes(team) ? team : (person && teamOf(person) && p.teams.includes(teamOf(person)!) ? teamOf(person)! : p.teams[0]);
  const members = teamMembers(input.people, activeTeam);
  const airline = input.airlines.find((a) => a.code === activeTeam);
  const ws = addDays(p.start, week * 7);
  const days = rangeDays(ws, 7);
  const allDays = periodDays(p);
  const title = p.teams.length > 3 ? "All teams" : p.teams.map((t) => teamLabel(t, input.airlines)).join(", ");
  const range = `${formatDate(p.start, { day: "numeric", month: "short" })} – ${formatDate(periodEnd(p), { day: "numeric", month: "short", year: "numeric" })}`;
  const changed = (pid: string, d: string) => periodShift(p, pid, d) !== undefined && ctx.shift(pid, d) !== periodShift(p, pid, d);
  const matches = q.trim().length >= 2 ? people.filter((x) => `${x.firstName} ${x.lastName} ${x.staffNo}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  const myShifts = person ? allDays.map((d) => ({ date: d, shift: ctx.shift(person.id, d) })) : [];
  const weekShifts = myShifts.filter((s) => days.includes(s.date));
  const weekTabs = p.weeks > 1 ? (
    <div className="mb-3 flex gap-1.5 overflow-x-auto">
      {Array.from({ length: p.weeks }, (_, i) => (
        <button key={i} onClick={() => setWeek(i)} className={cn("shrink-0 cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors", week === i ? "border-brand-500 bg-brand-500 text-white" : "border-line text-ink-800 hover:border-brand-400 hover:text-brand-700")}>
          {formatDate(addDays(p.start, i * 7), { day: "numeric", month: "short" })} – {formatDate(addDays(p.start, i * 7 + 6), { day: "numeric", month: "short" })}
        </button>
      ))}
    </div>
  ) : null;
  const myHours = myShifts.filter((s) => s.shift === "E" || s.shift === "M" || s.shift === "L").length * 8;

  const pdf = async () => {
    setPdfBusy(true);
    try {
      await downloadRosterPdf({
        title: `${title} · Passenger Service roster`,
        subtitle: `${range}${p.note ? ` · ${p.note}` : ""}`,
        status: "published",
        meta: [`Published by ${p.publishedBy?.name ?? "NFS"}`, person ? `Highlighted: ${person.firstName} ${person.lastName}` : "Read-only copy"],
        sections: rosterSections(input, person && teamOf(person) && p.teams.includes(teamOf(person)!) ? [teamOf(person)!] : p.teams, p.start, p.weeks, person?.id),
        filename: `NFS-roster-${p.start}${person ? `-${person.lastName}` : ""}.pdf`,
      });
    } finally {
      setPdfBusy(false);
    }
  };

  return shell(
    <>
      <div>
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted">{range} · Published by {p.publishedBy?.name} on {formatDate(p.publishedAt!.slice(0, 10), { day: "numeric", month: "short" })}</p>
        {p.note ? <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{p.note}</p> : null}
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{person ? `${person.firstName}'s shifts` : "Find your name"}</CardTitle>
            <CardDescription>{person ? `${person.staffNo} · ${myHours} paid hours over ${p.weeks} week${p.weeks > 1 ? "s" : ""}` : "Type your name or staff ID to see your shifts."}</CardDescription>
          </div>
          {person ? <Button variant="ghost" size="sm" onClick={() => pick(null)}><X /> Not you?</Button> : null}
        </CardHeader>
        <CardContent>
          {!person ? (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Nadia or NFS-4119" className="pl-9" aria-label="Your name or staff ID" />
              {matches.length ? (
                <div className="mt-2 space-y-1">
                  {matches.map((m) => (
                    <button key={m.id} onClick={() => pick(m.id)} className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 text-left transition-colors hover:border-brand-400 hover:bg-brand-50">
                      <Avatar name={`${m.firstName} ${m.lastName}`} src={m.photoUrl} className="size-8" />
                      <span className="flex-1 text-sm font-semibold">{m.firstName} {m.lastName}</span>
                      <span className="text-xs text-muted">{m.staffNo}</span>
                    </button>
                  ))}
                </div>
              ) : q.trim().length >= 2 ? <p className="mt-2 text-sm text-muted">No one by that name on this roster.</p> : null}
            </div>
          ) : (
            <>
              {weekTabs}
              <div className="grid gap-1.5 sm:grid-cols-2">
                {weekShifts.map(({ date, shift }) => {
                  const s = shift ?? "O";
                  const work = s === "E" || s === "M" || s === "L";
                  return (
                    <div key={date} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2", date === hub.today ? "border-brand-500 bg-brand-50" : "border-line", date < hub.today && "opacity-50")}>
                      <div className="w-24 text-sm"><span className="font-semibold">{formatDate(date, { weekday: "short" })}</span> <span className="text-muted">{formatDate(date, { day: "numeric", month: "short" })}</span></div>
                      <ShiftChip shift={s} />
                      <span className="flex-1 text-sm">{work ? `${SHIFT_TIMES[s].start}–${SHIFT_TIMES[s].end}` : SHIFT_LABEL[s]}</span>
                      {changed(person.id, date) ? <Badge tone="warn">Changed</Badge> : null}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => downloadText(shiftsIcs(`${person.firstName} ${person.lastName}`, teamLabel(teamOf(person) ?? "", input.airlines), myShifts), `NFS-shifts-${p.start}.ics`, "text/calendar")}><CalendarPlus /> Add all {p.weeks > 1 ? `${p.weeks} weeks ` : ""}to my calendar</Button>
                <Button variant="outline" onClick={pdf} disabled={pdfBusy}>{pdfBusy ? <Loader2 className="animate-spin" /> : <FileText />} PDF</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-wrap gap-2">
          <div><CardTitle>Team roster</CardTitle><CardDescription>{airline?.name ?? teamLabel(activeTeam, input.airlines)} · week of {formatDate(ws, { day: "numeric", month: "short" })}</CardDescription></div>
          <div className="flex flex-wrap items-center gap-2">
            {p.teams.length > 1 ? (
              <Select value={activeTeam} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
                {p.teams.map((t) => <option key={t} value={t}>{teamLabel(t, input.airlines)}</option>)}
              </Select>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="px-2 sm:px-5">
          {person ? null : <div className="px-2">{weekTabs}</div>}
          <RosterGrid members={members} days={days} shiftOf={(pid, d) => ctx.shift(pid, d)} today={hub.today} highlightId={person?.id} changed={changed} />
          <p className="mt-3 px-2 text-[11px] text-muted">E Early {SHIFT_TIMES.E.start}–{SHIFT_TIMES.E.end} · M Mid {SHIFT_TIMES.M.start}–{SHIFT_TIMES.M.end} · L Late {SHIFT_TIMES.L.start}–{SHIFT_TIMES.L.end} · Gold dot: changed since publishing. Read-only — speak to your supervisor about swaps.</p>
        </CardContent>
      </Card>
    </>,
  );
}
