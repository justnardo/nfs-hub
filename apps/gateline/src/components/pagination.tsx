"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@nfs/ui";

/**
 * Client-side paging for a list. Resets to page 1 when `resetKey` changes (filters, search),
 * and clamps if the list shrinks under the current page.
 */
export function usePaged<T>(items: T[], pageSize = 10, resetKey: unknown = null) {
  const [page, setPage] = React.useState(1);
  const [size, setSize] = React.useState(pageSize);
  const key = JSON.stringify(resetKey);
  React.useEffect(() => setPage(1), [key, size]);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, pages);
  const start = (current - 1) * size;
  return {
    rows: items.slice(start, start + size),
    page: current,
    pages,
    size,
    total: items.length,
    from: items.length ? start + 1 : 0,
    to: Math.min(start + size, items.length),
    setPage,
    setSize,
  };
}

export type Paged = ReturnType<typeof usePaged>;

function pageList(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const lo = Math.max(2, page - 1);
  const hi = Math.min(pages - 1, page + 1);
  if (lo > 2) out.push("…");
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < pages - 1) out.push("…");
  out.push(pages);
  return out;
}

/** "Showing 11–20 of 48" · page buttons · rows per page. Hidden when everything fits on one page. */
export function Pagination({
  paged, noun = "rows", sizes = [10, 25, 50], className, scrollTo,
}: {
  paged: Paged;
  noun?: string;
  sizes?: number[];
  className?: string;
  /** Element to scroll back into view when the page changes. */
  scrollTo?: React.RefObject<HTMLElement | null>;
}) {
  const { page, pages, total, from, to, size, setPage, setSize } = paged;
  if (total <= Math.min(size, sizes[0])) return null;
  const go = (n: number) => {
    setPage(n);
    const el = scrollTo?.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const btn = "inline-grid h-8 min-w-8 place-items-center rounded-lg px-2 text-xs font-semibold tabular transition-colors";
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3", className)}>
      <p className="text-xs text-muted">
        Showing <span className="font-semibold text-fg tabular">{from}–{to}</span> of <span className="font-semibold text-fg tabular">{total}</span> {noun}
      </p>
      <div className="flex items-center gap-3">
        {sizes.length > 1 && total > sizes[0] ? (
          <label className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
            Per page
            <select value={size} onChange={(e) => setSize(Number(e.target.value))} className="h-8 cursor-pointer rounded-lg border border-line bg-card px-2 text-xs font-semibold text-fg transition-colors hover:border-brand-400 focus:border-brand-500 focus:outline-none">
              {sizes.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        ) : null}
        {pages > 1 ? (
          <nav className="flex items-center gap-1" aria-label="Pagination">
            <button onClick={() => go(page - 1)} disabled={page === 1} className={cn(btn, "cursor-pointer border border-line text-ink-700 hover:border-brand-400 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-700")} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </button>
            {pageList(page, pages).map((n, i) =>
              n === "…" ? (
                <span key={`e${i}`} className="px-1 text-xs text-muted">…</span>
              ) : (
                <button
                  key={n}
                  onClick={() => go(n)}
                  aria-current={n === page ? "page" : undefined}
                  className={cn(btn, "cursor-pointer", n === page ? "bg-brand-500 text-white" : "text-ink-700 hover:bg-brand-50 hover:text-brand-700")}
                >
                  {n}
                </button>
              ),
            )}
            <button onClick={() => go(page + 1)} disabled={page === pages} className={cn(btn, "cursor-pointer border border-line text-ink-700 hover:border-brand-400 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-700")} aria-label="Next page">
              <ChevronRight className="size-4" />
            </button>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
