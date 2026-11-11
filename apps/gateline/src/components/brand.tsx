import { cn } from "@nfs/ui";

export function GatelineMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={cn("size-9", className)} aria-hidden>
      <rect width="512" height="512" rx="112" fill="#0b1b2b" />
      <path d="M136 380V214a120 120 0 0 1 240 0v166" fill="none" stroke="#0e9aa7" strokeWidth="44" strokeLinecap="round" />
      <path d="M96 300h320" stroke="#f5b83d" strokeWidth="30" strokeLinecap="round" />
      <circle cx="256" cy="214" r="26" fill="#f5b83d" />
    </svg>
  );
}

export function GatelineWordmark({ dark = false, sub = true }: { dark?: boolean; sub?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <GatelineMark className="size-9 rounded-[10px] ring-1 ring-white/10" />
      <div className="leading-tight">
        <div className={cn("font-display text-[17px] font-semibold tracking-tight", dark ? "text-white" : "text-fg")}>Gateline</div>
        {sub ? <div className={cn("text-[10.5px] font-semibold uppercase tracking-[0.12em]", dark ? "text-brand-200/80" : "text-brand-600")}>Nassau Flight Services</div> : null}
      </div>
    </div>
  );
}

/** NFS client logo (same file Rampline uses). */
export function NfsWordmark({ dark = false, size = "md" }: { dark?: boolean; size?: "sm" | "md" }) {
  return (
    <span className={cn("inline-flex items-center", dark && "rounded-lg bg-white px-2.5 py-1.5")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/nfs-logo.png" alt="Nassau Flight Services" className={size === "sm" ? "h-7 w-auto" : "h-10 w-auto"} />
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
