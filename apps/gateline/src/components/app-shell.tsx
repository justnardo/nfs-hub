"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3, CalendarDays, History, ClipboardList, Grid3x3, KeyRound, LayoutDashboard, LogOut, Menu, MessageSquareWarning, PanelLeftClose, PanelLeftOpen,
  Plane, PlaneTakeoff, Settings2, UserCog, RotateCcw, Smartphone, UserRound, Users, Wifi, WifiOff, X,
} from "lucide-react";
import { Avatar, Badge, Button, cn } from "@nfs/ui";
import { ROLE_LABEL, can, signOut, type Permission } from "@nfs/auth";
import { formatDate } from "@nfs/db";
import { transport } from "@nfs/events";
import { useHub } from "@/lib/store";
import { FirstGlanceCredit, GatelineWordmark, NfsMark } from "./brand";

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
      { href: "/changes", label: "Change log", icon: History, perm: "audit.view" },
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
  {
    group: "Account",
    items: [
      { href: "/profile", label: "My profile", icon: UserCog, mobile: true },
      { href: "/settings", label: "Rule settings", icon: Settings2, perm: "rules.edit" },
      { href: "/admin", label: "Accounts", icon: KeyRound, perm: "system.admin" },
    ],
  },
];

const COLLAPSE_KEY = "gateline.sidebar.collapsed";

/** Remembered sidebar state. With no saved choice it starts collapsed on screens under 1280px. */
function useCollapsed() {
  const [collapsed, setCollapsed] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(COLLAPSE_KEY);
    } catch {
      /* ignore */
    }
    setCollapsed(saved === null ? window.innerWidth < 1280 : saved === "1");
    setHydrated(true);
  }, []);
  const set = React.useCallback((v: boolean) => {
    setCollapsed(v);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);
  return [collapsed, set, hydrated] as const;
}

