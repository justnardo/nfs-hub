/**
 * Flight connectors shared with Rampline.
 * Live sources (Flightradar24, FlightAware AeroAPI, Damarel FiNDnet) plug in behind FlightSource;
 * demo mode derives status from the schedule and the gate log.
 */
import { toMinutes, type AirlineTimings, type Flight, type FlightStatus, type GateLog } from "@nfs/db";

export interface LiveFlightInfo {
  flightId: string;
  status: FlightStatus;
  estimatedDeparture: string | null;
  inboundEta: string | null;
  source: "schedule" | "gate-log" | "flightradar24" | "flightaware" | "findnet";
}

export interface FlightSource {
  name: LiveFlightInfo["source"];
  configured(): boolean;
  fetch(flights: Flight[]): Promise<LiveFlightInfo[]>;
}

/** FR24 / FlightAware adapters — enabled once API keys are added (Rampline trial keys can be shared). */
export const flightradar24: FlightSource = {
  name: "flightradar24",
  configured: () => !!process.env.FR24_API_TOKEN,
  async fetch() {
    return []; // wired in the Rampline merge; same adapter
  },
};
export const flightaware: FlightSource = {
  name: "flightaware",
  configured: () => !!process.env.FLIGHTAWARE_API_KEY,
  async fetch() {
    return [];
  },
};

export function deriveStatus(f: Flight, log: GateLog | undefined, today: string, nowMin: number, t?: AirlineTimings): LiveFlightInfo {
  const std = toMinutes(f.std);
  const opens = t?.checkInOpens ?? 180;
  const closes = t?.checkInCloses ?? 45;
  const base = { flightId: f.id, inboundEta: f.sta, source: (log ? "gate-log" : "schedule") as LiveFlightInfo["source"] };
  if (f.date < today) return { ...base, status: "Departed", estimatedDeparture: log?.events.pushback ?? f.std };
  if (f.date > today) return { ...base, status: "Scheduled", estimatedDeparture: f.std };
  // Gate milestones come from the lead's taps; check-in comes from the airline's timings against the clock
  const ev = log?.events ?? {};
  if (ev.pushback) return { ...base, status: "Departed", estimatedDeparture: ev.pushback };
  if (ev.door_close) return { ...base, status: "Door closed", estimatedDeparture: ev.door_close };
  if (ev.boarding_close) return { ...base, status: "Final call", estimatedDeparture: f.std };
  if (ev.boarding_start) return { ...base, status: nowMin > std ? "Delayed" : "Boarding", estimatedDeparture: f.std };
  if (nowMin > std + 5) return { ...base, status: "Delayed", estimatedDeparture: null };
  if (nowMin >= std - closes) return { ...base, status: "Check-in closed", estimatedDeparture: f.std };
  if (nowMin >= std - opens) return { ...base, status: "Check-in open", estimatedDeparture: f.std };
  return { ...base, status: "Scheduled", estimatedDeparture: f.std };
}
