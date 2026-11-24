import { departsToday, effectiveStd, type Airline, type Flight, type ShiftCode } from "./types";
import { addDays, toMinutes } from "./time";

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
  if (!departsToday(f)) return 0; // arrivals, cancellations and overnighted flights need no check-in or gate team
  const std = toMinutes(effectiveStd(f));
  if (t >= std - COUNTER_OPEN_MIN && t < std - COUNTER_CLOSE_MIN) return a.sla.counter;
  if (t >= std - GATE_FROM_MIN && t < std + GATE_TO_MIN) return a.sla.gate + a.sla.jetBridge;
  return 0;
}

/** Arrivals are met from 15 minutes before landing to 30 minutes after. */
export const ARRIVAL_BEFORE_MIN = 15;
export const ARRIVAL_AFTER_MIN = 30;

/** The date this flight's inbound lands here, or null when there's no inbound to meet. */
export function arrivalDateOf(f: Flight): string | null {
  if (f.kind === "departure" || f.ronOf || f.ops?.status === "cancelled") return null;
  return f.overnight ? addDays(f.date, -1) : f.date;
}

/** The aircraft doesn't leave again on this visit: arrival only, scheduled RON, or kept overnight today. */
export const visitEndsHere = (f: Flight) => f.kind === "arrival" || f.ops?.status === "ron" || (!!f.overnight && !f.ronOf);

/** The airline's arrival SLA with defaults filled in. */
export const arrivalSla = (a: Airline) => ({ meet: a.sla.arrival ?? 1, perWheelchair: a.sla.arrivalPerWheelchair ?? 1, perService: a.sla.arrivalPerService ?? 1 });

/** Agents needed to meet this flight's arrival: the airline's base for visits that end here, plus extras for requests. */
export function flightArrivalNeed(f: Flight, a: Airline): number {
  if (!arrivalDateOf(f)) return 0;
  const s = arrivalSla(a);
  const n = f.arrivalNeeds;
  const extras = n ? n.wheelchairs * s.perWheelchair + (n.meetGreet + n.special) * s.perService : 0;
  return (visitEndsHere(f) ? s.meet : 0) + extras;
}

/** Agents needed at minute t of the arrival date. */
export function flightArrivalNeedAt(f: Flight, a: Airline, t: number): number {
  const sta = toMinutes(f.sta);
  if (t < sta - ARRIVAL_BEFORE_MIN || t >= sta + ARRIVAL_AFTER_MIN) return 0;
  return flightArrivalNeed(f, a);
}

export function flightActiveAt(f: Flight, t: number): boolean {
  if (!departsToday(f)) return false;
  const std = toMinutes(effectiveStd(f));
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
      const need = flightAgentNeedAt(f, airline, t) + (arrivalDateOf(f) === f.date ? flightArrivalNeedAt(f, airline, t) : 0);
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
