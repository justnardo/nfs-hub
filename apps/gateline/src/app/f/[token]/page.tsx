"use client";
import { AirlineReportButton } from "@/components/airline-report-button";
import * as React from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button, Card, Input, Label, Textarea, cn } from "@nfs/ui";
import { addDays, formatDate, type FeedbackItem } from "@nfs/db";
import { useHub } from "@/lib/store";
import { FEEDBACK_CATEGORIES, recentFlights } from "@/lib/feedback";
import { FirstGlanceCredit, NfsWordmark } from "@/components/brand";
import { AirlineChip } from "@/components/ops";
import { StarPicker } from "@/components/feedback";

/**
 * Station manager feedback, no sign-in: the airline's private link opens this page. They pick the
 * flight, rate it and comment; it lands in Gateline's feedback log and alerts the duty managers.
 */
export default function AirlineFeedbackPage() {
  const { token } = useParams<{ token: string }>();
  const hub = useHub();
  const airline = hub.ds.airlines.find((a) => a.feedbackToken && a.feedbackToken === token);
  const [flightId, setFlightId] = React.useState<string>("");
  const [rating, setRating] = React.useState(0);
  const [kind, setKind] = React.useState<FeedbackItem["kind"] | null>(null);
  const [cats, setCats] = React.useState<string[]>([]);
  const [summary, setSummary] = React.useState("");
  const [name, setName] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [sent, setSent] = React.useState(false);
  React.useEffect(() => {
    if (airline && !name) setName(airline.stationManager.name);
  }, [airline]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hub.ready || !hub.synced) {
    return <div className="grid min-h-dvh place-items-center bg-surface"><Loader2 className="size-6 animate-spin text-brand-500" /></div>;
  }
  if (!airline) {
    return (
      <Shell>
        <Card className="p-6 text-center">
          <p className="font-display text-lg font-semibold">This feedback link isn&apos;t active</p>
          <p className="mt-1 text-sm text-muted">Ask your Nassau Flight Services contact for a new link.</p>
        </Card>
      </Shell>
    );
  }

  const flights = recentFlights(hub.ds.flights, airline.code, hub.today, hub.nowMin, addDays).slice(0, 14);
  const flight = flights.find((f) => f.id === flightId);
  const effectiveKind: FeedbackItem["kind"] = kind ?? (rating && rating <= 2 ? "complaint" : "praise");
  const valid = rating > 0 && summary.trim().length > 4 && name.trim().length > 1;

  if (sent) {
    return (
      <Shell>
        <Card className="p-8 text-center">
          <CheckCircle2 className="mx-auto size-10 text-ok" />
          <p className="mt-3 font-display text-xl font-semibold">Thank you, {name.split(" ")[0]}</p>
          <p className="mt-1 text-sm text-muted">Your feedback{flight ? ` on ${flight.flightNo}` : ""} is with the Nassau Flight Services duty managers, alongside the flight&apos;s gate record.{effectiveKind === "complaint" ? " A manager will follow up with you." : ""}</p>
          <Button variant="outline" className="mt-5" onClick={() => { setSent(false); setRating(0); setKind(null); setCats([]); setSummary(""); setFlightId(""); }}>Send more feedback</Button>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card className="p-5 sm:p-6">
        <AirlineChip airline={airline} size="md" />
        <p className="mt-3 font-display text-xl font-semibold leading-tight">How did we do for {airline.name}?</p>
        <p className="mt-0.5 text-xs text-muted">Passenger services at Lynden Pindling International Airport</p>

        <Label className="mt-6 block text-xs">Which flight? (optional)</Label>
        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
          <button type="button" onClick={() => setFlightId("")} className={cn("shrink-0 cursor-pointer rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors", !flightId ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line hover:border-brand-400 hover:bg-brand-50")}>General</button>
          {flights.map((f) => (
            <button key={f.id} type="button" onClick={() => setFlightId(f.id)} className={cn("shrink-0 cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors", flightId === f.id ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line hover:border-brand-400 hover:bg-brand-50")}>
              <span className="block text-xs font-semibold">{f.flightNo}</span>
              <span className="block text-[11px] text-muted">{f.date === hub.today ? "Today" : formatDate(f.date, { weekday: "short", day: "numeric", month: "short" })} · {f.std}</span>
            </button>
          ))}
        </div>

        <Label className="mt-5 block text-xs">Overall</Label>
        <div className="mt-1"><StarPicker value={rating} onChange={setRating} /></div>

        <Label className="mt-3 block text-xs">Is this a compliment or a concern?</Label>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {(["praise", "complaint"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={cn("cursor-pointer rounded-lg border py-2.5 text-sm font-semibold transition-colors", effectiveKind === k && (kind || rating) ? (k === "complaint" ? "border-red-300 bg-bad-soft text-red-800" : "border-green-300 bg-ok-soft text-green-900") : "border-line hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700")}>
              {k === "praise" ? "Compliment" : "Concern"}
            </button>
          ))}
        </div>

        <Label className="mt-5 block text-xs">About (pick any)</Label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {FEEDBACK_CATEGORIES.map((c) => (
            <button key={c} type="button" onClick={() => setCats(cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c])} className={cn("cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors", cats.includes(c) ? "border-brand-500 bg-brand-500 text-white" : "border-line hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700")}>{c}</button>
          ))}
        </div>

        <Label htmlFor="fbtext" className="mt-5 block text-xs">Your comments</Label>
        <Textarea id="fbtext" value={summary} onChange={(e) => setSummary(e.target.value)} className="mt-1 min-h-28" placeholder="What went well, or what should we do differently?" />

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="fbname" className="text-xs">Your name</Label><Input id="fbname" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" /></div>
          <div><Label htmlFor="fbcontact" className="text-xs">Email or phone (optional)</Label><Input id="fbcontact" value={contact} onChange={(e) => setContact(e.target.value)} className="mt-1" placeholder="So a manager can reply" /></div>
        </div>

        <Button
          size="lg"
          className="mt-6 h-12 w-full text-base"
          disabled={!valid}
          onClick={() => {
            const log = flightId ? hub.logByFlight.get(flightId) : undefined;
            hub.logFeedback({
              date: flight?.date ?? hub.today,
              airline: airline.code,
              flightId: flightId || null,
              kind: effectiveKind,
              from: name.trim(),
              summary: summary.trim(),
              personIds: log?.leadId ? [log.leadId] : [],
              rating,
              category: cats.join(", ") || undefined,
              source: "link",
              contact: contact.trim() || undefined,
            });
            setSent(true);
          }}
        >
          Send feedback
        </Button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted"><ShieldCheck className="size-3.5" /> Private link for {airline.name}. Goes only to Nassau Flight Services managers.</p>
      </Card>
      <Card className="mt-4 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display font-semibold">Your monthly service report</p>
          <p className="mt-0.5 text-xs text-muted">On-time results, delay causes and every {airline.code} flight we handled, as a PDF.</p>
        </div>
        <AirlineReportButton airline={airline} label="Download" preparedBy="NFS Passenger Services" />
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface px-4 py-8">
      <div className="mx-auto max-w-lg">
        <div className="mb-5 flex justify-center"><NfsWordmark /></div>
        {children}
        <div className="mt-6 flex justify-center"><FirstGlanceCredit /></div>
      </div>
    </div>
  );
}
