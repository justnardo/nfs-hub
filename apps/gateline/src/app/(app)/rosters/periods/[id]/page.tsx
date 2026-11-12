"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, ExternalLink, FileText, Link2, Link2Off, Loader2, MessageCircle, Send, Trash2 } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, PageHeader, Select, cn } from "@nfs/ui";
import { ROLE_LABEL, can } from "@nfs/auth";
import { addDays, formatDate, rangeDays } from "@nfs/db";
import { CoverageContext, check } from "@nfs/rules";
import { RequirePerm } from "@/components/guard";
import { RosterGrid } from "@/components/roster-grid";
import { useEngineInput, useHub } from "@/lib/store";
import { periodDays, periodEnd, periodHealth, periodShift, rosterSections, teamLabel, teamMembers, withPeriod } from "@/lib/periods";
import { downloadRosterPdf } from "@/lib/pdf";

export default function PeriodPage() {
  return (
    <RequirePerm perm="roster.view">
      <Period />
    </RequirePerm>
  );
}

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Period() {
  const { id } = useParams<{ id: string }>();
  const hub = useHub();
  const router = useRouter();
  const live = useEngineInput();
  const p = hub.periods.find((x) => x.id === id);
  const editable = can(hub.session?.role, "roster.edit");
  const publisher = can(hub.session?.role, "roster.publish");
  const [team, setTeam] = React.useState<string | null>(null);
  const [week, setWeek] = React.useState(0);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [confirmPublish, setConfirmPublish] = React.useState(false);

  // Draft: preview with the period applied. Published: it is already the live roster (plus later hand changes).
  const input = React.useMemo(() => (p && p.status === "draft" ? withPeriod(live, p) : live), [live, p]);
  const ctx = React.useMemo(() => new CoverageContext(input), [input]);
  const health = React.useMemo(() => (p ? periodHealth(input, p, hub.rules, hub.today) : null), [input, p, hub.rules, hub.today]);

  if (!hub.synced && !p) return <p className="p-6 text-sm text-muted">Loading roster…</p>;
  if (!p || (p.status === "draft" && !editable)) {
    return (
      <Card className="mx-auto mt-10 max-w-md">
        <CardContent className="py-10 text-center">
          <p className="font-semibold">Roster not found</p>
          <p className="mt-1 text-sm text-muted">It may have been deleted, or it hasn&apos;t been published yet.</p>
          <Button asChild variant="outline" className="mt-4"><Link href="/rosters">Back to rosters</Link></Button>
        </CardContent>
      </Card>
    );
  }

  const activeTeam = team && p.teams.includes(team) ? team : (hub.me && p.teams.find((t) => teamMembers(input.people, t).some((m) => m.id === hub.me!.id))) ?? p.teams[0];
  const ws = addDays(p.start, week * 7);
  const days = rangeDays(ws, 7);
  const members = teamMembers(input.people, activeTeam).filter((m) => p.grid[m.id] !== undefined || p.status === "published");
  const airline = input.airlines.find((a) => a.code === activeTeam);
  const findings = check(input, { from: ws, days: 7, personIds: members.map((m) => m.id), airlines: airline ? [airline.code] : [], rules: hub.rules }, ctx);
  const title = p.teams.length > 3 ? "All teams" : p.teams.map((t) => teamLabel(t, hub.ds.airlines)).join(", ");
  const dateRange = `${formatDate(p.start, { day: "numeric", month: "short" })} – ${formatDate(periodEnd(p), { day: "numeric", month: "short", year: "numeric" })}`;
  const changedSincePublish = (pid: string, d: string) => p.status === "published" && periodShift(p, pid, d) !== undefined && ctx.shift(pid, d) !== periodShift(p, pid, d);
  const changedCount = p.status === "published" ? Object.keys(p.grid).reduce((s, pid) => s + periodDays(p).filter((d) => changedSincePublish(pid, d)).length, 0) : 0;

  const pdf = async () => {
    setPdfBusy(true);
    try {
      await downloadRosterPdf({
        title: `${title} · Passenger Service roster`,
        subtitle: `${dateRange} · ${p.weeks} week${p.weeks > 1 ? "s" : ""}${p.note ? ` · ${p.note}` : ""}`,
        status: p.status,
        meta: p.status === "published" ? [`Published ${fmt(p.publishedAt!)} by ${p.publishedBy?.name}`, changedCount ? `Includes ${changedCount} change${changedCount > 1 ? "s" : ""} since publishing` : "No changes since publishing"] : [`Draft by ${p.createdBy.name}, ${fmt(p.createdAt)}`, "Not yet visible to staff"],
        sections: rosterSections(input, p.teams, p.start, p.weeks, hub.me?.id),
        filename: `NFS-roster-${p.teams.length > 3 ? "all" : p.teams.join("-")}-${p.start}${p.status === "draft" ? "-DRAFT" : ""}.pdf`,
      });
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/rosters" className="inline-flex items-center gap-1 transition-colors hover:text-brand-600"><ArrowLeft className="size-3.5" /> Rosters</Link>}
        title={title}
        description={`${dateRange} · ${p.weeks} week${p.weeks > 1 ? "s" : ""}${p.note ? ` · ${p.note}` : ""}`}
        actions={
          <>
            <Button variant="outline" onClick={pdf} disabled={pdfBusy}>{pdfBusy ? <Loader2 className="animate-spin" /> : <FileText />} PDF</Button>
            {p.status === "published" && publisher ? <Button variant="outline" onClick={() => setShareOpen(true)}><Link2 /> {p.share ? "Share link" : "Share with staff"}</Button> : null}
            {p.status === "draft" && editable ? (
              <Button variant="outline" onClick={() => { hub.deletePeriod(p.id); router.push("/rosters"); }}><Trash2 /> Delete draft</Button>
            ) : null}
            {p.status === "draft" && publisher ? <Button onClick={() => setConfirmPublish(true)}><Send /> Publish</Button> : null}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={p.status === "published" ? "ok" : "warn"}>{p.status === "published" ? "Published" : "Draft · staff can't see it yet"}</Badge>
        <span className="text-muted">Created by {p.createdBy.name} ({ROLE_LABEL[p.createdBy.role]}) · {fmt(p.createdAt)}</span>
        {p.publishedBy ? <span className="text-muted">· Published by {p.publishedBy.name} · {fmt(p.publishedAt!)}</span> : null}
        {changedCount ? <Badge tone="warn">{changedCount} change{changedCount > 1 ? "s" : ""} since publishing</Badge> : null}
        {p.status === "draft" && editable && !publisher ? <span className="text-muted">· A manager publishes it</span> : null}
      </div>

      {health ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-4">
          {health.weeks.map((w, i) => (
            <button key={w.start} onClick={() => setWeek(i)} className={cn("cursor-pointer rounded-xl border bg-card p-3 text-left transition-colors hover:border-brand-400", week === i ? "border-brand-500 ring-2 ring-brand-100" : "border-line")}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Week {i + 1} · {formatDate(w.start, { day: "numeric", month: "short" })}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Badge tone={w.gaps ? "bad" : "ok"}>{w.gaps} gap{w.gaps === 1 ? "" : "s"}</Badge>
                <Badge tone={w.hard ? "bad" : "ok"}>{w.hard} rule break{w.hard === 1 ? "" : "s"}</Badge>
                {w.soft ? <Badge tone="warn">{w.soft} to review</Badge> : null}
              </div>
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-5 @5xl/main:grid-cols-[1fr_320px]">
        <Card className="min-w-0">
          <CardHeader>
            <div>
              <CardTitle>Week of {formatDate(ws, { day: "numeric", month: "long" })}</CardTitle>
              <CardDescription>{p.status === "draft" ? (editable ? "Click any cell to change the draft. Every change is logged." : "Draft") : "Live roster for these dates. Make day-to-day changes on the Rosters page."}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {p.teams.length > 1 ? (
                <Select value={activeTeam} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
                  {p.teams.map((t) => <option key={t} value={t}>{teamLabel(t, hub.ds.airlines)}</option>)}
                </Select>
              ) : null}
              {p.status === "published" && editable ? <Button variant="outline" size="sm" asChild><Link href={`/rosters?team=${activeTeam}&week=${ws}`}>Edit live</Link></Button> : null}
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:px-5">
            <RosterGrid
              members={members}
              days={days}
              shiftOf={(pid, d) => ctx.shift(pid, d)}
              ctx={ctx}
              airlineCode={airline?.code}
              today={hub.today}
              editable={p.status === "draft" && editable}
              onPick={(pid, d, s) => hub.editPeriodCells(p.id, [{ personId: pid, date: d, shift: s }])}
              highlightId={hub.me?.id}
              changed={changedSincePublish}
            />
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader><div><CardTitle>Rule checks</CardTitle><CardDescription>{airline?.name ?? teamLabel(activeTeam, hub.ds.airlines)} · this week</CardDescription></div></CardHeader>
            <CardContent className="space-y-1.5">
              {findings.length === 0 ? <p className="flex items-center gap-2 text-sm text-ok"><Check className="size-4" /> All rules clear</p> : null}
              {findings.slice(0, 8).map((v, i) => (
                <p key={i} className={cn("rounded-md px-2 py-1 text-xs", v.severity === "hard" ? "bg-bad-soft text-red-900" : "bg-warn-soft text-amber-900")}>{v.message}</p>
              ))}
              {findings.length > 8 ? <p className="text-xs text-muted">+{findings.length - 8} more</p> : null}
            </CardContent>
          </Card>
          {p.status === "published" && p.share ? (
            <Card>
              <CardHeader><div><CardTitle>Shared with staff</CardTitle><CardDescription>Read-only link · works until {formatDate(p.share.expires, { day: "numeric", month: "short" })}</CardDescription></div></CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full" asChild><a href={`/r/${p.share.token}`} target="_blank" rel="noreferrer"><ExternalLink /> Open staff view</a></Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {confirmPublish ? (
        <Dialog open onOpenChange={(v) => !v && setConfirmPublish(false)}>
          <DialogContent className="max-w-md" title="Publish this roster?" description={`${title} · ${dateRange}. It becomes the live roster and staff see it on their schedule.`}>
            {health && (health.hard || health.gaps) ? (
              <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-amber-900">It still has {health.gaps} coverage gap{health.gaps === 1 ? "" : "s"} and {health.hard} rule break{health.hard === 1 ? "" : "s"}. You can publish and fix them on the live roster.</p>
            ) : (
              <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-green-900">Covered, with no rule breaks.</p>
            )}
            <p className="mt-3 text-xs text-muted">Hand changes already made inside these dates are replaced. Past days and booked leave are kept.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmPublish(false)}>Cancel</Button>
              <Button onClick={() => { hub.publishPeriod(p.id); setConfirmPublish(false); setShareOpen(true); }}><Send /> Publish</Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
      {shareOpen ? <ShareDialog periodId={p.id} onClose={() => setShareOpen(false)} /> : null}
    </>
  );
}

function ShareDialog({ periodId, onClose }: { periodId: string; onClose: () => void }) {
  const hub = useHub();
  const p = hub.periods.find((x) => x.id === periodId);
  const [copied, setCopied] = React.useState(false);
  if (!p) return null;
  const url = p.share ? `${window.location.origin}/r/${p.share.token}` : null;
  const msg = url ? `Your NFS roster for ${formatDate(p.start, { day: "numeric", month: "short" })} – ${formatDate(periodEnd(p), { day: "numeric", month: "short" })} is out. Find your name here: ${url}` : "";
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" title="Share with staff" description="A read-only link. Agents find their name, see their shifts and add them to their phone calendar. No sign-in needed.">
        {url ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{url}</span>
              <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}</Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" asChild><a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a></Button>
              <Button variant="outline" asChild><a href={url} target="_blank" rel="noreferrer"><ExternalLink /> Open</a></Button>
            </div>
            <p className="text-xs text-muted">Works until {formatDate(p.share!.expires, { weekday: "short", day: "numeric", month: "short" })}, the end of the roster. Shows names and shifts only. Later changes show up automatically.</p>
            <button onClick={() => hub.setShareLink(p.id, false)} className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-bad transition-colors hover:text-red-800"><Link2Off className="size-3.5" /> Revoke link</button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">No link yet for this roster.</p>
            <Button onClick={() => hub.setShareLink(p.id, true)}><Link2 /> Create share link</Button>
          </div>
        )}
        <div className="mt-5 flex justify-end"><Button variant="outline" onClick={onClose}>Done</Button></div>
      </DialogContent>
    </Dialog>
  );
}
