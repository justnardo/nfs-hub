'use client';
/**
 * Gateline's app frame as parts: the dark sidebar (collapsible to an icon rail), the sticky top
 * bar, the phone tab bar and the phone menu drawer. The app supplies its own links (`as={Link}`)
 * and decides what goes where; these carry the look and the behaviour.
 *
 * The sidebar's width lives in CSS, keyed off `data-sidebar` on the shell root (see `shell.css`),
 * so nothing here needs to know the screen size before it renders.
 */
import * as React from 'react';
import { Dialog as DrawerPrimitive } from '@base-ui/react/dialog';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { cn } from './cn';
import { NfsMark } from './primitives';
import { shellClasses } from './recipes';

type Icon = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;

/* ---------- Sidebar ---------- */

/** The fixed dark sidebar, desktop only. Below `lg` the same links live in `MenuDrawer`. */
export function Sidebar({ className, children, ...props }: React.ComponentProps<'aside'>) {
  return (
    <aside
      data-rail-host=""
      className={cn(
        shellClasses.sidebar,
        'hidden w-64 transition-[width] duration-200 ease-out lg:flex rail:w-[76px] print:hidden',
        className,
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

/**
 * Hover label for an item on the collapsed rail. It is fixed-positioned so the nav's own scroll
 * area cannot clip it, and it only appears while the sidebar is actually the rail.
 */
export function RailTip({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
  const show = (el: HTMLElement) => {
    const host = el.closest<HTMLElement>('[data-rail-host]');
    if (!host || host.getBoundingClientRect().width > 120) return;
    const r = el.getBoundingClientRect();
    setPos({ x: r.right + 10, y: r.top + r.height / 2 });
  };
  return (
    <div
      className={className}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setPos(null)}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={() => setPos(null)}
    >
      {children}
      {pos ? (
        <span aria-hidden style={{ left: pos.x, top: pos.y }} className={shellClasses.railTip}>
          {label}
        </span>
      ) : null}
    </div>
  );
}

/** A labelled group of sidebar items. On the rail the label gives way to a thin rule. */
export function SidebarGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn(
        'mt-5 first:mt-0 rail:mt-3 rail:border-t rail:border-white/10 rail:pt-3 rail:first:mt-0 rail:first:border-t-0 rail:first:pt-0',
        className,
      )}
    >
      <p className={cn(shellClasses.groupLabel, 'rail:hidden')}>{label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

type SidebarItemProps = Omit<React.ComponentPropsWithoutRef<'a'>, 'children' | 'onClick'> & {
  /** A link or a button, so the handler sees either. */
  onClick?: React.MouseEventHandler<HTMLElement>;
  /** The link component, such as Next's `Link`. A plain anchor otherwise. */
  as?: React.ElementType;
  active?: boolean;
  icon?: Icon;
  label: string;
  /** A count pill or a chevron after the label. Hidden on the rail. */
  trailing?: React.ReactNode;
  /** Extra props for `as` (a button's `type`, say). */
  [key: string]: unknown;
};

/**
 * One sidebar row. Rest is ink-300; hover a faint teal fill with teal-200 ink; the current page
 * a slightly stronger fill and a 3px teal bar on the left edge.
 */
export function SidebarItem({
  as: Comp = 'a',
  active = false,
  icon: ItemIcon,
  label,
  trailing,
  className,
  ...props
}: SidebarItemProps) {
  return (
    <RailTip label={label}>
      <Comp
        aria-current={active ? 'page' : undefined}
        data-active={active ? 'true' : undefined}
        className={cn(
          shellClasses.navItem,
          'w-full cursor-pointer gap-2.5 px-3 py-2 text-left rail:h-10 rail:justify-center rail:px-0 rail:py-0',
          active ? shellClasses.navItemActive : shellClasses.navItemRest,
          className,
        )}
        {...props}
      >
        {active ? <span aria-hidden className={shellClasses.navActiveBar} /> : null}
        {ItemIcon ? <ItemIcon aria-hidden className="size-4 shrink-0 rail:size-[18px]" /> : null}
        <span className="min-w-0 flex-1 truncate rail:sr-only">{label}</span>
        {trailing ? <span className="ml-auto flex shrink-0 rail:hidden">{trailing}</span> : null}
      </Comp>
    </RailTip>
  );
}

/** Flip the shell between the full sidebar and the rail, and remember the choice in a cookie. */
function toggleSidebar(from: Element | null, cookie: string) {
  const root =
    from?.closest<HTMLElement>('[data-sidebar]') ??
    document.querySelector<HTMLElement>('[data-sidebar]');
  if (!root) return;
  const current = root.dataset.sidebar;
  const rail =
    current === 'rail' ||
    (current === 'auto' && window.matchMedia('(max-width: 79.98rem)').matches);
  const next = rail ? 'full' : 'rail';
  root.dataset.sidebar = next;
  document.cookie = `${cookie}=${next}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * The sidebar header's two controls: a collapse button beside the wordmark, and on the rail the
 * NFS mark itself, which turns into an expand icon on hover. Also listens for ⌘B / Ctrl+B.
 */
export function SidebarToggle({ cookie, homeLabel }: { cookie: string; homeLabel?: string }) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar(ref.current, cookie);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cookie]);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={(e) => toggleSidebar(e.currentTarget, cookie)}
        title="Collapse sidebar (Ctrl+B)"
        aria-label="Collapse sidebar"
        className={cn(shellClasses.darkIconButton, 'rail:hidden')}
      >
        <PanelLeftClose aria-hidden className="size-[18px]" />
      </button>
      <RailTip label="Expand sidebar  Ctrl+B">
        <button
          type="button"
          onClick={(e) => toggleSidebar(e.currentTarget, cookie)}
          aria-label={homeLabel ? `Expand sidebar (${homeLabel})` : 'Expand sidebar'}
          className="group/expand relative hidden cursor-pointer place-items-center rounded-xl rail:grid"
        >
          <NfsMark
            dark
            className="h-9 w-11 transition-opacity group-hover/expand:opacity-0 group-focus-visible/expand:opacity-0"
          />
          <PanelLeftOpen
            aria-hidden
            className="absolute size-5 text-brand-200 opacity-0 transition-opacity group-hover/expand:opacity-100 group-focus-visible/expand:opacity-100"
          />
        </button>
      </RailTip>
    </>
  );
}

/**
 * Widen the sidebar if it is the rail, for an item that needs room (a list opened in place).
 * Returns whether it did.
 */
export function expandSidebar(from: Element | null, cookie: string): boolean {
  const host = from?.closest<HTMLElement>('[data-rail-host]');
  if (!host || host.getBoundingClientRect().width > 120) return false;
  toggleSidebar(host, cookie);
  return true;
}

/* ---------- Top bar ---------- */

/** Sticky, white at 90% with a blur, one line under it. No page title and no breadcrumbs. */
export function TopBar({ className, ...props }: React.ComponentProps<'header'>) {
  return <header className={cn(shellClasses.topBar, 'print:hidden', className)} {...props} />;
}

/** A light icon button for the top bar: the menu, search on a phone. */
export const topBarIconButtonClasses = shellClasses.lightIconButton;

/* ---------- Phone tab bar ---------- */

export function BottomTabBar({
  label = 'Quick',
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(shellClasses.bottomBar, 'lg:hidden print:hidden', className)}
    >
      <div className="mx-auto flex max-w-md justify-around">{children}</div>
    </nav>
  );
}

type BottomTabProps = Omit<React.ComponentPropsWithoutRef<'a'>, 'children' | 'onClick'> & {
  onClick?: React.MouseEventHandler<HTMLElement>;
  as?: React.ElementType;
  active?: boolean;
  icon: Icon;
  label: string;
  [key: string]: unknown;
};

/** A tab: icon over a short label. The current one is teal; there is no pill. */
export function BottomTab({
  as: Comp = 'a',
  active = false,
  icon: TabIcon,
  label,
  className,
  ...props
}: BottomTabProps) {
  return (
    <Comp
      aria-current={active ? 'page' : undefined}
      className={cn(
        shellClasses.bottomItem,
        active ? shellClasses.bottomItemActive : shellClasses.bottomItemRest,
        className,
      )}
      {...props}
    >
      <TabIcon aria-hidden />
      <span className="max-w-full truncate px-0.5">{label}</span>
    </Comp>
  );
}

/* ---------- Phone menu drawer ---------- */

/**
 * The sidebar's links on a phone or tablet: the same dark list, sliding in from the left over a
 * blurred page. Closes on Escape, on the overlay, and (the app's job) on navigation.
 */
export function MenuDrawer({
  open,
  onOpenChange,
  header,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Backdrop
          className={cn(
            shellClasses.drawerOverlay,
            'transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 lg:hidden',
          )}
        />
        <DrawerPrimitive.Popup
          data-slot="menu-drawer"
          className={cn(
            shellClasses.drawer,
            'transition-transform duration-200 ease-out outline-none data-ending-style:-translate-x-full data-starting-style:-translate-x-full lg:hidden',
          )}
        >
          <DrawerPrimitive.Title className="sr-only">Menu</DrawerPrimitive.Title>
          <div className="flex h-16 shrink-0 items-center justify-between pr-3 pl-5">
            {header}
            <DrawerPrimitive.Close aria-label="Close menu" className={shellClasses.darkIconButton}>
              <X aria-hidden className="size-5" />
            </DrawerPrimitive.Close>
          </div>
          {children}
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
