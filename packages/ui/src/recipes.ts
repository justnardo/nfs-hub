/**
 * Gateline's class strings as plain data, for apps whose own primitives are not the ones in
 * `components.tsx`.
 *
 * `components.tsx` is a client module ("use client"), so a server component that imports
 * `buttonVariants` from it gets a client reference, not a function, and calling it throws. Rampline
 * styles links as buttons from server pages, and its primitives are Base UI rather than Radix, so it
 * needs the same look in a module with no client boundary. Every string here is copied from
 * `components.tsx`; `test/recipes.test.ts` fails if the two drift apart.
 */
import { cva } from 'class-variance-authority';

/* ---------- Button ---------- */

export const buttonBase =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer';

export const buttonVariantClasses = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700',
  gold: 'bg-gold-400 text-ink-900 hover:bg-gold-500',
  secondary: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
  outline:
    'border border-line bg-card text-fg hover:border-brand-400 hover:text-brand-700 hover:bg-brand-50',
  ghost: 'text-muted hover:bg-brand-50 hover:text-brand-700',
  danger: 'bg-bad text-white hover:bg-red-700',
  dark: 'bg-ink-900 text-white hover:bg-ink-800',
} as const;

export const buttonSizeClasses = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4',
  lg: 'h-12 px-5 text-base',
  icon: 'size-9',
} as const;

export type ButtonVariant = keyof typeof buttonVariantClasses;
export type ButtonSize = keyof typeof buttonSizeClasses;

/** Gateline's `buttonVariants`, callable from a server component. */
export const buttonRecipe = cva(buttonBase, {
  variants: { variant: buttonVariantClasses, size: buttonSizeClasses },
  defaultVariants: { variant: 'primary', size: 'md' },
});

/* ---------- Badge ---------- */

export const badgeBase =
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 whitespace-nowrap';

export const badgeToneClasses = {
  neutral: 'bg-surface text-muted border border-line',
  brand: 'bg-brand-50 text-brand-700',
  ok: 'bg-ok-soft text-green-800',
  warn: 'bg-warn-soft text-amber-800',
  bad: 'bg-bad-soft text-red-800',
  gold: 'bg-gold-100 text-gold-700',
  dark: 'bg-ink-900 text-white',
} as const;

export type BadgeTone = keyof typeof badgeToneClasses;

/** Gateline's `badgeVariants`, callable from a server component. */
export const badgeRecipe = cva(badgeBase, {
  variants: { tone: badgeToneClasses },
  defaultVariants: { tone: 'neutral' },
});

/* ---------- Card ---------- */

export const cardClasses = {
  root: 'rounded-xl border border-line bg-card shadow-[var(--shadow-card)]',
  header: 'flex items-start justify-between gap-3 px-5 pt-5 pb-3',
  title: 'text-[15px] font-semibold text-fg',
  description: 'text-xs text-muted mt-0.5',
  content: 'px-5 pb-5',
} as const;

/* ---------- Fields ---------- */

export const fieldClasses = {
  input:
    'h-10 w-full rounded-lg border border-line bg-card px-3 text-sm outline-none transition-colors placeholder:text-ink-400 hover:border-brand-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100',
  textarea:
    'min-h-20 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-ink-400 hover:border-brand-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100',
  select:
    'h-10 rounded-lg border border-line bg-card px-3 pr-8 text-sm outline-none transition-colors hover:border-brand-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 cursor-pointer',
  label: 'text-xs font-semibold text-muted',
} as const;

/* ---------- Dialog: a bottom sheet on phones, a centred card from `sm` ---------- */

export const dialogClasses = {
  overlay: 'fixed inset-0 z-50 bg-ink-950/50 backdrop-blur-[2px]',
  sheet:
    'fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-card shadow-2xl',
  centred:
    'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90dvh] sm:w-[calc(100vw-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
  handle: 'mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-ink-300/70 sm:hidden',
  header: 'flex shrink-0 items-start gap-3 border-b border-line px-5 pb-3 pt-2.5 sm:px-6 sm:pt-5',
  title: 'font-display text-lg font-semibold leading-snug',
  description: 'mt-1 text-sm text-muted',
  close:
    '-mr-1.5 grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-surface text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-700',
  body: 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5',
  footer:
    'shrink-0 border-t border-line bg-card px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-4',
} as const;

/* ---------- Table ---------- */

export const tableClasses = {
  th: 'border-b border-line px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted whitespace-nowrap',
  td: 'border-b border-line/70 px-3 py-2.5 align-middle',
  tr: 'transition-colors hover:bg-brand-50/50',
} as const;

/* ---------- Page header ---------- */

export const pageHeaderClasses = {
  root: 'mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3',
  text: 'min-w-0 max-w-2xl flex-[1_1_28rem]',
  eyebrow: 'text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600',
  title: 'mt-1 text-2xl font-semibold md:text-[28px]',
  description: 'mt-1 text-sm text-muted',
  actions: 'flex min-w-0 flex-wrap items-center gap-2',
} as const;

