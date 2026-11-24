"use client";
import * as React from "react";
import Link from "next/link";
import { Pagination, usePaged } from "@/components/pagination";
import { Check, Copy, Link2, Mail, MessageSquarePlus, Phone, ThumbsDown, ThumbsUp, User } from "lucide-react";
import { Badge, Button, Card, Dialog, DialogContent, Input, PageHeader, Select, Stat, Textarea, cn } from "@nfs/ui";
import { can } from "@nfs/auth";
import { formatDate } from "@nfs/db";
import { useHub, personName } from "@/lib/store";
import { RequirePerm } from "@/components/guard";
import { AirlineChip } from "@/components/ops";
import { LogFeedbackDialog, Stars } from "@/components/feedback";
import { FeedbackCalendar } from "@/components/feedback-calendar";
import { FEEDBACK_SOURCES } from "@/lib/feedback";
import type { FeedbackItem } from "@nfs/db";

const SOURCE_ICON = { link: Link2, email: Mail, phone: Phone, "in person": User, seed: Mail } as const;

export default function FeedbackPage() {
  return (
    <RequirePerm perm="analytics.view">
      <Feedback />
    </RequirePerm>
  );
}

function Feedback() {
  const hub = useHub();
  const [airline, setAirline] = React.useState("");
  const [kind, setKind] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [logging, setLogging] = React.useState(false);
  const [responding, setResponding] = React.useState<FeedbackItem | null>(null);
  const [links, setLinks] = React.useState(false);
  const [day, setDay] = React.useState<string | null>(null);
  const map = new Map(hub.ds.airlines.map((a) => [a.code, a]));
  const filtered = hub.feedback.filter((f) => (!airline || f.airline === airline) && (!kind || f.kind === kind) && (!status || f.status === status));
  const items = day ? filtered.filter((f) => f.date === day) : filtered;
  const manage = can(hub.session?.role, "feedback.manage");
  const canLog = manage || can(hub.session?.role, "roster.edit");
  const paged = usePaged(items, 10, [airline, kind, status, day]);
  const rated = hub.feedback.filter((f) => f.rating);
  const avg = rated.length ? rated.reduce((s, f) => s + (f.rating ?? 0), 0) / rated.length : 0;
  const top = React.useRef<HTMLDivElement>(null);

  return (
    <>
      <PageHeader eyebrow="Airline feedback log" title="Station manager feedback" description="What airline station managers tell us about our service: sent through their private feedback link, or logged by a supervisor when they email or call. Each comment sits beside the flight's gate record."
        actions={
          <div className="flex flex-wrap gap-2">
            {manage ? <Button variant="outline" onClick={() => setLinks(true)}><Link2 className="size-4" /> Station manager links</Button> : null}
            {canLog ? <Button onClick={() => setLogging(true)}><MessageSquarePlus className="size-4" /> Log feedback</Button> : null}
          </div>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Praise" value={hub.feedback.filter((f) => f.kind === "praise").length} tone="ok" icon={<ThumbsUp />} />
        <Stat label="Complaints" value={hub.feedback.filter((f) => f.kind === "complaint").length} tone="bad" icon={<ThumbsDown />} />
        <Stat label="Open" value={hub.feedback.filter((f) => f.status === "open").length} tone="warn" />
        <Stat label="Average rating" value={rated.length ? `${avg.toFixed(1)} / 5` : "–"} sub={rated.length ? `${rated.length} rated` : "No ratings yet"} tone="brand" />
      </div>
      <Card className="mb-4 flex flex-wrap gap-2 p-3">
        <Select value={airline} onChange={(e) => setAirline(e.target.value)} aria-label="Airline"><option value="">All airlines</option>{hub.ds.airlines.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</Select>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type"><option value="">Praise and complaints</option><option value="praise">Praise</option><option value="complaint">Complaints</option></Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">Any status</option><option value="open">Open</option><option value="reviewed">Reviewed</option><option value="closed">Closed</option></Select>
      </Card>
      <div className="grid items-start gap-4 @4xl/main:grid-cols-[19rem_1fr]">
      <div className="@4xl/main:sticky @4xl/main:top-20">
        <FeedbackCalendar items={filtered} today={hub.today} minDate={hub.ds.windowStart} selected={day} onSelect={setDay} />
      </div>
      <div ref={top} className="min-w-0 scroll-mt-20 space-y-2.5">
        {day ? (
          <p className="flex items-center justify-between px-1 text-sm">
            <span><span className="font-semibold">{formatDate(day, { weekday: "long", day: "numeric", month: "long" })}</span> <span className="text-muted">· {items.length} comment{items.length === 1 ? "" : "s"}</span></span>
            <button onClick={() => setDay(null)} className="cursor-pointer text-xs font-semibold text-brand-700 transition-colors hover:text-brand-500">Show all dates</button>
          </p>
        ) : null}
        {!paged.rows.length ? <Card className="p-8 text-center text-sm text-muted">{day ? "No feedback on this day." : "No feedback matches these filters."}</Card> : null}
        {paged.rows.map((f) => {
          const Src = SOURCE_ICON[f.source ?? "seed"];
          const log = f.flightId ? hub.logByFlight.get(f.flightId) : undefined;
          const flight = hub.ds.flights.find((x) => x.id === f.flightId);
          return (
            <Card key={f.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", f.kind === "praise" ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad")}>
                {f.kind === "praise" ? <ThumbsUp className="size-4" /> : <ThumbsDown className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <AirlineChip airline={map.get(f.airline)!} />
                  <span>{formatDate(f.date)}</span>
                  <span>· from {f.from}</span>
                  {flight && log ? <Link href={`/records/${log.id}`} className="font-semibold text-brand-600 transition-colors hover:text-brand-700">{flight.flightNo} record</Link> : flight ? <span className="font-semibold">{flight.flightNo}</span> : null}
                  {f.personIds[0] ? <span>· lead {personName(hub.people.get(f.personIds[0]))}</span> : null}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {f.rating ? <Stars n={f.rating} /> : null}
                  {f.category ? f.category.split(", ").map((c) => <Badge key={c} tone="neutral">{c}</Badge>) : null}
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted"><Src className="size-3" /> {FEEDBACK_SOURCES[f.source ?? "seed"]}{f.loggedBy ? ` · logged by ${f.loggedBy}` : ""}</span>
                </div>
                <p className="mt-1 text-sm">{f.summary}</p>
                {f.contact ? <p className="mt-0.5 text-xs text-muted">Reply to: {f.contact}</p> : null}
                {f.response ? <p className="mt-1.5 rounded-md border-l-2 border-brand-400 bg-brand-50 px-2.5 py-1.5 text-xs text-brand-900"><span className="font-semibold">NFS response:</span> {f.response}</p> : null}
                {log ? <p className="mt-0.5 text-xs text-muted">Record: {log.delayMinutes ? `+${log.delayMinutes} min, ${log.delayCause}` : "on time"} · door close {log.events.door_close}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={f.status === "open" ? "warn" : f.status === "reviewed" ? "brand" : "neutral"}>{f.status}</Badge>
                {manage && f.status !== "closed" ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setResponding(f)}>{f.response ? "Edit response" : "Respond"}</Button>
                    <Button variant="outline" size="sm" onClick={() => hub.setFeedbackStatus(f.id, f.status === "open" ? "reviewed" : "closed")}>{f.status === "open" ? "Mark reviewed" : "Close"}</Button>
                  </>
                ) : null}
              </div>
            </Card>
          );
        })}
        <Pagination paged={paged} noun="comments" scrollTo={top} sizes={[10, 25, 50]} />
      </div>
      </div>
      {logging ? <LogFeedbackDialog airline={airline || undefined} onClose={() => setLogging(false)} /> : null}
      {responding ? <RespondDialog item={responding} onClose={() => setResponding(null)} /> : null}
      {links ? <LinksDialog onClose={() => setLinks(false)} /> : null}
    </>
  );
}

function RespondDialog({ item, onClose }: { item: FeedbackItem; onClose: () => void }) {
  const hub = useHub();
  const [text, setText] = React.useState(item.response ?? "");
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title="Record the response" description={`What NFS did or told ${item.from}. Saving marks it reviewed.`}>
        <p className="rounded-md bg-surface px-3 py-2 text-sm text-muted">&ldquo;{item.summary}&rdquo;</p>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="mt-3 min-h-24" placeholder="e.g. Spoke with the lead; wheelchair requests now confirmed at check-in close." />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" disabled={!text.trim()} onClick={() => { hub.setFeedbackStatus(item.id, "closed", text.trim()); onClose(); }}>Save and close</Button>
          <Button disabled={!text.trim()} onClick={() => { hub.setFeedbackStatus(item.id, item.status === "open" ? "reviewed" : item.status, text.trim()); onClose(); }}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LinksDialog({ onClose }: { onClose: () => void }) {
  const hub = useHub();
  const [copied, setCopied] = React.useState("");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const airlines = hub.ds.airlines.filter((a) => !a.charter);
  const copy = (code: string, url: string) => {
    void navigator.clipboard?.writeText(url);
    setCopied(code);
    setTimeout(() => setCopied(""), 1600);
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl" title="Station manager feedback links" description="One private link per airline. The station manager opens it on any device, rates a flight and comments, with no sign-in. Turning a link off and on again makes a new one, so old copies stop working.">
        <div className="max-h-[60vh] divide-y divide-line overflow-y-auto">
          {airlines.map((a) => {
            const url = a.feedbackToken ? `${origin}/f/${a.feedbackToken}` : "";
            return (
              <div key={a.code} className="flex flex-wrap items-center gap-3 py-2.5">
                <AirlineChip airline={a} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{a.name}</p>
                  <p className="truncate text-xs text-muted">{a.stationManager.name}{a.stationManager.email ? ` · ${a.stationManager.email}` : ""}</p>
                </div>
                {url ? (
                  <>
                    <Input readOnly value={url} className="h-8 w-full text-xs sm:w-56" onFocus={(e) => e.currentTarget.select()} aria-label={`${a.name} feedback link`} />
                    <Button size="sm" variant="outline" onClick={() => copy(a.code, url)}>{copied === a.code ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied === a.code ? "Copied" : "Copy"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => hub.setFeedbackLink(a.code, false)}>Turn off</Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => hub.setFeedbackLink(a.code, true)}><Link2 className="size-3.5" /> Create link</Button>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
