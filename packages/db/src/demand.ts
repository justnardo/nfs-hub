import type { Airline, Flight, ShiftCode } from "./types";
import { toMinutes } from "./time";

export interface ShiftDef {
  code: ShiftCode;
  label: string;
  start: string;
  end: string;
  /** Window used to measure staffing demand (handover overlap excluded). */
  demandFrom: string;
  demandTo: string;
  hours: number;
}

export const SHIFTS: Record<"E" | "L", ShiftDef> = {
  E: { code: "E", label: "Early", start: "04:00", end: "12:30", demandFrom: "04:00", demandTo: "12:30", hours: 8 },
  L: { code: "L", label: "Late", start: "12:00", end: "20:30", demandFrom: "12:30", demandTo: "20:30", hours: 8 },
};

/** Counter opens 3h before STD and closes 1h before; gate team works STD-60 to STD+10. */
export const COUNTER_OPEN_MIN = 180;
export const COUNTER_CLOSE_MIN = 60;
export const GATE_FROM_MIN = 60;
export const GATE_TO_MIN = 10;

/** Agents a single flight needs at minute t (counter phase or gate phase). */
export function flightAgentNeedAt(f: Flight, a: Airline, t: number): number {
  const std = toMinutes(f.std);
  if (t >= std - COUNTER_OPEN_MIN && t < std - COUNTER_CLOSE_MIN) return a.sla.counter;
  if (t >= std - GATE_FROM_MIN && t < std + GATE_TO_MIN) return a.sla.gate + a.sla.jetBridge;
  return 0;
}

export function flightActiveAt(f: Flight, t: number): boolean {
  const std = toMinutes(f.std);
  return t >= std - COUNTER_OPEN_MIN && t < std + GATE_TO_MIN;
}

/** Peak concurrent demand for one airline in one shift on one date (15-minute sampling). */
export function shiftDemand(flights: Flight[], airline: Airline, shift: "E" | "L") {
  const def = SHIFTS[shift];
  const from = toMinutes(def.demandFrom);
  const to = toMinutes(def.demandTo);
  let agents = 0;
  let leads = 0;
  const contributing = new Set<string>();
  for (let t = from; t < to; t += 15) {
    let a = 0;
    let l = 0;
    for (const f of flights) {
      if (f.airline !== airline.code) continue;
      const need = flightAgentNeedAt(f, airline, t);
      if (need > 0) {
        a += need;
        contributing.add(f.id);
      }
      if (flightActiveAt(f, t)) l += airline.sla.lead;
    }
    agents = Math.max(agents, a);
    leads = Math.max(leads, l);
  }
  return { agents, leads, flightIds: [...contributing] };
}

/** Which shift is accountable for a departure. */
export function shiftForStd(std: string): "E" | "L" {
  return toMinutes(std) < toMinutes(SHIFTS.L.demandFrom) ? "E" : "L";
}