export const emptyStateClasses = {
  root: 'flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-12 text-center',
  title: 'font-display font-semibold',
  body: 'mt-1 max-w-sm text-sm text-muted',
  action: 'mt-4',
} as const;

/*
 * Everything below is not in `components.tsx`: Gateline draws these in its app (shell, popovers,
 * week strip, toast). They are the same strings, gathered so a second app can share them.
 */

/* ---------- Floating layers ---------- */

export const popoverClasses = {
  /** Search results, alerts, date picker, menus. */
  panel: 'rounded-xl border border-line bg-card text-fg shadow-xl',
  /** A row in a popover menu. */
  item: 'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold transition-colors hover:bg-brand-50 hover:text-brand-700',
  itemCurrent: 'bg-brand-50 text-brand-700',
  separator: 'my-1 border-t border-line',
} as const;

/** Gateline's rail tooltip: ink, white, small and bold. */
export const tooltipClasses =
  'rounded-md bg-ink-800 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg ring-1 ring-white/10';

export const toastClasses = {
  toast: 'rounded-xl border border-line bg-card p-3.5 text-fg shadow-2xl',
  title: 'text-sm font-semibold',
  description: 'text-xs text-muted',
} as const;

/* ---------- Interactive surfaces: one hover language ---------- */

export const surfaceClasses = {
  /** Card-like rows, list links, tiles: border to teal-400, fill teal-50, ink teal-700. */
  hover: 'transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700',
  /** The same on a large surface, at half the fill. */
  hoverSoft: 'transition-colors hover:border-brand-400 hover:bg-brand-50/50',
  selected: 'border-brand-500 bg-brand-50 ring-2 ring-brand-100',
} as const;

/* ---------- Shell ---------- */

export const shellClasses = {
  sidebar: 'fixed inset-y-0 left-0 z-40 flex-col bg-ink-900 text-white',
  groupLabel: 'px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400',
  navItem: 'relative flex items-center rounded-lg text-[13.5px] font-medium transition-colors',
  navItemRest: 'text-ink-300 hover:bg-brand-500/10 hover:text-brand-200',
  navItemActive: 'bg-brand-500/15 text-brand-200',
  navActiveBar: 'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-400',
  /** Icon buttons on the dark sidebar: collapse, close, sign out. */
  darkIconButton:
    'cursor-pointer rounded-lg p-2 text-ink-400 transition-colors hover:bg-brand-500/10 hover:text-brand-200',
  railTip:
    'pointer-events-none fixed z-[60] -translate-y-1/2 whitespace-nowrap rounded-md bg-ink-800 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg ring-1 ring-white/10',
  topBar:
    'sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-card/90 px-4 backdrop-blur lg:px-8',
  /** Icon buttons on the light top bar: menu, search. */
  lightIconButton:
    'cursor-pointer rounded-lg p-2 text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-700',
  bottomBar:
    'fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur',
  bottomItem:
    'flex min-h-14 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold transition-colors [&_svg]:size-5',
  bottomItemRest: 'text-muted hover:text-brand-600',
  bottomItemActive: 'text-brand-600',
  drawerOverlay: 'fixed inset-0 z-50 bg-ink-900/50 backdrop-blur-[2px]',
  drawer:
    'fixed inset-y-0 left-0 z-50 flex h-full w-[min(18rem,85vw)] flex-col bg-ink-900 pb-[env(safe-area-inset-bottom)] text-white shadow-2xl',
  main: 'mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pb-12',
} as const;

/* ---------- Week strip ---------- */

export const weekStripClasses = {
  item: 'min-w-[118px] shrink-0 cursor-pointer rounded-lg border px-2.5 py-1.5 text-left transition-colors',
  itemOn: 'border-brand-500 bg-brand-50 ring-2 ring-brand-100',
  itemOff: 'border-line bg-card hover:border-brand-400 hover:bg-brand-50/60',
  range: 'block text-xs font-semibold tabular',
  rangeOn: 'text-brand-800',
  rangeOff: 'text-ink-900',
  state: 'mt-0.5 flex items-center gap-1.5 text-[10.5px] font-medium text-muted',
  dot: 'size-1.5 shrink-0 rounded-full',
  arrow:
    'grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-line bg-card text-ink-700 transition-colors hover:border-brand-400 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40',
} as const;

/** The state dots Gateline puts under each week. */
export const weekStateDots = {
  past: 'bg-ink-300',
  now: 'bg-brand-500',
  published: 'bg-current text-ok',
  draft: 'bg-gold-500',
  rostered: 'bg-brand-400',
  none: 'bg-transparent ring-1 ring-ink-300',
} as const;
