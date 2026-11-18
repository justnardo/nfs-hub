"use client";
import * as React from "react";
import Link from "next/link";
import { GraduationCap, X } from "lucide-react";
import { Button, Dialog, DialogContent, Input, Label, Select, Textarea, cn } from "@nfs/ui";
import { addDays, formatDate, type Airline, type Person } from "@nfs/db";
import { ABSENCE_TYPES, type Absence, type AbsenceType } from "@/lib/absence";
import { useHub, personName } from "@/lib/store";

export function AbsenceChip({ a }: { a: Absence }) {
  const t = ABSENCE_TYPES[a.type];
  return <span className={cn("inline-grid h-7 min-w-9 place-items-center rounded-md px-1.5 text-[10px] font-bold tracking-wide", t.tone)}>{t.short}</span>;
}

/** Record a call-out, leave, maternity and so on for one person. */
export function AbsenceDialog({ person, date, absence, onClose }: { person: Person; date: string; absence?: Absence; onClose: () => void }) {
  const hub = useHub();
  const [type, setType] = React.useState<AbsenceType>(absence?.type ?? (date <= hub.today ? "sick" : "annual"));
  const [from, setFrom] = React.useState(absence?.from ?? date);
  const [to, setTo] = React.useState(absence?.to ?? date);
  const [note, setNote] = React.useState(absence?.note ?? "");
  const [touchedTo, setTouchedTo] = React.useState(!!absence);
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && to >= from;
  const pick = (t: AbsenceType) => {
    setType(t);
    if (!touchedTo) setTo(addDays(from, ABSENCE_TYPES[t].days - 1));
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`${absence ? "Absence" : "Mark absent"} · ${personName(person)}`} description="Their shifts in these dates come off the roster; coverage shows any gap at once so a supervisor can place a cover.">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {(Object.keys(ABSENCE_TYPES) as AbsenceType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => pick(t)}
              className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs font-semibold transition-colors", type === t ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700")}
            >
              <span className={cn("grid h-6 min-w-10 place-items-center rounded px-1 text-[9.5px] font-bold", ABSENCE_TYPES[t].tone)}>{ABSENCE_TYPES[t].short}</span>
              {ABSENCE_TYPES[t].label}
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div><Label htmlFor="afrom" className="text-xs">From</Label><Input id="afrom" type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (!touchedTo || to < e.target.value) setTo(addDays(e.target.value, Math.max(0, days - 1))); }} className="mt-1" /></div>
          <div><Label htmlFor="ato" className="text-xs">To (last day)</Label><Input id="ato" type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setTouchedTo(true); }} className="mt-1" /></div>
        </div>
        <p className="mt-1.5 text-xs text-muted">{valid ? `${days} day${days > 1 ? "s" : ""} · ${formatDate(from)} to ${formatDate(to)}` : "Check the dates"}</p>
        <Label htmlFor="anote" className="mt-3 block text-xs">Note (optional)</Label>
        <Textarea id="anote" value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" placeholder={type === "sick" ? "e.g. called the duty office at 03:40, doctor's note to follow" : "e.g. approved by the manager"} />
        <div className="mt-4 flex items-center justify-between gap-2">
          {absence ? <Button variant="ghost" className="text-bad hover:bg-bad-soft hover:text-red-800" onClick={() => { hub.removeAbsence(absence.id); onClose(); }}>Remove absence</Button> : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={!valid} onClick={() => { hub.saveAbsence({ id: absence?.id, personId: person.id, type, from, to, note: note.trim() || undefined }); onClose(); }}>{absence ? "Save" : "Mark absent"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** "Training expired" badge that opens the courses behind it. */
export function TrainingBadge({ person, airline, asOf }: { person: Person; airline: Airline; asOf: string }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const rows = airline.requiredTraining.map((course) => {
    const rec = person.training.filter((t) => t.airline === airline.code && t.course === course).sort((a, b) => b.expires.localeCompare(a.expires))[0];
    return { course, rec, expired: !rec || rec.expires < asOf, soon: !!rec && rec.expires >= asOf && rec.expires <= addDays(asOf, 30) };
  });
  const bad = rows.filter((r) => r.expired);
  const label = bad.length === 1 ? `${bad[0].course} expired` : `${bad.length} courses expired`;
  return (
    <span ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-bad-soft px-2 py-0.5 text-[10.5px] font-semibold text-red-800 transition-colors hover:bg-red-200">
        <GraduationCap className="size-3" /> {label}
      </button>
      {open ? (
        <span className="absolute left-0 top-6 z-30 block w-72 rounded-xl border border-line bg-card p-3 text-left shadow-xl">
          <span className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-ink-900">{airline.name} training</span>
            <button onClick={() => setOpen(false)} className="cursor-pointer rounded p-0.5 text-muted transition-colors hover:text-brand-600" aria-label="Close"><X className="size-3.5" /></button>
          </span>
          {rows.map((r) => (
            <span key={r.course} className="flex items-center justify-between gap-2 border-t border-line py-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate font-medium text-ink-900">{r.course}</span>
              <span className={cn("shrink-0 font-semibold", r.expired ? "text-bad" : r.soon ? "text-amber-700" : "text-ok")}>
                {!r.rec ? "Not taken" : r.expired ? `Expired ${formatDate(r.rec.expires, { day: "numeric", month: "short", year: "numeric" })}` : r.soon ? `Expires ${formatDate(r.rec.expires, { day: "numeric", month: "short" })}` : "Current"}
              </span>
            </span>
          ))}
          <span className="mt-2 block text-[11px] text-muted">Until renewed, they don&apos;t count toward {airline.code} coverage and can&apos;t be placed on its flights.</span>
          <Link href={`/agents/${person.id}`} className="mt-2 inline-block text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700">Open training record →</Link>
        </span>
      ) : null}
    </span>
  );
}
