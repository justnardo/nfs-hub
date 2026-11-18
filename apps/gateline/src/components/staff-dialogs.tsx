"use client";
import * as React from "react";
import { Search, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { Avatar, Badge, Button, Dialog, DialogContent, Input, Label, Select, cn } from "@nfs/ui";
import { ROLE_LABEL } from "@nfs/auth";
import { formatDate, type Airline, type Person } from "@nfs/db";
import { eligibleFor } from "@nfs/rules";
import { useHub, personName } from "@/lib/store";

/** Add staff to an airline's core team or move them off it. */
export function TeamMembersDialog({ airline, onClose }: { airline: Airline; onClose: () => void }) {
  const hub = useHub();
  const [q, setQ] = React.useState("");
  const [qualifiedOnly, setQualifiedOnly] = React.useState(true);
  const staff = hub.ds.people.filter((p) => (p.role === "agent" || p.role === "lead") && p.active !== false);
  const team = staff.filter((p) => p.coreAirline === airline.code).sort((a, b) => Number(b.role === "lead") - Number(a.role === "lead") || a.lastName.localeCompare(b.lastName));
  const query = q.trim().toLowerCase();
  const others = staff
    .filter((p) => p.coreAirline !== airline.code)
    .filter((p) => !qualifiedOnly || p.trainedAirlines.includes(airline.code))
    .filter((p) => !query || `${personName(p)} ${p.staffNo}`.toLowerCase().includes(query))
    .sort((a, b) => Number(!!a.coreAirline) - Number(!!b.coreAirline) || a.lastName.localeCompare(b.lastName));
  const add = (p: Person) => hub.savePerson(p.id, { coreAirline: airline.code, trainedAirlines: p.trainedAirlines.includes(airline.code) ? p.trainedAirlines : [...p.trainedAirlines, airline.code] });
  const remove = (p: Person) => hub.savePerson(p.id, { coreAirline: null });
  const status = (p: Person) => {
    const e = eligibleFor(p, airline, hub.today);
    return e.ok ? <span className="text-ok">Current on {airline.code}</span> : <span className="text-bad">{e.reason}</span>;
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl" title={`${airline.name} · core team`} description="Add staff to this airline's core team or move them to the float pool. Rosters and coverage update straight away, and every change is logged.">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">On the team · {team.length}</p>
            <div className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
              {team.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5 rounded-lg border border-line p-2">
                  <Avatar name={personName(p)} src={p.photoUrl} tone={p.role === "lead" ? "dark" : "brand"} className="size-8" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{personName(p)}{p.role === "lead" ? <span className="ml-1.5 text-xs font-normal text-muted">Lead</span> : null}</p>
                    <p className="truncate text-xs">{status(p)}</p>
                  </div>
                  <Button variant="ghost" size="icon" title="Move to float pool" onClick={() => remove(p)} aria-label={`Remove ${personName(p)} from the team`}><UserMinus /></Button>
                </div>
              ))}
              {team.length === 0 ? <p className="text-sm text-muted">Nobody on this team yet.</p> : null}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Add to the team</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or staff ID" className="pl-9" />
            </div>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted"><input type="checkbox" checked={qualifiedOnly} onChange={(e) => setQualifiedOnly(e.target.checked)} className="size-3.5 accent-[var(--color-brand-500)]" /> Only staff qualified on {airline.code}</label>
            <div className="mt-2 max-h-[42vh] space-y-1.5 overflow-y-auto pr-1">
              {others.map((p) => (
                <button key={p.id} type="button" onClick={() => add(p)} className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-line p-2 text-left transition-colors hover:border-brand-400 hover:bg-brand-50">
                  <Avatar name={personName(p)} src={p.photoUrl} tone={p.role === "lead" ? "dark" : "gold"} className="size-8" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{personName(p)} <span className="text-xs font-normal text-muted">{p.staffNo}</span></p>
                    <p className="truncate text-xs text-muted">{p.coreAirline ? `Core ${p.coreAirline}` : "Float pool"} · {p.trainedAirlines.includes(airline.code) ? status(p) : <span className="text-amber-700">Not trained on {airline.code} yet</span>}</p>
                  </div>
                  <UserPlus className="size-4 shrink-0 text-brand-600" />
                </button>
              ))}
              {others.length === 0 ? <p className="text-sm text-muted">No one matches.</p> : null}
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted">Staff not yet trained on {airline.code} join the team but don&apos;t count toward its coverage until their training is recorded.</p>
        <div className="mt-4 flex justify-end"><Button onClick={onClose}>Done</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function HrConfirm({ value, onChange, what }: { value: { contact: string; ref: string; ok: boolean }; onChange: (v: { contact: string; ref: string; ok: boolean }) => void; what: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-warn-soft/60 p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-900"><ShieldCheck className="size-4" /> Confirm with HR first</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div><Label htmlFor="hrc" className="text-xs">HR contact who confirmed</Label><Input id="hrc" value={value.contact} onChange={(e) => onChange({ ...value, contact: e.target.value })} placeholder="Name in HR" className="mt-1 bg-card" /></div>
        <div><Label htmlFor="hrr" className="text-xs">HR reference (optional)</Label><Input id="hrr" value={value.ref} onChange={(e) => onChange({ ...value, ref: e.target.value })} placeholder="e.g. HR-2026-114" className="mt-1 bg-card" /></div>
      </div>
      <label className="mt-2 flex cursor-pointer items-start gap-2 text-sm text-amber-950"><input type="checkbox" checked={value.ok} onChange={(e) => onChange({ ...value, ok: e.target.checked })} className="mt-0.5 size-4 accent-[var(--color-brand-500)]" /> HR has confirmed {what}.</label>
    </div>
  );
}

const ROLE_STEPS = ["agent", "lead", "supervisor"] as const;

/** Promote or move someone between agent, lead and supervisor, once HR has confirmed. */
export function RoleDialog({ person, onClose }: { person: Person; onClose: () => void }) {
  const hub = useHub();
  const [role, setRole] = React.useState<(typeof ROLE_STEPS)[number]>(ROLE_STEPS.includes(person.role as never) ? (person.role as never) : "agent");
  const [effective, setEffective] = React.useState(hub.today);
  const [hr, setHr] = React.useState({ contact: "", ref: "", ok: false });
  const changed = role !== person.role;
  const valid = changed && hr.ok && hr.contact.trim().length > 1;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Change role · ${personName(person)}`} description="Leads run the gate; supervisors run the terminal. Rosters, permissions and the team rebuild with the new role.">
        <div className="grid grid-cols-3 gap-2">
          {ROLE_STEPS.map((r) => (
            <button key={r} type="button" onClick={() => setRole(r)} className={cn("cursor-pointer rounded-lg border px-3 py-3 text-center transition-colors", role === r ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700")}>
              <span className="block text-sm font-semibold">{ROLE_LABEL[r]}</span>
              {r === person.role ? <span className="text-[11px] text-muted">Current</span> : null}
            </button>
          ))}
        </div>
        {role === "supervisor" && person.role !== "supervisor" ? <p className="mt-2 text-xs text-muted">Supervisors aren&apos;t on an airline team; they move to the {person.homeTerminal === "US" ? "US Departures" : "International"} supervisors&apos; roster.</p> : null}
        <div className="mt-3"><Label htmlFor="eff" className="text-xs">Effective</Label><Input id="eff" type="date" value={effective} onChange={(e) => setEffective(e.target.value)} className="mt-1 w-48" /></div>
        <div className="mt-4"><HrConfirm value={hr} onChange={setHr} what={`this change of role${changed ? ` to ${ROLE_LABEL[role].toLowerCase()}` : ""}`} /></div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!valid}
            onClick={() => {
              hub.savePerson(person.id, { role, ...(role === "supervisor" ? { coreAirline: null } : {}) }, true, `effective ${formatDate(effective)} · HR confirmed by ${hr.contact.trim()}${hr.ref.trim() ? ` (${hr.ref.trim()})` : ""}`);
              onClose();
            }}
          >
            Change role
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const LEAVE_REASONS = ["Resigned", "Retired", "End of contract", "Dismissed", "Transferred out of NFS", "Other"];

/** Remove someone who no longer works at NFS. Two steps, HR confirmation required; their history stays. */
export function LeaverDialog({ person, onClose }: { person: Person; onClose: () => void }) {
  const hub = useHub();
  const [reason, setReason] = React.useState(LEAVE_REASONS[0]);
  const [last, setLast] = React.useState(hub.today);
  const [hr, setHr] = React.useState({ contact: "", ref: "", ok: false });
  const [step, setStep] = React.useState<1 | 2>(1);
  const valid = hr.ok && hr.contact.trim().length > 1 && /^\d{4}-\d{2}-\d{2}$/.test(last);
  const future = hub.ds.roster.filter((r) => r.personId === person.id && r.date > last && ["E", "M", "L"].includes(r.shift)).length;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={step === 1 ? `No longer at NFS · ${personName(person)}` : "Are you sure?"} description={step === 1 ? "For staff who have left the company. They come off every roster after their last day; flights worked, training and history stay on record." : undefined}>
        {step === 1 ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="lr" className="text-xs">Reason</Label>
                <Select id="lr" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full">{LEAVE_REASONS.map((r) => <option key={r}>{r}</option>)}</Select>
              </div>
              <div><Label htmlFor="ll" className="text-xs">Last day worked</Label><Input id="ll" type="date" value={last} onChange={(e) => setLast(e.target.value)} className="mt-1" /></div>
            </div>
            <div className="mt-4"><HrConfirm value={hr} onChange={setHr} what={`${person.firstName} no longer works at NFS`} /></div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button variant="danger" disabled={!valid} onClick={() => setStep(2)}>Continue</Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 rounded-xl border border-line p-3">
              <Avatar name={personName(person)} src={person.photoUrl} className="size-10" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{personName(person)} <span className="text-sm font-normal text-muted">{person.staffNo}</span></p>
                <p className="text-xs text-muted">{ROLE_LABEL[person.role]} · {person.coreAirline ? `Core ${person.coreAirline}` : "Float pool"}</p>
              </div>
              <Badge tone="bad">{reason}</Badge>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              <li>· Last day: <b>{formatDate(last, { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</b></li>
              <li>· {future ? `${future} rostered shift${future > 1 ? "s" : ""} after that come off; coverage shows any gaps` : "No rostered shifts after that day"}</li>
              <li>· Their sign-in stops working; history and records are kept</li>
              <li>· HR confirmed by {hr.contact.trim()}{hr.ref.trim() ? ` · ${hr.ref.trim()}` : ""}</li>
            </ul>
            <div className="mt-5 flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button
                variant="danger"
                onClick={() => {
                  hub.savePerson(
                    person.id,
                    { active: false, leftOn: last, leaving: { reason, hrContact: hr.contact.trim(), hrRef: hr.ref.trim() || undefined, recordedBy: hub.session?.name ?? "", at: new Date().toISOString() } },
                    true,
                    `${reason.toLowerCase()} · HR confirmed by ${hr.contact.trim()}${hr.ref.trim() ? ` (${hr.ref.trim()})` : ""}`,
                  );
                  onClose();
                }}
              >
                <UserMinus /> Remove from NFS
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