/** Hover label for the collapsed rail. Fixed-positioned so the nav's scroll area can't clip it. */
function RailTip({ label, children, show }: { label: string; children: React.ReactElement; show: boolean }) {
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
  if (!show) return children;
  return (
    <div
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPos({ x: r.right + 10, y: r.top + r.height / 2 });
      }}
      onMouseLeave={() => setPos(null)}
      onFocus={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPos({ x: r.right + 10, y: r.top + r.height / 2 });
      }}
      onBlur={() => setPos(null)}
    >
      {children}
      {pos ? (
        <span role="tooltip" style={{ left: pos.x, top: pos.y }} className="pointer-events-none fixed z-[60] -translate-y-1/2 whitespace-nowrap rounded-md bg-ink-800 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg ring-1 ring-white/10">
          {label}
        </span>
      ) : null}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const hub = useHub();
  const pathname = usePathname();
  const router = useRouter();
  const role = hub.session?.role;
  const [collapsed, setCollapsed, hydrated] = useCollapsed();
  const [drawer, setDrawer] = React.useState(false);

  React.useEffect(() => {
    if (hub.ready && !hub.session) router.replace("/login");
  }, [hub.ready, hub.session, router]);
  React.useEffect(() => setDrawer(false), [pathname]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed(!collapsed);
      }
      if (e.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed, setCollapsed]);

  if (!hub.ready || !hub.session) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ink-900">
        <div className="animate-pulse"><GatelineWordmark dark /></div>
      </div>
    );
  }

  const visible = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || can(role, i.perm)) })).filter((g) => g.items.length);
  const mobileItems = visible.flatMap((g) => g.items).filter((i) => i.mobile).slice(0, 4);
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const nowLabel = `${formatDate(hub.today, { weekday: "short", day: "numeric", month: "short" })} · ${String(Math.floor(hub.nowMin / 60)).padStart(2, "0")}:${String(hub.nowMin % 60).padStart(2, "0")}`;
  const signOutNow = () => {
    signOut();
    hub.refreshSession();
    router.replace("/login");
  };

  const navList = (rail: boolean) => (
    <nav className={cn("nav-scroll flex-1 overflow-y-auto overflow-x-hidden pb-4", rail ? "px-2.5" : "px-3")} aria-label="Main">
      {visible.map((g, gi) => (
        <div key={g.group} className={cn(gi > 0 && (rail ? "mt-3 border-t border-white/10 pt-3" : "mt-5"))}>
          {rail ? null : <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">{g.group}</p>}
          <div className="space-y-0.5">
            {g.items.map((i) => {
              const on = active(i.href);
              return (
                <RailTip key={i.href} label={i.label} show={rail}>
                  <Link
                    href={i.href}
                    aria-label={rail ? i.label : undefined}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "relative flex items-center rounded-lg text-[13.5px] font-medium transition-colors",
                      rail ? "h-10 w-full justify-center" : "gap-2.5 px-3 py-2",
                      on ? "bg-brand-500/15 text-brand-200" : "text-ink-300 hover:bg-brand-500/10 hover:text-brand-200",
                    )}
                  >
                    {on ? <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-400" /> : null}
                    <i.icon className={cn("shrink-0", rail ? "size-[18px]" : "size-4")} />
                    {rail ? null : <span className="truncate">{i.label}</span>}
                  </Link>
                </RailTip>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const account = (rail: boolean) => (
    <div className={cn("border-t border-white/10", rail ? "space-y-1 px-2.5 py-3" : "p-4")}>
      {rail ? (
        <>
          <RailTip label={`${hub.session!.name} · ${ROLE_LABEL[hub.session!.role]}`} show>
            <Link href="/profile" className="grid h-11 w-full place-items-center rounded-lg transition-colors hover:bg-brand-500/10" aria-label="My profile">
              <Avatar name={hub.session!.name} src={hub.me?.photoUrl} tone="gold" />
            </Link>
          </RailTip>
          <RailTip label="Sign out" show>
            <button onClick={signOutNow} className="grid h-9 w-full cursor-pointer place-items-center rounded-lg text-ink-400 transition-colors hover:bg-brand-500/10 hover:text-brand-200" aria-label="Sign out">
              <LogOut className="size-4" />
            </button>
          </RailTip>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            <Link href="/profile" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg transition-colors hover:text-brand-200">
              <Avatar name={hub.session!.name} src={hub.me?.photoUrl} tone="gold" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{hub.session!.name}</p>
                <p className="text-[11px] text-ink-400">{ROLE_LABEL[hub.session!.role]}</p>
              </div>
            </Link>
            <button onClick={signOutNow} className="cursor-pointer rounded-md p-1.5 text-ink-400 transition-colors hover:bg-brand-500/10 hover:text-brand-200" aria-label="Sign out">
              <LogOut className="size-4" />
            </button>
          </div>
          <FirstGlanceCredit dark className="mt-3" />
        </>
      )}
    </div>
  );

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar: full height, fixed; collapses to an icon rail */}
      <aside
        className={cn(
          "no-print fixed inset-y-0 left-0 z-40 hidden flex-col bg-ink-900 text-white lg:flex",
          hydrated && "transition-[width] duration-200 ease-out",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        <div className={cn("flex h-16 shrink-0 items-center", collapsed ? "justify-center px-2" : "justify-between pl-5 pr-3")}>
          {collapsed ? (
            <RailTip label="Expand sidebar  ⌘B" show>
              <button onClick={() => setCollapsed(false)} className="group relative grid cursor-pointer place-items-center rounded-xl" aria-label="Expand sidebar">
                <NfsMark dark className="h-9 w-11 transition-opacity group-hover:opacity-0" />
                <PanelLeftOpen className="absolute size-5 text-brand-200 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            </RailTip>
          ) : (
            <>
              <Link href="/" aria-label="Gateline home"><GatelineWordmark dark /></Link>
              <button onClick={() => setCollapsed(true)} title="Collapse sidebar (⌘B)" aria-label="Collapse sidebar" className="cursor-pointer rounded-lg p-2 text-ink-400 transition-colors hover:bg-brand-500/10 hover:text-brand-200">
                <PanelLeftClose className="size-[18px]" />
              </button>
            </>
          )}
        </div>
        <div className="h-2 shrink-0" />
        {navList(collapsed)}
        {account(collapsed)}
      </aside>

      {/* Mobile / tablet drawer */}
      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 cursor-default bg-ink-900/50 backdrop-blur-[2px]" onClick={() => setDrawer(false)} aria-label="Close menu" />
          <aside className="relative flex h-full w-[min(18rem,85vw)] flex-col bg-ink-900 text-white shadow-2xl">
            <div className="flex h-16 shrink-0 items-center justify-between pl-5 pr-3">
              <GatelineWordmark dark />
              <button onClick={() => setDrawer(false)} className="cursor-pointer rounded-lg p-2 text-ink-400 transition-colors hover:bg-brand-500/10 hover:text-brand-200" aria-label="Close menu"><X className="size-5" /></button>
            </div>
            {navList(false)}
            {account(false)}
          </aside>
        </div>
      ) : null}

      <div className={cn("flex min-h-dvh min-w-0 flex-col", hydrated && "transition-[padding] duration-200 ease-out", collapsed ? "lg:pl-[76px]" : "lg:pl-64")}>
        {/* Top bar */}
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-card/90 px-4 backdrop-blur lg:px-8">
          <button onClick={() => setDrawer(true)} className="-ml-1 cursor-pointer rounded-lg p-2 text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-700 lg:hidden" aria-label="Open menu"><Menu className="size-5" /></button>
          <div className="lg:hidden"><GatelineWordmark sub={false} /></div>
          <div className="hidden min-w-0 truncate text-sm text-muted lg:block">
            <span className="font-semibold text-fg">LPIA</span> · Above the wing · <span className="tabular">{nowLabel}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge tone="gold" className="hidden md:inline-flex">Demo data · fictional staff</Badge>
            <button
              onClick={() => hub.setOffline(!hub.offline)}
              title={hub.offline ? "Offline — records held on this device" : `Online · sync via ${transport() === "supabase" ? "Supabase" : "local demo"}`}
              className={cn(
                "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors",
                hub.offline ? "bg-warn-soft text-amber-800 hover:bg-amber-200" : "bg-ok-soft text-green-800 hover:bg-green-200",
              )}
            >
              {hub.offline ? <WifiOff className="size-3.5" /> : <Wifi className="size-3.5" />}
              <span className="hidden sm:inline">{hub.offline ? `Offline${hub.pendingCount ? ` · ${hub.pendingCount} queued` : ""}` : "Online"}</span>
            </button>
            {can(role, "system.admin") ? (
              <Button variant="ghost" size="icon" title="Reset demo data" onClick={() => hub.resetDemo()} className="hidden sm:inline-flex">
                <RotateCcw />
              </Button>
            ) : null}
            <Link href="/profile" className="lg:hidden" aria-label="My profile">
              <Avatar name={hub.session.name} src={hub.me?.photoUrl} tone="gold" />
            </Link>
          </div>
        </header>

        <main className="app-main print-full @container/main mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pb-12">{children}</main>
      </div>

      {/* Phone bottom nav: the four most-used screens plus Menu for everything else */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Quick">
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
          <button onClick={() => setDrawer(true)} className="flex min-h-14 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold text-muted transition-colors hover:text-brand-600">
            <Menu className="size-5" />
            Menu
          </button>
        </div>
      </nav>
    </div>
  );
}
