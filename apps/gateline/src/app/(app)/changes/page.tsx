"use client";
import * as React from "react";
import Link from "next/link";
import { Download, RotateCcw, Search } from "lucide-react";
import { Avatar, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, PageHeader, Select, cn } from "@nfs/ui";
import { ROLE_LABEL } from "@nfs/auth";
import { addDays, formatDate, type Role } from "@nfs/db";
import { RequirePerm } from "@/components/guard";
import { useHub } from "@/lib/store";
import { ACTION_LABEL, UNDOABLE, allTeams, teamLabel, type AuditAction, type AuditEntry } from "@/lib/periods";

export default function ChangesPage() {
  return (
    <RequirePerm perm="audit.view">
      <Changes />
    </RequirePerm>
  );
}

const GROUPS: { id: string; label: string; actions: AuditAction[] }[] = [
  { id: "shifts", label: "Shift changes", actions: ["shift.change", "shift.revert", "roster.optimise", "roster.fix"] },
  { id: "moves", label: "Agent moves", actions: ["cover.move", "cover.cancel"] },
  { id: "teams", label: "Team & role", actions: ["team.assign"] },
  { id: "periods", label: "Rosters & sharing", actions: ["period.create", "period.edit", "period.publish", "period.delete", "share.create", "share.revoke"] },
  { id: "config", label: "Airlines, schedule, rules", actions: ["airline.change", "schedule.change", "rules.change"] },
  { id: "undo", label: "Undos", actions: ["undo"] },
];

const TONE: Partial<Record<AuditAction, "ok" | "warn" | "bad" | "neutral">> = {
  "period.publish": "ok",
  "cover.move": "warn",
  "team.assign": "warn",
  "roster.fix": "ok",
  undo: "bad",
  "share.revoke": "bad",
  "period.delete": "bad",
};

