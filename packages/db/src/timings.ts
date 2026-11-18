import type { Airline, AirlineTimings } from "./types";

/**
 * The airline's own timings (set on its profile), or NFS defaults: US preclearance closes check-in
 * 60 minutes out, international 45; wide-bodies open earlier and board earlier.
 */
export function timingsFor(a?: Pick<Airline, "terminal" | "timings" | "aircraft"> | null): AirlineTimings {
  if (a?.timings) return a.timings;
  const wide = a?.aircraft.some((x) => /^(B7[678]7|B777|A33|A35|A38)/.test(x.replace(/\s/g, "")));
  if (wide) return { checkInOpens: 210, checkInCloses: 60, boardingStarts: 55, gateCloses: 20 };
  if (a?.terminal === "US") return { checkInOpens: 180, checkInCloses: 60, boardingStarts: 45, gateCloses: 15 };
  return { checkInOpens: 180, checkInCloses: 45, boardingStarts: 40, gateCloses: 15 };
}
