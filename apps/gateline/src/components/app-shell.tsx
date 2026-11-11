"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3, CalendarDays, ClipboardList, Grid3x3, LayoutDashboard, LogOut, MessageSquareWarning, Plane, PlaneTakeoff,
  RotateCcw, Smartphone, UserRound, Users, Wifi, WifiOff,
} from "lucide-react";
import { Avatar, Badge, Button, cn } from "@nfs/ui";
import { ROLE_LABEL, can, signOut, type Permission } from "@nfs/auth";
import { formatDate } from "@nfs/db";
import { transport } from "@nfs/events";
import { useHub } from "@/lib/store";
import { FirstGlanceCredit, GatelineWordmark } from "./brand";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; perm?: Permission; mobile?: boolean };

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Operations",
    items: [
      { href: "/", label: "Today", icon: LayoutDashboard, perm: "analytics.view", mobile: true },
      { href: "/flights", label: "Flight tracking", icon: PlaneTakeoff, perm: "staff.view" },
      { href: "/gate", label: "Gate log", icon: Smartphone, perm: "gate.log", mobile: true },
      { href: "/me", label: "My schedule", icon: UserRound, mobile: true },
    ],
  },
  {
    group: "Planning",
    items: [
      { href: "/coverage", label: "SLA coverage", icon: Grid3x3, perm: "reassign.request", mobile: true },
      { href: "/rosters", label: "Rosters", icon: CalendarDays, perm: "roster.view" },
      { href: "/airlines", label: "Airlines", icon: Plane, perm: "staff.view" },
      { href: "/agents", label: "Agents", icon: Users, perm: "staff.view" },
    ],
  },
  {
    group: "Performance",
    items: [
      { href: "/records", label: "Flight records", icon: ClipboardList, perm: "staff.view", mobile: true },
      { href: "/analytics", label: "Analytics", icon: BarChart3, perm: "analytics.view" },
      { href: "/feedback", label: "Airline feedback", icon: MessageSquareWarning, perm: "analytics.view" },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const hub = useHub();
  const pathname = usePathname();
  const router = useRouter();
  const role = hub.session?.role;

  React.useEffect(() => {
    if (hub.ready && !hub.session) router.replace("/login");
  }, [hub.ready, hub.session, router]);

  if (!hub.ready || !hub.session) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ink-900">
        <div className="animate-pulse"><GatelineWordmark dark /></div>
      </div>
    );
  }

  const visible = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || can(role, i.perm)) })).filter((g) => g.items.length);
  const mobileItems = visible.flatMap((g) => g.items).filter((i) => i.mobile).slice(0, 5);
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const nowLabel = `${formatDate(hub.today, { weekday: "short", day: "numeric", month: "short" })} · ${String(Math.floor(hub.nowMin / 60)).padStart(2, "0")}:${String(hub.nowMin % 60).padStart(2, "0")}`;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      {/* Sidebar */}
      <aside className="no-print sticky top-0 hidden h-dvh flex-col bg-ink-900 text-white lg:flex">
        <div className="px-5 pt-5 pb-6"><GatelineWordmark dark /></div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3">
          {visible.map((g) => (
            <div key={g.group}>
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">{g.group}</p>
              <div className="space-y-0.5">
                {g.items.map((i) => (
                  <Link
                    key={i.href}
                    href={i.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
                      active(i.href) ? "bg-brand-500/15 text-brand-200" : "text-ink-300 hover:bg-brand-500/10 hover:text-brand-200",
                    )}
                  >
                    <i.icon className="size-4" />
                    {i.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-2.5">
            <Avatar name={hub.session.name} tone="gold" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{hub.session.name}</p>
              <p className="text-[11px] text-ink-400">{ROLE_LABEL[hub.session.role]}</p>
            </div>
            <button
              onClick={() => {
                signOut();
                hub.refreshSession();
                router.replace("/login");
              }}
              className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-brand-500/10 hover:text-brand-200 cursor-pointer"
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
          <FirstGlanceCredit dark className="mt-3" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Top bar */}
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-card/90 px-4 backdrop-blur lg:px-8">
          <div className="lg:hidden"><GatelineWordmark sub={false} /></div>
          <div className="hidden text-sm text-muted lg:block">
            <span className="font-semibold text-fg">LPIA</span> · Above the wing · <span className="tabular">{nowLabel}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge tone="gold" className="hidden sm:inline-flex">Demo data · fictional staff</Badge>
            <button
              onClick={() => hub.setOffline(!hub.offline)}
              title={hub.offline ? "Offline — records held on this device" : `Online · sync via ${transport() === "supabase" ? "Supabase" : "local demo"}`}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors cursor-pointer",
                hub.offline ? "bg-warn-soft text-amber-800 hover:bg-amber-200" : "bg-ok-soft text-green-800 hover:bg-green-200",
              )}
            >
              {hub.offline ? <WifiOff className="size-3.5" /> : <Wifi className="size-3.5" />}
              {hub.offline ? `Offline${hub.pendingCount ? ` · ${hub.pendingCount} queued` : ""}` : "Online"}
            </button>
            {can(role, "roster.edit") ? (
              <Button variant="ghost" size="icon" title="Reset demo data" onClick={() => hub.resetDemo()} className="hidden sm:inline-flex">
                <RotateCcw />
              </Button>
            ) : null}
            <button
              className="lg:hidden"
              onClick={() => {
                signOut();
                hub.refreshSession();
                router.replace("/login");
              }}
              aria-label="Sign out"
            >
              <Avatar name={hub.session.name} tone="gold" />
            </button>
          </div>
        </header>

        <main className="print-full mx-auto w-full max-w-[1400px] flex-1 px-4 pt-6 pb-28 lg:px-8 lg:pb-12">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-md justify-around">
          {mobileItems.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold transition-colors",
                active(i.href) ? "text-brand-600" : "text-muted hover:text-brand-600",
              )}
            >
              <i.icon className="size-5" />
              {i.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
