"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button, Input, Label } from "@nfs/ui";
import { authenticate, homeFor, signIn } from "@nfs/auth";
import { useHub } from "@/lib/store";
import { FirstGlanceCredit, NfsWordmark } from "@/components/brand";

/** NFS passenger services photo (from nfsbahamas.com), resized and served from Gateline's storage. */
const HERO = "https://vrvvdceqixamongoqmpb.supabase.co/storage/v1/object/public/gateline-assets/login-passenger-service.jpg";

export default function LoginPage() {
  const hub = useHub();
  const router = useRouter();
  const [staffId, setStaffId] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!hub.ready) return;
    setBusy(true);
    const res = authenticate(hub.ds.people, staffId, password);
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    const s = signIn(res.person);
    hub.refreshSession();
    router.push(homeFor(s.role));
  };

  return (
    <div className="grid min-h-dvh bg-card lg:grid-cols-2">
      {/* Photo half */}
      <section className="relative h-48 overflow-hidden bg-ink-900 sm:h-64 lg:h-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={HERO} alt="NFS passenger services agents at the check-in counter" onError={(e) => (e.currentTarget.style.display = "none")} className="absolute inset-0 size-full object-cover object-[35%_center]" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/70 via-ink-950/10 to-transparent" />
        <p className="absolute bottom-5 left-6 text-sm font-semibold text-white/90 lg:bottom-8 lg:left-10">Passenger Services · Lynden Pindling International Airport</p>
      </section>

      {/* Form half */}
      <section className="flex flex-col px-6 py-10 sm:px-12">
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
          <NfsWordmark size="lg" />
          <h1 className="mt-8 text-2xl font-semibold">Sign in to Gateline</h1>
          <p className="mt-1 text-sm text-muted">Use your NFS staff ID and password.</p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            <div>
              <Label htmlFor="staff">Staff ID</Label>
              <Input
                id="staff"
                autoComplete="username"
                autoCapitalize="characters"
                placeholder="NFS-0000"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="mt-1.5 h-12"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative mt-1.5">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-ink-400 transition-colors hover:bg-brand-50 hover:text-brand-600 cursor-pointer"
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            {error ? <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-red-800">{error}</p> : null}
            <Button type="submit" size="lg" className="w-full" disabled={busy || !staffId || !password}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Sign in
            </Button>
          </form>
          <p className="mt-6 text-xs text-muted">Forgot your password? Contact your supervisor or the system administrator.</p>
        </div>
        <FirstGlanceCredit className="mx-auto mt-10 w-full max-w-sm" />
      </section>
    </div>
  );
}
