import { addDays, type Airline, type Person } from "@nfs/db";

export type Eligibility = { ok: true } | { ok: false; reason: string };

/** Trained and current on the airline (TakeFlight records). */
export function eligibleFor(person: Person, airline: Airline, onDate: string): Eligibility {
  if (!person.trainedAirlines.includes(airline.code)) return { ok: false, reason: `Not trained on ${airline.name}` };
  const recs = person.training.filter((t) => t.airline === airline.code);
  const missing = airline.requiredTraining.filter((c) => !recs.some((t) => t.course === c));
  if (missing.length) return { ok: false, reason: `Missing ${missing.join(", ")}` };
  const expired = recs.filter((t) => t.expires < onDate);
  if (expired.length) return { ok: false, reason: `${expired[0].course} expired ${expired[0].expires}` };
  return { ok: true };
}

export function expiringSoon(person: Person, onDate: string, days = 30) {
  const limit = addDays(onDate, days);
  return person.training.filter((t) => t.expires >= onDate && t.expires <= limit);
}
