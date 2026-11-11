import { NFS_CONTROLLABLE, type DelayCause, type Flight, type GateLog, type TeamPosition } from "@nfs/db";

export interface Portfolio {
  flights: { log: GateLog; flight: Flight; position: TeamPosition }[];
  d0: number;
  asLead: number;
  byPosition: Record<TeamPosition, number>;
  byAirline: Record<string, number>;
  teammates: { id: string; n: number }[];
  delays: { cause: DelayCause; n: number; nfs: boolean }[];
  discrepancies: number;
}

export function buildPortfolio(personId: string, logs: GateLog[], flightById: Map<string, Flight>): Portfolio {
  const mine = logs
    .filter((l) => l.status === "filed" && l.team.some((t) => t.personId === personId))
    .map((log) => ({ log, flight: flightById.get(log.flightId)!, position: log.team.find((t) => t.personId === personId)!.position }))
    .filter((x) => x.flight)
    .sort((a, b) => (b.flight.date + b.flight.std).localeCompare(a.flight.date + a.flight.std));

  const byPosition: Record<TeamPosition, number> = { lead: 0, gate: 0, jetBridge: 0, counter: 0 };
  const byAirline: Record<string, number> = {};
  const mates = new Map<string, number>();
  const delays = new Map<DelayCause, number>();
  for (const x of mine) {
    byPosition[x.position]++;
    byAirline[x.log.airline] = (byAirline[x.log.airline] ?? 0) + 1;
    for (const t of x.log.team) if (t.personId !== personId) mates.set(t.personId, (mates.get(t.personId) ?? 0) + 1);
    if (x.log.delayMinutes > 0 && x.log.delayCause) delays.set(x.log.delayCause, (delays.get(x.log.delayCause) ?? 0) + 1);
  }
  return {
    flights: mine,
    d0: mine.length ? (mine.filter((x) => x.log.delayMinutes === 0).length / mine.length) * 100 : 0,
    asLead: byPosition.lead,
    byPosition,
    byAirline,
    teammates: [...mates].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n).slice(0, 6),
    delays: [...delays].map(([cause, n]) => ({ cause, n, nfs: NFS_CONTROLLABLE.includes(cause) })).sort((a, b) => b.n - a.n),
    discrepancies: mine.reduce((s, x) => s + x.log.discrepancies.length, 0),
  };
}
