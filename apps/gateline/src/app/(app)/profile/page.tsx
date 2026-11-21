"use client";
import * as React from "react";
import { Bell, Camera, CheckCircle2, KeyRound, Loader2, Lock, LogOut, Mail, Phone, Plane } from "lucide-react";
import { useRouter } from "next/navigation";
import { PushToggle } from "@/components/notifications";
import { Avatar, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Textarea, cn } from "@nfs/ui";
import { AirlineChip } from "@/components/ops";
import { ROLE_LABEL, signOut } from "@nfs/auth";
import { addDays, formatDate } from "@nfs/db";
import { useHub, personName } from "@/lib/store";

export default function ProfilePage() {
  const hub = useHub();
  const router = useRouter();
  const me = hub.me;
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [saved, setSaved] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [requested, setRequested] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (me) {
      setEmail(me.email ?? "");
      setPhone(me.phone ?? "");
    }
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me) return null;
  const airline = me.coreAirline ? hub.ds.airlines.find((a) => a.code === me.coreAirline) : null;
  const myRequests = hub.requests.filter((r) => r.personId === me.id);
  const openRequest = myRequests.find((r) => r.status === "open");
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const dirty = email !== (me.email ?? "") || phone !== (me.phone ?? "");

  const onPhoto = async (f?: File) => {
    if (!f) return;
    setPhotoError(null);
    if (!f.type.startsWith("image/")) return setPhotoError("Choose an image file.");
    if (f.size > 10 * 1024 * 1024) return setPhotoError("That photo is over 10 MB.");
    setUploading(true);
    const ok = await hub.uploadPhoto(me.id, f);
    setUploading(false);
    if (!ok) setPhotoError("Upload failed — try again.");
  };

  const trainedOn = me.trainedAirlines.map((code) => hub.ds.airlines.find((a) => a.code === code)).filter((a): a is NonNullable<typeof a> => !!a);
  const status = (code: string) => {
    const recs = me.training.filter((t) => t.airline === code);
    if (!recs.length) return { tone: "neutral" as const, label: "No records", until: null as string | null };
    const first = [...recs].sort((a, b) => a.expires.localeCompare(b.expires))[0];
    if (first.expires < hub.today) return { tone: "bad" as const, label: "Expired", until: first.expires };
    if (first.expires <= addDays(hub.today, 30)) return { tone: "warn" as const, label: "Due soon", until: first.expires };
    return { tone: "ok" as const, label: "Current", until: first.expires };
  };
  const signOutNow = () => { signOut(); hub.refreshSession(); router.replace("/login"); };

  return (
    <div className="mx-auto max-w-5xl">
      {/* Hero: who you are, at a glance */}
      <Card className="overflow-hidden">
        <div className="relative bg-ink-900 px-5 pb-5 pt-6 text-white sm:px-7">
          <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "radial-gradient(120% 90% at 100% 0%, rgba(14,154,167,0.55), transparent 60%)" }} />
          <div className="relative flex flex-wrap items-center gap-5">
            <div className="relative shrink-0">
              <Avatar name={personName(me)} src={me.photoUrl} tone="gold" className="size-24 text-2xl ring-4 ring-white/15 sm:size-28" />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 grid size-10 cursor-pointer place-items-center rounded-full border-2 border-ink-900 bg-brand-500 text-white shadow transition-colors hover:bg-brand-600"
                aria-label="Change photo"
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onPhoto(e.target.files?.[0])} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-200">My profile</p>
              <h1 className="mt-1 font-display text-2xl font-semibold leading-tight sm:text-3xl">{personName(me)}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="rounded-full bg-gold-500 px-2.5 py-0.5 font-bold text-ink-900">{ROLE_LABEL[me.role]}</span>
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-semibold">{me.staffNo}</span>
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-semibold">{me.homeTerminal === "US" ? "US Departures" : "International"} terminal</span>
                {me.hireYear ? <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-semibold">Since {me.hireYear}</span> : null}
              </div>
            </div>
            {airline ? (
              <div className="flex items-center gap-3 rounded-xl bg-white p-2.5 pr-4 text-fg shadow-lg max-sm:w-full">
                <AirlineChip airline={airline} size="lg" />
                <div className="leading-tight">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Core team</p>
                  <p className="text-sm font-semibold">{airline.name}</p>
                </div>
              </div>
            ) : null}
          </div>
          {photoError ? <p className="relative mt-3 text-xs text-red-200">{photoError}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 sm:px-7">
          {me.email ? <a href={`mailto:${me.email}`} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"><Mail className="size-3.5" /> {me.email}</a> : null}
          {me.phone ? <a href={`tel:${me.phone}`} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"><Phone className="size-3.5" /> {me.phone}</a> : null}
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}><Camera /> {me.photoUrl ? "Change photo" : "Add a photo"}</Button>
          {me.photoUrl ? <Button variant="ghost" size="sm" onClick={() => hub.saveProfile(me.id, { photoUrl: null })}>Remove photo</Button> : null}
          <Button variant="outline" size="sm" onClick={signOutNow}><LogOut /> Sign out</Button>
        </div>
      </Card>

      <div className="mt-5 grid gap-5 @3xl/main:grid-cols-2">
        <div className="space-y-5">
          <Card>
            <CardHeader><div><CardTitle className="flex items-center gap-1.5"><Plane className="size-4 text-brand-600" /> My airlines</CardTitle><CardDescription>Where you&apos;re qualified to work, and how your training stands</CardDescription></div></CardHeader>
            <CardContent className="space-y-2">
              {trainedOn.length === 0 ? <p className="text-sm text-muted">No airline training on record yet.</p> : null}
              {[...trainedOn].sort((a, b) => Number(b.code === me.coreAirline) - Number(a.code === me.coreAirline)).map((a) => {
                const st = status(a.code);
                return (
                  <div key={a.code} className={cn("flex items-center gap-3 rounded-xl border p-2.5", a.code === me.coreAirline ? "border-brand-200 bg-brand-50/60" : "border-line")}>
                    <AirlineChip airline={a} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{a.name}</p>
                      <p className="text-xs text-muted">{a.code === me.coreAirline ? "Core team" : "Qualified to cover"}{st.until ? ` · valid to ${formatDate(st.until, { day: "numeric", month: "short", year: "numeric" })}` : ""}</p>
                    </div>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                );
              })}
              <p className="flex items-center gap-1.5 pt-1 text-[11px] text-muted"><Lock className="size-3" /> Training records are kept by the training department.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Managed for you</CardTitle><CardDescription>Ask your manager if any of this is wrong</CardDescription></div><Lock className="size-4 text-ink-400" /></CardHeader>
            <CardContent>
              <dl className="divide-y divide-line text-sm">
                {([
                  ["Role", ROLE_LABEL[me.role]],
                  ["Staff ID", me.staffNo],
                  ["Core team", airline ? <span key="a" className="inline-flex items-center gap-2"><AirlineChip airline={airline} />{airline.name}</span> : me.role === "agent" || me.role === "lead" ? "Float pool" : "—"],
                  ["Home terminal", me.homeTerminal === "US" ? "US Departures" : "International"],
                ] as [string, React.ReactNode][]).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 py-2.5">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader><div><CardTitle>Contact details</CardTitle><CardDescription>So your supervisor can reach you about shifts</CardDescription></div></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setSaved(false); }} className="mt-1 h-11" />
                {email && !emailValid ? <p className="mt-1 text-xs text-bad">Enter a valid email address.</p> : null}
              </div>
              <div>
                <Label htmlFor="phone">Mobile</Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false); }} className="mt-1 h-11" />
              </div>
              <div className="flex items-center gap-3">
                <Button className="h-11 sm:h-9" disabled={!dirty || !emailValid} onClick={() => { hub.saveProfile(me.id, { email: email.trim(), phone: phone.trim() }); setSaved(true); }}>Save changes</Button>
                {saved && !dirty ? <span className="inline-flex items-center gap-1 text-sm text-ok"><CheckCircle2 className="size-4" /> Saved</span> : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div><CardTitle className="flex items-center gap-1.5"><Bell className="size-4 text-brand-600" /> Alerts on this phone</CardTitle><CardDescription>Get told the moment you&apos;re put on a flight, its gate changes, or a request is answered</CardDescription></div></CardHeader>
            <CardContent><PushToggle /></CardContent>
          </Card>

          <Card>
            <CardHeader><div><CardTitle className="flex items-center gap-1.5"><KeyRound className="size-4 text-brand-600" /> Password</CardTitle><CardDescription>Requests go to the system administrator</CardDescription></div></CardHeader>
            <CardContent className="space-y-3">
              {openRequest ? (
                <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-800">Password change requested {formatDate(openRequest.at.slice(0, 10))}. The administrator will issue you a temporary password.</p>
              ) : (
                <>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note, e.g. I think someone else knows my password" />
                  <Button variant="outline" onClick={() => { hub.requestPassword(me.id, note.trim()); setNote(""); setRequested(true); }}>Request password change</Button>
                </>
              )}
              {requested && openRequest ? <p className="text-xs text-ok">Request sent.</p> : null}
              {myRequests.filter((r) => r.status !== "open").slice(0, 2).map((r) => (
                <p key={r.id} className="text-xs text-muted">{formatDate(r.at.slice(0, 10))}: {r.status === "done" ? "temporary password issued" : "declined"}{r.resolvedBy ? ` by ${r.resolvedBy}` : ""}</p>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
