import { NFS_CONTROLLABLE, toMinutes, type Airline, type DelayCause, type Flight, type GateLog } from "@nfs/db";

export function slaMet(log: GateLog, airline: Airline): boolean {
  const n = (p: string) => log.team.filter((t) => t.position === p).length;
  return n("lead") >= airline.sla.lead && n("gate") >= airline.sla.gate && n("jetBridge") >= airline.sla.jetBridge && n("counter") >= airline.sla.counter;
}

export function teamShortfall(log: GateLog, airline: Airline): string[] {
  const out: string[] = [];
  const n = (p: string) => log.team.filter((t) => t.position === p).length;
  if (n("lead") < airline.sla.lead) out.push("lead");
  if (n("gate") < airline.sla.gate) out.push(`gate ${n("gate")}/${airline.sla.gate}`);
  if (n("jetBridge") < airline.sla.jetBridge) out.push("jet bridge");
  if (n("counter") < airline.sla.counter) out.push(`counter ${n("counter")}/${airline.sla.counter}`);
  return out;
}

export function boardingMinutes(log: GateLog): number | null {
  const s = log.events.boarding_start;
  const c = log.events.boarding_close;
  return s && c ? toMinutes(c) - toMinutes(s) : null;
}

export function doorCloseVsStd(log: GateLog, f: Flight): number | null {
  return log.events.door_close ? toMinutes(log.events.door_close) - toMinutes(f.std) : null;
}

export function isNfsCause(c: DelayCause | null) {
  return !!c && NFS_CONTROLLABLE.includes(c);
}

export interface Summary {
  flights: number;
  d0: number;
  d15: number;
  slaCompliance: number;
  avgBoarding: number;
  discrepanciesPer100: number;
  nfsDelays: number;
  otherDelays: number;
}

export function summarise(logs: GateLog[], airlines: Map<string, Airline>): Summary {
  const filed = logs.filter((l) => l.status === "filed");
  const n = filed.length || 1;
  const boards = filed.map(boardingMinutes).filter((x): x is number => x !== null);
  return {
    flights: filed.length,
    d0: (filed.filter((l) => l.delayMinutes === 0).length / n) * 100,
    d15: (filed.filter((l) => l.delayMinutes < 15).length / n) * 100,
    slaCompliance: (filed.filter((l) => slaMet(l, airlines.get(l.airline)!)).length / n) * 100,
    avgBoarding: boards.length ? boards.reduce((a, b) => a + b, 0) / boards.length : 0,
    discrepanciesPer100: (filed.reduce((s, l) => s + l.discrepancies.length, 0) / n) * 100,
    nfsDelays: filed.filter((l) => l.delayMinutes > 0 && isNfsCause(l.delayCause)).length,
    otherDelays: filed.filter((l) => l.delayMinutes > 0 && !isNfsCause(l.delayCause)).length,
  };
}

export const pct = (x: number) => `${Math.round(x)}%`;

export function otpTone(x: number): "ok" | "warn" | "bad" {
  return x >= 85 ? "ok" : x >= 70 ? "warn" : "bad";
}
