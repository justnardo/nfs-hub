"use client";
import * as React from "react";
import type { DayCoverage } from "@nfs/rules";

// Validated pair (dataviz validator): teal = on duty, violet = SLA need. Gaps use the reserved "bad" status colour + label.
const ON = "#0e9aa7";
const NEED = "#6c5ce7";

/** Need vs on-duty agents through the day, 15-minute steps, with gaps shaded. */
export function CoverageTimeline({ dc, from = 3, to = 21 }: { dc: DayCoverage; from?: number; to?: number }) {
  const s0 = from * 4;
  const s1 = to * 4;
  const slots = Array.from({ length: s1 - s0 }, (_, i) => s0 + i);
  const max = Math.max(2, ...slots.map((s) => Math.max(dc.need[s], dc.have[s]))) + 1;
  const W = 720;
  const H = 170;
  const padL = 28;
  const padB = 22;
  const padT = 8;
  const bw = (W - padL) / slots.length;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const [hover, setHover] = React.useState<number | null>(null);
  const label = (s: number) => `${String(Math.floor(s / 4)).padStart(2, "0")}:${String((s % 4) * 15).padStart(2, "0")}`;

  let needPath = "";
  slots.forEach((s, i) => {
    const x0 = padL + i * bw;
    const yy = y(dc.need[s]);
    needPath += i === 0 ? `M${x0},${yy}` : `L${x0},${yy}`;
    needPath += `L${x0 + bw},${yy}`;
  });

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Agents on duty against SLA need through the day" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: max + 1 }, (_, v) => v).filter((v) => v % Math.ceil(max / 4) === 0).map((v) => (
          <g key={v}>
            <line x1={padL} x2={W} y1={y(v)} y2={y(v)} stroke="#e2e8ee" strokeWidth={1} />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="#5b6b7b">{v}</text>
          </g>
        ))}
        {slots.map((s, i) =>
          dc.have[s] < dc.need[s] ? <rect key={`g${s}`} x={padL + i * bw} y={padT} width={bw} height={H - padT - padB} fill="#fee2e2" /> : null,
        )}
        {slots.map((s, i) =>
          dc.have[s] > 0 ? <rect key={`b${s}`} x={padL + i * bw + 1} y={y(dc.have[s])} width={Math.max(1, bw - 2)} height={H - padB - y(dc.have[s])} rx={2} fill={ON} opacity={hover === null || hover === s ? 0.9 : 0.55} /> : null,
        )}
        <path d={needPath} fill="none" stroke={NEED} strokeWidth={2} />
        {slots.filter((s) => s % 8 === 0).map((s) => (
          <text key={`t${s}`} x={padL + (s - s0) * bw} y={H - 6} fontSize={10} fill="#5b6b7b" textAnchor="middle">{label(s)}</text>
        ))}
        {slots.map((s, i) => (
          <rect key={`h${s}`} x={padL + i * bw} y={0} width={bw} height={H - padB} fill="transparent" onMouseEnter={() => setHover(s)} />
        ))}
        {hover !== null ? <line x1={padL + (hover - s0 + 0.5) * bw} x2={padL + (hover - s0 + 0.5) * bw} y1={padT} y2={H - padB} stroke="#a9bccb" strokeDasharray="3 3" /> : null}
      </svg>
      {hover !== null ? (
        <div className="pointer-events-none absolute top-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs shadow-lg" style={{ left: `${Math.min(80, ((hover - s0) / slots.length) * 100)}%` }}>
          <p className="font-semibold tabular">{label(hover)}–{label(hover + 1)}</p>
          <p className="tabular text-muted">On duty <span className="font-semibold text-fg">{dc.have[hover]}</span> · Need <span className="font-semibold text-fg">{dc.need[hover]}</span></p>
          {dc.have[hover] < dc.need[hover] ? <p className="font-semibold text-bad">Short {dc.need[hover] - dc.have[hover]}</p> : null}
          {dc.leadNeed[hover] > 0 ? <p className="text-muted">Lead {dc.leadHave[hover] > 0 ? "on duty" : <span className="font-semibold text-bad">missing</span>}</p> : null}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: ON }} /> Agents on duty</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: NEED }} /> SLA need</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-red-200 bg-bad-soft" /> Gap</span>
      </div>
    </div>
  );
}