function Changes() {
  const hub = useHub();
  const [who, setWho] = React.useState<"all" | Role | string>("all");
  const [team, setTeam] = React.useState("all");
  const [group, setGroup] = React.useState("all");
  const [range, setRange] = React.useState<"today" | "7" | "30" | "all">("7");
  const [q, setQ] = React.useState("");
  React.useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("team");
    if (t) setTeam(t);
  }, []);

  const since = range === "all" ? "" : range === "today" ? hub.today : addDays(hub.today, -Number(range));
  const list = hub.audit.filter((e) => {
    if (who !== "all" && e.actor.role !== who && e.actor.id !== who) return false;
    if (team !== "all" && !e.teams?.includes(team)) return false;
    if (group !== "all" && !GROUPS.find((g) => g.id === group)!.actions.includes(e.action)) return false;
    if (since && e.at.slice(0, 10) < since) return false;
    if (q.trim() && !`${e.summary} ${e.actor.name} ${e.reason ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });

  // Who's been changing things (by person), for the selected window
  const windowed = hub.audit.filter((e) => !since || e.at.slice(0, 10) >= since);
  const byActor = new Map<string, { name: string; role: Role; n: number; id: string }>();
  for (const e of windowed) {
    const cur = byActor.get(e.actor.id) ?? { name: e.actor.name, role: e.actor.role, n: 0, id: e.actor.id };
    cur.n++;
    byActor.set(e.actor.id, cur);
  }
  const actors = [...byActor.values()].sort((a, b) => b.n - a.n);
  const supervisorChanges = windowed.filter((e) => e.actor.role === "supervisor" && e.action !== "undo").length;
  const shiftCells = windowed.reduce((s, e) => s + (["shift.change", "shift.revert", "roster.optimise", "roster.fix"].includes(e.action) ? e.cells?.length ?? 0 : 0), 0);
  const moves = windowed.filter((e) => e.action === "cover.move").length;
  const overrides = windowed.filter((e) => e.reason).length;

  const exportCsv = () => {
    const rows = [["When", "Who", "Role", "Action", "Change", "Teams", "Reason", "Undone"]];
    for (const e of list) rows.push([e.at, e.actor.name, ROLE_LABEL[e.actor.role], ACTION_LABEL[e.action], e.summary, (e.teams ?? []).join(" "), e.reason ?? "", e.undone ? `by ${e.undone.by}` : ""]);
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `gateline-change-log-${hub.today}.csv`;
    a.click();
  };

  return (
    <>
      <PageHeader
        eyebrow="Accountability"
        title="Change log"
        description="Every roster change, agent move, team assignment and publish — who did it, when, and why. Undo a change straight from here."
        actions={<Button variant="outline" onClick={exportCsv} disabled={!list.length}><Download /> CSV</Button>}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        {[
          { label: "Changes by supervisors", value: supervisorChanges },
          { label: "Shifts changed", value: shiftCells },
          { label: "Agents moved", value: moves },
          { label: "With an override reason", value: overrides },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{k.label}</p>
              <p className="mt-1 font-display text-2xl font-semibold tabular">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <Card className="min-w-0">
          <CardHeader className="flex-wrap gap-2">
            <div><CardTitle>Changes</CardTitle><CardDescription>{list.length} shown</CardDescription></div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or change" className="h-9 w-48 pl-8" aria-label="Search changes" />
              </div>
              <Select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Who" className="h-9">
                <option value="all">Everyone</option>
                <option value="supervisor">Supervisors</option>
                <option value="manager">Managers</option>
                <option value="admin">Super Admin</option>
                {actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
              <Select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team" className="h-9">
                <option value="all">All teams</option>
                {allTeams(hub.ds.airlines).map((t) => <option key={t} value={t}>{teamLabel(t, hub.ds.airlines)}</option>)}
              </Select>
              <Select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Type" className="h-9">
                <option value="all">All types</option>
                {GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </Select>
              <Select value={range} onChange={(e) => setRange(e.target.value as typeof range)} aria-label="Period" className="h-9">
                <option value="today">Today</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="all">All time</option>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {list.length === 0 ? <p className="py-8 text-center text-sm text-muted">No changes match. Changes appear here as soon as anyone edits a roster, moves an agent or publishes.</p> : null}
            {list.map((e) => <Row key={e.id} e={e} />)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div><CardTitle>Who changed what</CardTitle><CardDescription>{range === "all" ? "All time" : range === "today" ? "Today" : `Last ${range} days`}</CardDescription></div></CardHeader>
          <CardContent className="space-y-1.5">
            {actors.length === 0 ? <p className="text-sm text-muted">Nobody yet.</p> : null}
            {actors.map((a) => (
              <button key={a.id} onClick={() => setWho(who === a.id ? "all" : a.id)} className={cn("flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:border-brand-400 hover:bg-brand-50", who === a.id ? "border-brand-500 bg-brand-50" : "border-line")}>
                <Avatar name={a.name} src={hub.people.get(a.id)?.photoUrl} className="size-8" tone={a.role === "supervisor" ? "dark" : "brand"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{a.name}</p>
                  <p className="text-xs text-muted">{ROLE_LABEL[a.role]}</p>
                </div>
                <span className="font-display text-lg font-semibold tabular">{a.n}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Row({ e }: { e: AuditEntry }) {
  const hub = useHub();
  const [msg, setMsg] = React.useState<string | null>(null);
  const undoable = UNDOABLE.includes(e.action) && !e.undone;
  const periodLink = e.ref && (e.action.startsWith("period.") || e.action.startsWith("share.")) ? hub.periods.find((p) => p.id === e.ref) : undefined;
  return (
    <div className={cn("flex gap-3 rounded-lg border border-line p-3", e.undone && "bg-surface")}>
      <Avatar name={e.actor.name} src={hub.people.get(e.actor.id)?.photoUrl} className="size-9 shrink-0" tone={e.actor.role === "supervisor" ? "dark" : "brand"} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={TONE[e.action] ?? "neutral"}>{ACTION_LABEL[e.action]}</Badge>
          {(e.teams ?? []).slice(0, 3).map((t) => <span key={t} className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-bold text-muted">{t}</span>)}
          {e.undone ? <Badge tone="bad">Undone by {e.undone.by}</Badge> : null}
        </div>
        <p className={cn("mt-1 text-sm font-medium", e.undone && "line-through opacity-60")}>{e.summary}</p>
        {e.cells && e.cells.length > 1 ? (
          <details className="mt-1 text-xs text-muted">
            <summary className="cursor-pointer font-semibold text-brand-600">{e.cells.length} shifts</summary>
            <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
              {e.cells.map((c) => {
                const p = hub.people.get(c.personId);
                return <li key={c.personId + c.date}>{p ? `${p.firstName} ${p.lastName}` : c.personId} · {formatDate(c.date, { weekday: "short", day: "numeric", month: "short" })}: {c.from ?? "—"} → {c.to ?? "—"}</li>;
              })}
            </ul>
          </details>
        ) : null}
        {e.reason ? <p className="mt-1 rounded bg-warn-soft px-2 py-1 text-xs text-amber-900">Reason: {e.reason}</p> : null}
        <p className="mt-1 text-xs text-muted">
          {e.actor.name} · {ROLE_LABEL[e.actor.role]} · {new Date(e.at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          {periodLink ? <> · <Link href={`/rosters/periods/${periodLink.id}`} className="font-semibold text-brand-600 hover:text-brand-700">Open roster</Link></> : null}
        </p>
        {msg ? <p className="mt-1 text-xs text-muted">{msg}</p> : null}
      </div>
      {undoable ? (
        <Button variant="outline" size="sm" className="shrink-0 self-start" onClick={() => setMsg(hub.undo(e.id) ? null : "Nothing left to undo — it was already changed again.")}>
          <RotateCcw /> Undo
        </Button>
      ) : null}
    </div>
  );
}
