import * as React from "react";
import { FirstGlanceCredit, GatelineWordmark } from "@/components/brand";

/** Full-page state (page not found, something went wrong) in Gateline's own look. */
export function StateScreen({ code, title, body, actions }: { code: string; title: string; body: string; actions: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-surface px-5 py-10">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center"><GatelineWordmark /></div>
        <div className="mt-8 rounded-2xl border border-line bg-card p-7 shadow-sm">
          <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-brand-600">{code}</p>
          <h1 className="mt-2 font-display text-2xl font-semibold text-fg">{title}</h1>
          <p className="mt-2 text-sm text-muted">{body}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>
        </div>
        <div className="mt-6 flex justify-center"><FirstGlanceCredit /></div>
      </div>
    </div>
  );
}
