"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck, Smartphone, LayoutDashboard, UserRound, ClipboardCheck } from "lucide-react";
import { Badge, Button, Card, Label, Select, cn } from "@nfs/ui";
import { ROLE_LABEL, homeFor, signIn } from "@nfs/auth";
import type { Person, Role } from "@nfs/db";
import { useHub, personName } from "@/lib/store";
import { FirstGlanceCredit, GatelineWordmark, NfsWordmark } from "@/components/brand";

const PERSONAS: { role: Role; airline?: string; title: string; body: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { role: "manager", title: "Passenger Services Manager", body: "Today board, SLA coverage heatmap, reassignment approvals, analytics.", icon: LayoutDashboard },
  { role: "supervisor", title: "Terminal Supervisor", body: "Coverage, flight tracking, records and gate oversight.", icon: ShieldCheck },
  { role: "lead", airline: "UA", title: "Gate Lead · United", body: "Phone gate log: team, one-tap times, discrepancies, file.", icon: Smartphone },
  { role: "lead", airline: "WU", title: "Gate Lead · Western Air", body: "Domestic gate log on a regional turn.", icon: ClipboardCheck },
  { role: "agent", airline: "AC", title: "Agent · Air Canada", body: "My roster, training status and recent flights.", icon: UserRound },
];

export default function LoginPage() {
  const hub = useHub();
  const router = useRouter();
  const [custom, setCustom] = React.useState("");

  const pick = (role: Role, airline?: string): Person | undefined =>
    hub.ds.people.find((p) => p.role === role && (!airline || p.coreAirline === airline));

  const go = (p?: Person) => {
    if (!p) return;
    const s = signIn(p);
    hub.refreshSession();
    router.push(homeFor(s.role));
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-ink-900 p-12 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)", backgroundSize: "28px 28px" }} />
        <div className="relative"><NfsWordmark dark /></div>
        <div className="relative mt-auto max-w-lg">
          <GatelineWordmark dark sub={false} />
          <h1 className="mt-6 text-4xl font-semibold leading-[1.1]">Above the wing, on one screen.</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
            Airline-specific rosters that protect core teams, a live SLA coverage heatmap, and a phone gate log that replaces the paper flight form — filed per flight, lead and team, and rolled up for management.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3 text-sm">
            {[
              ["6", "airlines"],
              ["1 tap", "per gate event"],
              ["0", "paper forms"],
            ].map(([a, b]) => (
              <div key={b} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <div className="font-display text-xl font-semibold text-gold-400">{a}</div>
                <div className="text-xs text-ink-300">{b}</div>
              </div>
            ))}
          </div>
        </div>
        <FirstGlanceCredit dark className="relative mt-10" />
      </section>

      <section className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <div className="lg:hidden mb-8 flex flex-col gap-4">
            <NfsWordmark />
            <GatelineWordmark />
          </div>
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-muted">One NFS login for Gateline and Rampline. Choose a role to explore the demo.</p>
          <Badge tone="gold" className="mt-3">Demo mode · all staff names are fictional</Badge>

          <div className="mt-6 space-y-2.5">
            {PERSONAS.map((p) => {
              const person = hub.ready ? pick(p.role, p.airline) : undefined;
              return (
                <button
                  key={p.title}
                  disabled={!person}
                  onClick={() => go(person)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-xl border border-line bg-card p-3.5 text-left transition-colors cursor-pointer",
                    "hover:border-brand-400 hover:bg-brand-50",
                  )}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-500 group-hover:text-white">
                    <p.icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{p.title}</span>
                    <span className="block truncate text-xs text-muted">{person ? `${personName(person)} · ` : ""}{p.body}</span>
                  </span>
                  <ArrowRight className="size-4 text-ink-400 transition-colors group-hover:text-brand-600" />
                </button>
              );
            })}
          </div>

          <Card className="mt-6 p-4">
            <Label htmlFor="who">Or sign in as any staff member</Label>
            <div className="mt-2 flex gap-2">
              <Select id="who" value={custom} onChange={(e) => setCustom(e.target.value)} className="min-w-0 flex-1">
                <option value="">Choose…</option>
                {hub.ds.people
                  .slice()
                  .sort((a, b) => a.role.localeCompare(b.role) || a.lastName.localeCompare(b.lastName))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {ROLE_LABEL[p.role]} · {personName(p)}{p.coreAirline ? ` (${p.coreAirline})` : ""}
                    </option>
                  ))}
              </Select>
              <Button disabled={!custom} onClick={() => go(hub.people.get(custom))}>Sign in</Button>
            </div>
          </Card>
          <FirstGlanceCredit className="mt-8 lg:hidden" />
        </div>
      </section>
    </div>
  );
}
