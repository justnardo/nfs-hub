"use client";
import * as React from "react";
import { Star } from "lucide-react";
import { Button, Dialog, DialogContent, Input, Label, Select, Textarea, cn } from "@nfs/ui";
import { addDays, formatDate, type FeedbackItem } from "@nfs/db";
import { useHub } from "@/lib/store";
import { FEEDBACK_CATEGORIES, recentFlights } from "@/lib/feedback";

export function Stars({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex" aria-label={`${n} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} style={{ width: size, height: size }} className={i <= n ? "fill-gold-500 text-gold-500" : "text-ink-300"} />)}
    </span>
  );
}

export function StarPicker({ value, onChange, size = 30 }: { value: number; onChange: (n: number) => void; size?: number }) {
  const [hover, setHover] = React.useState(0);
  const labels = ["", "Poor", "Below expectations", "OK", "Good", "Excellent"];
  return (
    <div>
      <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" onMouseEnter={() => setHover(i)} onClick={() => onChange(i)} aria-label={`${i} star${i > 1 ? "s" : ""}`} className="cursor-pointer rounded-md p-0.5 transition-transform hover:scale-110">
            <Star style={{ width: size, height: size }} className={i <= (hover || value) ? "fill-gold-500 text-gold-500" : "text-ink-300"} />
          </button>
        ))}
      </div>
      <p className="mt-1 h-4 text-xs font-semibold text-muted">{labels[hover || value]}</p>
    </div>
  );
}

/** For supervisors and managers: record what a station manager said by email, phone or in person. */
export function LogFeedbackDialog({ onClose, airline: initialAirline }: { onClose: () => void; airline?: string }) {
  const hub = useHub();
  const airlines = hub.ds.airlines.filter((a) => !a.charter);
  const [airline, setAirline] = React.useState(initialAirline ?? airlines[0]?.code ?? "");
  const a = hub.ds.airlines.find((x) => x.code === airline);
  const flights = recentFlights(hub.ds.flights, airline, hub.today, hub.nowMin, addDays);
  const [flightId, setFlightId] = React.useState<string>("");
  const [kind, setKind] = React.useState<FeedbackItem["kind"]>("complaint");
  const [rating, setRating] = React.useState(0);
  const [category, setCategory] = React.useState<string>(FEEDBACK_CATEGORIES[0]);
  const [source, setSource] = React.useState<"email" | "phone" | "in person">("email");
  const [from, setFrom] = React.useState(a?.stationManager.name ?? "");
  const [summary, setSummary] = React.useState("");
  React.useEffect(() => {
    setFrom(hub.ds.airlines.find((x) => x.code === airline)?.stationManager.name ?? "");
    setFlightId("");
  }, [airline, hub.ds.airlines]);
  const flight = flights.find((f) => f.id === flightId);
  const log = flightId ? hub.logByFlight.get(flightId) : undefined;
  const valid = !!airline && summary.trim().length > 4 && from.trim().length > 1;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl" title="Log airline feedback" description="Record what a station manager told you. Linking the flight puts the gate record beside the comment.">
        <div className="grid grid-cols-2 gap-1.5">
          {(["complaint", "praise"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={cn("cursor-pointer rounded-lg border py-2.5 text-sm font-semibold transition-colors", kind === k ? (k === "complaint" ? "border-red-300 bg-bad-soft text-red-800" : "border-green-300 bg-ok-soft text-green-900") : "border-line hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700")}>
              {k === "complaint" ? "Complaint" : "Compliment"}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><Label className="text-xs">Airline</Label><Select value={airline} onChange={(e) => setAirline(e.target.value)} className="mt-1 w-full">{airlines.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</Select></div>
          <div>
            <Label className="text-xs">Flight</Label>
            <Select value={flightId} onChange={(e) => setFlightId(e.target.value)} className="mt-1 w-full">
              <option value="">General (no single flight)</option>
              {flights.map((f) => <option key={f.id} value={f.id}>{f.flightNo} · {f.date === hub.today ? "today" : formatDate(f.date)} · {f.std}</option>)}
            </Select>
          </div>
          <div><Label className="text-xs">About</Label><Select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full">{FEEDBACK_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></div>
          <div><Label className="text-xs">Received by</Label><Select value={source} onChange={(e) => setSource(e.target.value as typeof source)} className="mt-1 w-full"><option value="email">Email</option><option value="phone">Phone call</option><option value="in person">In person</option></Select></div>
          <div className="sm:col-span-2"><Label className="text-xs">From</Label><Input value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" placeholder="Station manager's name" /></div>
        </div>
        <div className="mt-3"><Label className="text-xs">Rating (optional)</Label><div className="mt-1"><StarPicker value={rating} onChange={setRating} size={24} /></div></div>
        <Label className="mt-1 block text-xs">What they said</Label>
        <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} className="mt-1" placeholder="In their words, as closely as you can" />
        {flight ? <p className="mt-2 text-xs text-muted">Gate record: {log ? `${log.status === "filed" ? "filed" : "open"} · ${log.delayMinutes ? `+${log.delayMinutes} min${log.delayCause ? `, ${log.delayCause.toLowerCase()}` : ""}` : "on time"}` : "no gate log for this flight"}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!valid}
            onClick={() => {
              const leadId = log?.leadId;
              hub.logFeedback({ date: flight?.date ?? hub.today, airline, flightId: flightId || null, kind, from: from.trim(), summary: summary.trim(), personIds: leadId ? [leadId] : [], rating: rating || undefined, category, source, loggedBy: hub.session?.name });
              onClose();
            }}
          >
            Log feedback
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
