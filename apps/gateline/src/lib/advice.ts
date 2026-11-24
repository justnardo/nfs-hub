import type { FlightOps } from "@nfs/db";
import type { Flight, SsrCode, SsrItem } from "@nfs/db";
import { rng } from "@nfs/demo";

/** Per-flight pre-departure information: special service requests and gate changes. */
export interface FlightAdvice {
  flightId: string;
  ssr: SsrItem[];
  gate?: string;
  gateFrom?: string;
  gateChangedAt?: string;
  gateChangedBy?: string;
  gateReason?: string;
  /** Passenger services acknowledgements of inbound alerts, by alert id. */
  alertAcks?: Record<string, { by: string; at: string }>;
  /** Day-of change: cancelled, delayed or remain overnight. */
  ops?: FlightOps;
}

export const INBOUND_CATEGORIES = ["Medical emergency", "Extra wheelchairs", "Unruly passenger", "Deportee / escort", "Inbound delay", "Diversion", "Other"] as const;
export type InboundCategory = (typeof INBOUND_CATEGORIES)[number];

/** An issue on an inbound flight posted by the operations team in Rampline. */
export interface InboundAlert {
  id: string;
  flightNo: string;
  date: string;
  category: InboundCategory;
  message: string;
  /** Extra wheelchairs needed at the aircraft door on arrival. */
  wheelchairs?: number;
  urgent: boolean;
  by: string;
  at: string;
}

/** Demo: Rampline operations flagged a medical case on today's InterCaribbean inbound. */
export function demoInbound(today: string, flights: Flight[], nowMin: number): InboundAlert[] {
  const f = flights.find((x) => x.date === today && x.flightNo === "JY 437") ?? flights.find((x) => x.date === today && (x.airline === "JY" || x.airline === "BW"));
  if (!f) return [];
  const [h, m] = f.sta.split(":").map(Number);
  const mins = Math.max(0, Math.min(nowMin - 12, h * 60 + m - 50));
  const hhmm = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return [{
    id: `inb-${f.id}`,
    flightNo: f.flightNo,
    date: f.date,
    category: "Medical emergency",
    message: "Passenger on the inbound unwell (suspected cardiac). Paramedics requested at the gate; crew asks for a wheelchair at the door and one for the travelling companion.",
    wheelchairs: 2,
    urgent: true,
    by: "NFS Operations Control",
    at: new Date(`${today}T${hhmm}:00-05:00`).toISOString(),
  }];
}

/** An alert for one or more staff (team assignment, gate change, new request, inbound issue). */
export interface Notice {
  id: string;
  to: string[];
  kind: "team" | "gate" | "ssr" | "offload" | "inbound";
  title: string;
  body: string;
  href: string;
  at: string;
  by: string;
  readBy: string[];
}

export const SSR_LABEL: Record<SsrCode, string> = {
  WCHR: "Wheelchair · can climb stairs",
  WCHS: "Wheelchair · can't climb stairs",
  WCHC: "Wheelchair · fully immobile",
  UMNR: "Unaccompanied minor",
  MEDA: "Medical case",
  BLND: "Blind passenger",
  DEAF: "Deaf passenger",
  DPNA: "Intellectual or developmental disability",
  PETC: "Pet in cabin",
  MAAS: "Meet and assist",
};
export const WHEELCHAIR: SsrCode[] = ["WCHR", "WCHS", "WCHC"];
export const SSR_CODES = Object.keys(SSR_LABEL) as SsrCode[];

const SURNAMES = ["Albury", "Bethel", "Cartwright", "Deveaux", "Ferguson", "Gibson", "Hanna", "Johnson", "Knowles", "Lightbourne", "Moss", "Newbold", "Pinder", "Rolle", "Sands", "Thompson", "Wells", "Young"];
const INIT = "ABCDEFGHJKLMNPRSTW";

/** Demo pre-advised requests. Names are fictional. Deterministic per flight; about one flight in three has none. */
export function demoSsr(f: Flight): SsrItem[] {
  if (f.adhoc) return [];
  const r = rng(`ssr-${f.id}`);
  if (r.chance(0.3)) return [];
  const weighted: [SsrCode, number][] = [["WCHR", 46], ["WCHS", 14], ["WCHC", 6], ["UMNR", 10], ["MEDA", 4], ["MAAS", 9], ["PETC", 6], ["BLND", 2], ["DEAF", 2], ["DPNA", 1]];
  const total = weighted.reduce((s, [, w]) => s + w, 0);
  const n = r.int(1, f.paxBooked > 150 ? 5 : 3);
  const out: SsrItem[] = [];
  for (let i = 0; i < n; i++) {
    let x = r.next() * total;
    let code: SsrCode = "WCHR";
    for (const [c, w] of weighted) if ((x -= w) <= 0) { code = c; break; }
    const row = r.int(3, 32);
    out.push({
      id: `${f.id}-ssr${i}`,
      code,
      name: `${r.pick(SURNAMES)}/${INIT[r.int(0, INIT.length - 1)]}`,
      seat: `${row}${"ABCDEF"[r.int(0, 5)]}`,
      note: code === "UMNR" ? "Hand over to crew with documents" : code === "MEDA" ? "Medical clearance on file" : code === "PETC" ? "Carrier under seat" : undefined,
      source: "airline",
    });
  }
  return out;
}
