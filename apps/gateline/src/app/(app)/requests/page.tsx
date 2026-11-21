"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeftRight, CalendarPlus, Check, X } from "lucide-react";
import { Badge, Button, Card, Input, PageHeader, Stat, cn } from "@nfs/ui";
import { formatDate, rangeDays } from "@nfs/db";
import { isWork, SHIFT_TIMES } from "@nfs/rules";
import { RequirePerm } from "@/components/guard";
import { AirlineChip } from "@/components/ops";
import { useEngineInput, useHub, personName } from "@/lib/store";
import { ABSENCE_TYPES } from "@/lib/absence";
import { REQUEST_STATUS, checkSwap, type StaffRequest } from "@/lib/staff-requests";

const SHIFT_NAME: Record<string, string> = { E: "Early", L: "Late", M: "Mid", O: "Off", V: "Vacation" };
const day = (d: string) => formatDate(d, { weekday: "short", day: "numeric", month: "short" });

export default function RequestsPage() {
  return (
    <RequirePerm perm="roster.edit">
      <Requests />
    </RequirePerm>
  );
}

function Requests() {
  const hub = useHub();
  const [tab, setTab] = React.useState<"waiting" | "all">("waiting");
  const meTerm = hub.me?.role === "supervisor" ? hub.me.homeTerminal : null;
  const inScope = (r: StaffRequest) => !meTerm || hub.people.get(r.by)?.homeTerminal === meTerm;
  const all = hub.staffRequests.filter(inScope);
  const waiting = all.filter((r) => r.status === "awaiting_approval");
  const list = tab === "waiting" ? waiting : all;
  return (
    <>
      <PageHeader
        eyebrow="Planning"
        title="Staff requests"
        description="Shift swaps and leave that agents ask for from their phones. Swaps arrive once the colleague has agreed, with the rules already checked. Approving updates the roster and coverage straight away."
      />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Waiting for you" value={waiting.length} tone={waiting.length ? "warn" : "ok"} />
        <Stat label="With a colleague" value={all.filter((r) => r.status === "awaiting_colleague").length} />
        <Stat label="Decided" value={all.filter((r) => r.status === "approved" || r.status === "declined").length} />
      </div>
      <div className="mb-4 inline-flex rounded-lg border border-line bg-card p-1">
        {(["waiting", "all"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={cn("cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold transition-colors", tab === t ? "bg-brand-600 text-white" : "text-muted hover:bg-brand-50 hover:text-brand-700")}>
            {t === "waiting" ? `Waiting (${waiting.length})` : "All requests"}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {list.length === 0 ? <Card className="p-8 text-center text-sm text-muted">{tab === "waiting" ? "Nothing waiting. New swaps and leave requests appear here, and you get an alert." : "No requests yet."}</Card> : null}
        {list.map((r) => <RequestCard key={r.id} r={r} />)}
      </div>
    </>
  );
}

function RequestCard({ r }: { r: StaffRequest }) {
  const hub = useHub();
  const input = useEngineInput();
  const [note, setNote] = React.useState("");
  const a = hub.people.get(r.by);
  const airline = hub.ds.airlines.find((x) => x.code === a?.coreAirline);
  const st = REQUEST_STATUS[r.status];
  const waiting = r.status === "awaiting_approval";
  let detail: React.ReactNode = null;
  let checks: string[] = [];
  if (r.type === "swap") {
    const b = hub.people.get(r.with);
    if (waiting && a && b) checks = checkSwap(input, hub.rules, a, b, r.date, r.myShift, r.theirShift).map((v) => v.message);
    detail = (
      <>
        <p className="text-sm font-semibold">{personName(a)} <ArrowLeftRight className="inline size-3.5 text-muted" /> {personName(b)} · {day(r.date)}</p>
        <p className="text-xs text-muted">
          {personName(a)}: {SHIFT_NAME[r.myShift]} → {SHIFT_NAME[r.theirShift]} · {personName(b)}: {SHIFT_NAME[r.theirShift]} → {SHIFT_NAME[r.myShift]}
          {isWork(r.myShift) ? ` (${SHIFT_TIMES[r.myShift].start}–${SHIFT_TIMES[r.myShift].end})` : ""}
        </p>
      </>
    );
  } else {
    const days = rangeDays(r.from, Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86400000) + 1);
    const shifts = days.filter((d) => isWork(hub.ds.roster.find((x) => x.personId === r.by && x.date === d)?.shift)).length;
    detail = (
      <>
        <p className="text-sm font-semibold">{personName(a)} · {ABSENCE_TYPES[r.absenceType].label}</p>
        <p className="text-xs text-muted">{r.from === r.to ? day(r.from) : `${day(r.from)} – ${day(r.to)}`} · {days.length} day{days.length === 1 ? "" : "s"}, {shifts} rostered shift{shifts === 1 ? "" : "s"} to cover</p>
      </>
    );
  }
  return (
    <Card className={cn("p-4", waiting && "border-brand-300")}>
      <div className="flex flex-wrap items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", r.type === "swap" ? "bg-brand-50 text-brand-700" : "bg-gold-100 text-gold-700")}>
          {r.type === "swap" ? <ArrowLeftRight className="size-5" /> : <CalendarPlus className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          {detail}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {airline ? <AirlineChip airline={airline} /> : null}
            <Badge tone={st.tone}>{st.label}</Badge>
            <span className="text-[11px] text-muted">Asked {new Date(r.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "America/Nassau" })}{r.decidedBy ? ` · ${r.status} by ${r.decidedBy}` : ""}</span>
          </div>
          {r.note ? <p className="mt-1.5 text-sm">“{r.note}”</p> : null}
          {r.decisionNote ? <p className="mt-1 text-xs text-muted">Note: {r.decisionNote}</p> : null}
          {waiting && r.type === "swap" ? (
            checks.length ? <p className="mt-1.5 text-xs text-amber-800">Check: {checks[0].split(": ").slice(1).join(": ")}</p> : <p className="mt-1.5 flex items-center gap-1 text-xs text-green-800"><Check className="size-3.5" /> Rest, hours and training all within the rules. Coverage is unchanged.</p>
          ) : null}
          {waiting && r.type === "leave" ? <p className="mt-1.5 text-xs text-muted">Approving adds it to the roster; check <Link href="/coverage" className="font-semibold text-brand-600 hover:text-brand-700">SLA coverage</Link> for any gap it leaves.</p> : null}
        </div>
      </div>
      {waiting ? (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 sm:flex sm:items-center">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the agent (optional)" className="col-span-2 h-11 sm:h-10 sm:flex-1" />
          <Button variant="outline" className="h-11 sm:h-10" onClick={() => hub.decideRequest(r.id, false, note.trim())}><X className="size-4" /> Decline</Button>
          <Button className="h-11 sm:h-10" onClick={() => hub.decideRequest(r.id, true, note.trim())}><Check className="size-4" /> Approve</Button>
        </div>
      ) : null}
    </Card>
  );
}
