"use client";
import * as React from "react";
import Link from "next/link";
import {
  ArrowRight, CalendarX2, CheckCircle2, ClipboardX, GraduationCap, Inbox, MessageSquareWarning, Siren, Users,
} from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from "@nfs/ui";
import { addDays, formatDate, rangeDays, timingsFor } from "@nfs/db";
import { CoverageContext, coverageGrid, type CoverageCell } from "@nfs/rules";
import { deriveStatus } from "@nfs/flights";
import { personName, useEngineInput, useHub } from "@/lib/store";
import { teamMembers } from "@/lib/periods";
import { gapText } from "@nfs/rules";

type Tone = "bad" | "warn" | "brand";
interface Item {
  id: string;
  tone: Tone;
  icon: React.ReactNode;
  title: string;
  sub: string;
  action: { label: string; href?: string; onClick?: () => void };
}

const TONE: Record<Tone, string> = {
  bad: "bg-bad-soft text-bad",
  warn: "bg-warn-soft text-amber-700",
  brand: "bg-brand-50 text-brand-700",
};

const SHIFT_NAME: Record<string, string> = { E: "early", M: "mid", L: "late" };
const weekStartOf = (d: string) => addDays(d, -new Date(`${d}T12:00:00Z`).getUTCDay());

/**
 * One list of what a manager should act on now: gaps, waiting requests, unfiled records,
 * expired training on the roster, open complaints, Rampline alerts and weeks still to roster.
 */
