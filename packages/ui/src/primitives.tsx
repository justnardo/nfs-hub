/**
 * Small pieces with no state and no client boundary, so server pages can render them directly.
 * Additions for Rampline; Gateline draws the same things inline in its app.
 */
import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from './cn';

/**
 * A placeholder block while a page streams in. Gateline has no skeletons (its data is local), so
 * this is the quietest one that still reads as "loading": a line-coloured block, gently pulsing.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-lg bg-line/70', className)}
      {...props}
    />
  );
}

/**
 * Detail on request: a native `<details>` with Gateline's teal "Details ›" summary. Use it for the
 * breakdown under a number, caveats, or a long list that most people do not need open.
 */
export function Disclosure({
  summary,
  children,
  className,
  summaryClassName,
  defaultOpen,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  summaryClassName?: string;
  defaultOpen?: boolean;
}) {
  return (
    <details
      data-slot="disclosure"
      className={cn('group/disclosure', className)}
      open={defaultOpen}
    >
      <summary
        className={cn(
          'inline-flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700 [&::-webkit-details-marker]:hidden',
          summaryClassName,
        )}
      >
        {summary}
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 transition-transform group-open/disclosure:rotate-90"
        />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/** A keyboard hint, as in the top bar's search field. */
export function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'rounded border border-line bg-card px-1.5 py-0.5 font-sans text-[10px] font-semibold text-muted',
        className,
      )}
      {...props}
    />
  );
}

/** The NFS mark. On a dark surface it sits on a white tile, as Gateline's does. */
export function NfsMark({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span
      className={cn(
        'inline-grid shrink-0 place-items-center',
        dark && 'rounded-[10px] bg-white p-1.5',
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/nfs-mark.png"
        alt="Nassau Flight Services"
        className="h-full w-auto object-contain"
      />
    </span>
  );
}

/** App lockup: NFS mark, the product name, and "Nassau Flight Services" under it. */
export function Wordmark({
  product,
  dark = false,
  sub = true,
}: {
  product: string;
  dark?: boolean;
  sub?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <NfsMark dark={dark} className="h-9 w-12" />
      <div className="leading-tight">
        <div
          className={cn(
            'font-display text-[17px] font-semibold tracking-tight',
            dark ? 'text-white' : 'text-fg',
          )}
        >
          {product}
        </div>
        {sub ? (
          <div
            className={cn(
              'text-[10.5px] font-semibold uppercase tracking-[0.12em]',
              dark ? 'text-brand-200/80' : 'text-brand-600',
            )}
          >
            Nassau Flight Services
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** "A First Glance Bahamas product", under the account in the sidebar. */
export function FirstGlanceCredit({
  dark = false,
  className,
}: {
  dark?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('text-[11px]', dark ? 'text-ink-400' : 'text-muted', className)}>
      A{' '}
      <span className={cn('font-semibold', dark ? 'text-ink-300' : 'text-fg')}>
        First Glance Bahamas
      </span>{' '}
      product
    </span>
  );
}
