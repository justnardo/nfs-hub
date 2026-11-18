import type { Flight } from "@nfs/db";

export const FEEDBACK_CATEGORIES = ["Check-in", "Boarding", "Gate team", "Wheelchair / assistance", "Communication", "Staff conduct", "Baggage", "Other"] as const;
export const FEEDBACK_SOURCES = { link: "Feedback link", email: "Email", phone: "Phone call", "in person": "In person", seed: "Station manager" } as const;

/** Recent departures an airline would comment on: last 10 days up to now, newest first. */
export function recentFlights(flights: Flight[], airline: string, today: string, nowMin: number, addDays: (d: string, n: number) => string): Flight[] {
  const from = addDays(today, -10);
  const [h, m] = [Math.floor(nowMin / 60), nowMin % 60];
  const now = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return flights
    .filter((f) => f.airline === airline && f.date >= from && (f.date < today || (f.date === today && f.std <= now)))
    .sort((a, b) => (b.date + b.std).localeCompare(a.date + a.std));
}