export function NeedsAttention({ onFixGap, className }: { onFixGap: (c: CoverageCell) => void; className?: string }) {
  const hub = useHub();
  const input = useEngineInput();
  const [showAll, setShowAll] = React.useState(false);

  const items = React.useMemo<Item[]>(() => {
    const now: Item[] = []; // today, act now
    const soon: Item[] = []; // waiting on a decision
    const later: Item[] = []; // tomorrow and beyond
    const today = hub.today;
    const tomorrow = addDays(today, 1);
    const ctx = new CoverageContext(input);
    const airlineName = (c: string) => hub.ds.airlines.find((a) => a.code === c)?.name ?? c;

    // 1. Coverage gaps, today and tomorrow (red first)
    const cells = coverageGrid(input, today, 2, ctx).filter((c) => c.level === "red" || c.level === "amber");
    cells.sort((a, b) => (a.level === b.level ? 0 : a.level === "red" ? -1 : 1));
    for (const c of cells.filter((x) => x.date === today)) {
      now.push({
        id: `gap-${c.airline}-${c.date}-${c.shift}`,
        tone: c.level === "red" ? "bad" : "warn",
        icon: <Users />,
        title: `${airlineName(c.airline)} ${SHIFT_NAME[c.shift] ?? c.shift} is short ${c.date === today ? "today" : "tomorrow"}`,
        sub: `${c.assigned}/${c.required} agents on shift${c.leadsRequired ? ` · lead ${c.leadsAssigned}/${c.leadsRequired}` : ""}${gapText(c) ? ` · ${gapText(c)}` : ""}`,
        action: { label: "Fix", onClick: () => onFixGap(c) },
      });
    }
    const tmr = cells.filter((x) => x.date === tomorrow);
    if (tmr.length === 1) {
      const c = tmr[0];
      later.push({
        id: `gap-${c.airline}-${c.date}-${c.shift}`, tone: c.level === "red" ? "bad" : "warn", icon: <Users />,
        title: `${airlineName(c.airline)} ${SHIFT_NAME[c.shift] ?? c.shift} is short tomorrow`,
        sub: `${c.assigned}/${c.required} agents on shift${gapText(c) ? ` · ${gapText(c)}` : ""}`,
        action: { label: "Fix", onClick: () => onFixGap(c) },
      });
    } else if (tmr.length > 1) {
      later.push({
        id: "gaps-tomorrow", tone: tmr.some((c) => c.level === "red") ? "bad" : "warn", icon: <Users />,
        title: `${tmr.length} shifts short tomorrow`,
        sub: tmr.map((c) => `${c.airline} ${SHIFT_NAME[c.shift] ?? c.shift} ${c.assigned}/${c.required}`).join(" · "),
        action: { label: "Fix first", onClick: () => onFixGap(tmr[0]) },
      });
    }

    // 2. Staff requests waiting on a manager
    const waiting = hub.staffRequests.filter((r) => r.status === "awaiting_approval");
    if (waiting.length) {
      soon.push({
        id: "requests",
        tone: "warn",
        icon: <Inbox />,
        title: `${waiting.length} staff request${waiting.length === 1 ? "" : "s"} waiting for you`,
        sub: waiting.slice(0, 3).map((r) => personName(hub.people.get(r.by))).join(", ") + (waiting.length > 3 ? ` and ${waiting.length - 3} more` : ""),
        action: { label: "Review", href: "/requests" },
      });
    }

    // 3. Departed flights with no filed record
    const unfiled = hub.ds.flights
      .filter((f) => f.date === today)
      .filter((f) => {
        const log = hub.logByFlight.get(f.id);
        const s = deriveStatus(f, log, today, hub.nowMin, timingsFor(hub.ds.airlines.find((a) => a.code === f.airline)));
        return s.status === "Departed" && log?.status !== "filed";
      });
    for (const f of unfiled.slice(0, 4)) {
      now.push({
        id: `unfiled-${f.id}`,
        tone: "warn",
        icon: <ClipboardX />,
        title: `${f.flightNo} departed but the record isn't filed`,
        sub: `STD ${f.std} · gate ${f.gate} · the lead still needs to file the gate log`,
        action: { label: "Open", href: `/gate/${f.id}` },
      });
    }

    // 4. Expired training for people rostered in the next 7 days
    const week = rangeDays(today, 7);
    const expiredOnRoster = hub.ds.people
      .filter((p) => (p.role === "agent" || p.role === "lead") && p.active !== false)
      .map((p) => ({ p, exp: p.training.filter((t) => t.expires < today && p.trainedAirlines.includes(t.airline)) }))
      .filter((x) => x.exp.length && week.some((d) => { const s = ctx.shift(x.p.id, d); return s === "E" || s === "M" || s === "L"; }));
    if (expiredOnRoster.length) {
      soon.push({
        id: "training",
        tone: "bad",
        icon: <GraduationCap />,
        title: `${expiredOnRoster.length} rostered this week with expired training`,
        sub: expiredOnRoster.slice(0, 2).map((x) => `${personName(x.p)} (${x.exp[0].course})`).join(", ") + (expiredOnRoster.length > 2 ? ` and ${expiredOnRoster.length - 2} more` : ""),
        action: { label: "View", href: `/agents/${expiredOnRoster[0].p.id}` },
      });
    }

    // 5. Open complaints from station managers
    const complaints = hub.feedback.filter((f) => f.kind === "complaint" && f.status === "open");
    if (complaints.length) {
      soon.push({
        id: "complaints",
        tone: "warn",
        icon: <MessageSquareWarning />,
        title: `${complaints.length} open complaint${complaints.length === 1 ? "" : "s"} from airlines`,
        sub: complaints.slice(0, 2).map((c) => `${c.airline}: ${c.summary}`).join(" · "),
        action: { label: "Respond", href: "/feedback" },
      });
    }

    // 6. Rampline alerts nobody has acknowledged
    for (const f of hub.ds.flights.filter((x) => x.date === today)) {
      const acks = hub.adviceFor(f.id).alertAcks ?? {};
      const open = hub.alertsFor(f.id).filter((a) => !acks[a.id]);
      if (!open.length) continue;
      now.unshift({
        id: `alert-${f.id}`,
        tone: "bad",
        icon: <Siren />,
        title: `Rampline alert on ${f.flightNo} not acknowledged`,
        sub: open[0].message ?? "Inbound alert from ramp operations",
        action: { label: "Open", href: `/gate/${f.id}` },
      });
    }

    // 7. Weeks starting in the next 14 days with no roster
    const weeks = [...new Set(rangeDays(addDays(today, 1), 14).map(weekStartOf))].filter((w) => w > today);
    for (const a of hub.ds.airlines.filter((x) => !x.charter)) {
      const members = teamMembers(hub.ds.people, a.code);
      if (!members.length) continue;
      for (const ws of weeks) {
        const days = rangeDays(ws, 7);
        if (members.every((m) => days.every((d) => ctx.shift(m.id, d) === undefined))) {
          later.push({
            id: `unrostered-${a.code}-${ws}`,
            tone: "brand",
            icon: <CalendarX2 />,
            title: `${a.name}: week of ${formatDate(ws, { day: "numeric", month: "short" })} isn't rostered`,
            sub: "Create the roster so staff can see their shifts",
            action: { label: "Roster", href: `/rosters?team=${a.code}&week=${ws}` },
          });
        }
      }
    }
    return [...now, ...soon, ...later];
  }, [hub, input, onFixGap]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = showAll ? items : items.slice(0, 6);
  const urgent = items.filter((i) => i.tone === "bad").length;

  return (
    <Card className={className}>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            Needs attention
            {items.length ? <Badge tone={urgent ? "bad" : "warn"}>{items.length}</Badge> : null}
          </CardTitle>
          <CardDescription>What to act on now: gaps, requests, records, training, complaints and alerts</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-5">
        {items.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl bg-ok-soft px-4 py-3 text-sm text-green-800">
            <CheckCircle2 className="size-5 shrink-0" />
            <span><span className="font-semibold">All clear.</span> No gaps, waiting requests, unfiled records or open alerts.</span>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-1 py-2.5">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg [&_svg]:size-[18px]", TONE[i.tone])}>{i.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{i.title}</p>
                  <p className="truncate text-xs text-muted">{i.sub}</p>
                </div>
                {i.action.href ? (
                  <Button size="sm" variant="outline" asChild><Link href={i.action.href}>{i.action.label}<ArrowRight /></Link></Button>
                ) : (
                  <Button size="sm" variant={i.tone === "bad" ? "primary" : "outline"} onClick={i.action.onClick}>{i.action.label}</Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {items.length > 6 ? (
          <button onClick={() => setShowAll((v) => !v)} className="mx-1 mt-1 cursor-pointer text-xs font-semibold text-brand-700 transition-colors hover:text-brand-500">
            {showAll ? "Show fewer" : `Show all ${items.length}`}
          </button>
        ) : null}
      </CardContent>
    </Card>
  );
}
