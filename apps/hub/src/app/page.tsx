import Image from "next/image";
import { ArrowRight, BarChart3, BrainCircuit, GraduationCap, LayoutGrid, Plane, PlaneTakeoff, UsersRound } from "lucide-react";
import { FirstGlanceCredit } from "@nfs/ui";
import { LiveFeed } from "@/components/live-feed";

const RAMPLINE = process.env.NEXT_PUBLIC_RAMPLINE_URL ?? "";
const GATELINE = process.env.NEXT_PUBLIC_GATELINE_URL ?? "";

/** Phase 1 modules: live, connected through the hub. */
const MODULES = [
  {
    name: "Rampline",
    role: "Ramp rostering and operations",
    href: RAMPLINE,
    icon: PlaneTakeoff,
    points: ["Rosters built to flight demand, with fatigue and union rules", "Day-of operations, turn plans and the FIDS board", "Forecasts, staffing shortfalls and analytics"],
  },
  {
    name: "Gateline",
    role: "Passenger services",
    href: GATELINE,
    icon: Plane,
    points: ["Airline core teams rostered against each airline's SLA", "One-tap gate log on the lead's phone", "Arrivals, cancellations, records and airline reports"],
  },
];

/** Phase 2: where the hub goes next. */
const NEXT = [
  { name: "Training and certification", body: "Courses, expiry tracking and airline sign-offs, feeding who can work which airline.", icon: GraduationCap },
  { name: "Central analytics", body: "One board view across ramp and passenger services: on-time, staffing and cost.", icon: BarChart3 },
  { name: "Operations assistant", body: "Watches every module and suggests fixes for managers to approve.", icon: BrainCircuit },
];

export default function HubHome() {
  return (
    <div className="min-h-dvh">
      <header className="bg-ink-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-white p-1.5">
              <Image src="/brand/nfs-mark.png" alt="Nassau Flight Services" width={36} height={36} className="h-auto w-full" priority />
            </span>
            <div>
              <p className="font-display text-lg leading-tight font-semibold">NFS Hub</p>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-300 uppercase">Nassau Flight Services</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
            <LayoutGrid className="size-3.5" /> Phase 1 · Ground operations
          </span>
        </div>
        <div className="mx-auto max-w-6xl px-5 pt-6 pb-10">
          <h1 className="max-w-3xl font-display text-3xl leading-tight font-semibold sm:text-4xl">
            Every ground operations system, one hub.
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
            Ramp and passenger services plan and work from their own apps, and every gate tap, alert and change moves between them as it happens.
          </p>
        </div>
      </header>

      <main className="mx-auto -mt-6 max-w-6xl px-5 pb-12">
        <section className="grid gap-4 md:grid-cols-2">
          {MODULES.map((m) => (
            <a
              key={m.name}
              href={m.href || undefined}
              className="group flex flex-col rounded-2xl border border-line bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700"><m.icon className="size-5" /></span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-1 text-[11px] font-semibold text-green-800">
                  <span className="size-1.5 rounded-full bg-ok" /> Live
                </span>
              </div>
              <p className="mt-4 font-display text-xl font-semibold">{m.name}</p>
              <p className="text-sm text-muted">{m.role}</p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {m.points.map((p) => (
                  <li key={p} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-brand-500" />{p}</li>
                ))}
              </ul>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 transition-colors group-hover:text-brand-500">
                Open {m.name} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </a>
          ))}
        </section>

        <section className="mt-6 rounded-2xl border border-line bg-card p-5">
          <p className="font-display text-lg font-semibold">How they work together</p>
          <p className="text-sm text-muted">The hub carries each event once; every app that needs it hears it straight away.</p>
          <div className="mt-4 grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
            <Flow
              title="Gateline → Rampline"
              items={["Door closed and pushback from the gate", "Bags to pull for no-shows and denied boarding", "Gate changes and filed flight records"]}
            />
            <div className="hidden flex-col items-center gap-1 md:flex">
              <span className="grid size-14 place-items-center rounded-2xl bg-ink-900 text-white"><UsersRound className="size-6" /></span>
              <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">NFS Hub</span>
            </div>
            <Flow
              title="Rampline → Gateline"
              items={["Inbound alerts: wheelchairs, medical, diversions", "Bags off confirmed back to the gate", "Flight and gate updates from operations"]}
            />
          </div>
        </section>

        <LiveFeed hubUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""} hubKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""} />

        <section className="mt-6">
          <p className="font-display text-lg font-semibold">Phase 2</p>
          <p className="text-sm text-muted">Next modules plug into the same hub, sign-in and event log.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {NEXT.map((n) => (
              <div key={n.name} className="rounded-2xl border border-dashed border-line bg-card/60 p-4">
                <span className="grid size-9 place-items-center rounded-lg bg-surface text-muted"><n.icon className="size-[18px]" /></span>
                <p className="mt-3 font-semibold">{n.name}</p>
                <p className="mt-0.5 text-sm text-muted">{n.body}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-5 text-xs text-muted">
          <span>Internal to Nassau Flight Services. Not indexed by search engines.</span>
          <FirstGlanceCredit />
        </footer>
      </main>
    </div>
  );
}

function Flow({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl bg-surface p-4">
      <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">{title}</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {items.map((i) => (
          <li key={i} className="flex gap-2"><ArrowRight className="mt-0.5 size-3.5 shrink-0 text-brand-500" />{i}</li>
        ))}
      </ul>
    </div>
  );
}
