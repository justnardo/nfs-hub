"use client";
import * as React from "react";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import { cn } from "@nfs/ui";

/**
 * Confirmation toasts and "just changed" highlights, shared across pages without a provider.
 * A fix or an optimise calls flash() so the manager sees it landed, and markChanged() so the
 * roster outlines the cells that moved.
 */
export interface Flash {
  id: string;
  title: string;
  body?: string;
  tone?: "ok" | "warn";
  action?: { label: string; onClick: () => void };
}

let items: Flash[] = [];
let changed = new Map<string, number>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export function flash(f: Omit<Flash, "id">, ms = 7000) {
  const id = Math.random().toString(36).slice(2);
  items = [...items, { ...f, id }].slice(-3);
  emit();
  setTimeout(() => dismiss(id), ms);
}
export function dismiss(id: string) {
  items = items.filter((x) => x.id !== id);
  emit();
}

/** Cells ("personId|date") to outline as just changed, for a few minutes. */
export function markChanged(keys: string[], ms = 5 * 60_000) {
  const until = Date.now() + ms;
  const next = new Map(changed);
  for (const k of keys) next.set(k, until);
  changed = next;
  emit();
  setTimeout(() => {
    const now = Date.now();
    const kept = new Map([...changed].filter(([, t]) => t > now));
    if (kept.size !== changed.size) {
      changed = kept;
      emit();
    }
  }, ms + 50);
}
export function clearChanged(keys?: string[]) {
  changed = keys ? new Map([...changed].filter(([k]) => !keys.includes(k))) : new Map();
  emit();
}

export function useChanged(): Map<string, number> {
  return React.useSyncExternalStore(subscribe, () => changed, () => changed);
}

export function FlashHost() {
  const list = React.useSyncExternalStore(subscribe, () => items, () => items);
  if (!list.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-20 z-[70] flex flex-col items-end gap-2 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[24rem]" role="status" aria-live="polite">
      {list.map((f) => (
        <div key={f.id} className={cn("pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-card p-3.5 shadow-[0_12px_32px_rgba(11,47,56,0.18)]", f.tone === "warn" ? "border-amber-200" : "border-emerald-200")}>
          {f.tone === "warn" ? <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{f.title}</p>
            {f.body ? <p className="mt-0.5 text-xs text-muted">{f.body}</p> : null}
            {f.action ? (
              <button type="button" onClick={() => { f.action!.onClick(); dismiss(f.id); }} className="mt-1.5 cursor-pointer text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700">
                {f.action.label}
              </button>
            ) : null}
          </div>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(f.id)} className="cursor-pointer rounded p-0.5 text-muted transition-colors hover:text-fg"><X className="size-4" /></button>
        </div>
      ))}
    </div>
  );
}
