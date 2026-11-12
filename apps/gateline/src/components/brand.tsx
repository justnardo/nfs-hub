import { cn } from "@nfs/ui";

/** Official NFS mark (same file Rampline uses). On dark surfaces it sits on a white tile. */
export function NfsMark({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn("inline-grid shrink-0 place-items-center", dark && "rounded-[10px] bg-white p-1.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/nfs-mark.png" alt="Nassau Flight Services" className="h-full w-auto object-contain" />
    </span>
  );
}

/** App lockup: NFS mark + "Gateline". */
export function GatelineWordmark({ dark = false, sub = true }: { dark?: boolean; sub?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <NfsMark dark={dark} className="h-9 w-12" />
      <div className="leading-tight">
        <div className={cn("font-display text-[17px] font-semibold tracking-tight", dark ? "text-white" : "text-fg")}>Gateline</div>
        {sub ? <div className={cn("text-[10.5px] font-semibold uppercase tracking-[0.12em]", dark ? "text-brand-200/80" : "text-brand-600")}>Nassau Flight Services</div> : null}
      </div>
    </div>
  );
}

/** Full NFS logo with wordmark. */
export function NfsWordmark({ dark = false, size = "md" }: { dark?: boolean; size?: "sm" | "md" | "lg" }) {
  const h = size === "sm" ? "h-7" : size === "lg" ? "h-14" : "h-10";
  return (
    <span className={cn("inline-flex items-center", dark && "rounded-lg bg-white px-2.5 py-1.5")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/nfs-logo.png" alt="Nassau Flight Services" className={cn(h, "w-auto")} />
    </span>
  );
}

export function FirstGlanceCredit({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <p className={cn("text-[11px]", dark ? "text-ink-400" : "text-muted", className)}>
      A <span className={cn("font-semibold", dark ? "text-ink-300" : "text-fg")}>First Glance Bahamas</span> product
    </p>
  );
}
