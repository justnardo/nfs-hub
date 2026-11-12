"use client";
import * as React from "react";
import { Camera, CheckCircle2, KeyRound, Loader2, Lock, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, PageHeader, Textarea } from "@nfs/ui";
import { ROLE_LABEL, signOut } from "@nfs/auth";
import { formatDate } from "@nfs/db";
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

  const locked: [string, React.ReactNode][] = [
    ["Name", personName(me)],
    ["Staff ID", me.staffNo],
    ["Role", ROLE_LABEL[me.role]],
    ["Core team", airline ? airline.name : me.role === "agent" || me.role === "lead" ? "Float pool" : "—"],
    ["Home terminal", me.homeTerminal === "US" ? "US Departures" : "International"],
    ["Qualified on", me.trainedAirlines.join(", ") || "—"],
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Account"
        title="My profile"
        description="Keep your photo and contact details up to date. Your role, team and training are managed by your manager and TakeFlight."
        actions={<Button variant="outline" onClick={() => { signOut(); hub.refreshSession(); router.replace("/login"); }}><LogOut /> Sign out</Button>}
      />

      <div className="grid gap-5 md:grid-cols-[240px_1fr]">
        <Card className="p-5 text-center">
          <div className="relative mx-auto w-fit">
            <Avatar name={personName(me)} src={me.photoUrl} tone="gold" className="size-32 text-3xl" />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-1 right-1 grid size-9 place-items-center rounded-full border-2 border-card bg-brand-500 text-white shadow transition-colors hover:bg-brand-600 cursor-pointer"
              aria-label="Change photo"
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onPhoto(e.target.files?.[0])} />
          <p className="mt-3 font-display text-lg font-semibold">{personName(me)}</p>
          <p className="text-xs text-muted">{ROLE_LABEL[me.role]} · {me.staffNo}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => fileRef.current?.click()} disabled={uploading}>{me.photoUrl ? "Change photo" : "Upload photo"}</Button>
          {me.photoUrl ? <Button variant="ghost" size="sm" className="mt-1" onClick={() => hub.saveProfile(me.id, { photoUrl: null })}>Remove photo</Button> : null}
          {photoError ? <p className="mt-2 text-xs text-bad">{photoError}</p> : null}
          <p className="mt-3 text-[11px] text-muted">Shown wherever your name appears — rosters, gate teams, records.</p>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader><div><CardTitle>Contact details</CardTitle><CardDescription>You can change these</CardDescription></div></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setSaved(false); }} className="mt-1" />
                {email && !emailValid ? <p className="mt-1 text-xs text-bad">Enter a valid email address.</p> : null}
              </div>
              <div>
                <Label htmlFor="phone">Mobile</Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false); }} className="mt-1" />
              </div>
              <div className="flex items-center gap-3">
                <Button disabled={!dirty || !emailValid} onClick={() => { hub.saveProfile(me.id, { email: email.trim(), phone: phone.trim() }); setSaved(true); }}>Save changes</Button>
                {saved && !dirty ? <span className="inline-flex items-center gap-1 text-sm text-ok"><CheckCircle2 className="size-4" /> Saved</span> : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Password</CardTitle><CardDescription>Requests go to the system administrator</CardDescription></div><KeyRound className="size-4 text-brand-500" /></CardHeader>
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

          <Card>
            <CardHeader><div><CardTitle>Managed for you</CardTitle><CardDescription>Ask your manager if any of this is wrong</CardDescription></div><Lock className="size-4 text-ink-400" /></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
                {locked.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 border-b border-line/70 pb-2">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
              <Badge tone="neutral" className="mt-3"><Lock className="size-3" /> Training records sync from TakeFlight</Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
