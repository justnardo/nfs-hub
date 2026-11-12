import type { Airline } from "@nfs/db";

/** Airline marks uploaded in Rampline (public bucket), reused so both modules show the same logos. */
export const RAMPLINE_MARKS = "https://cajatvbkaltwxtywpsjp.supabase.co/storage/v1/object/public/airline-marks";

/**
 * Above-the-wing carriers handled by NFS passenger services (demo set).
 * SLA minimums are PLACEHOLDERS until NFS supplies the contracted figures — flagged slaConfirmed: false.
 * Station manager names/contacts are fictional.
 */
export const AIRLINES: Airline[] = [
  {
    code: "UA",
    name: "United Airlines",
    terminal: "US",
    colour: "#1d4ed8",
    logoUrl: `${RAMPLINE_MARKS}/UA/ebfcedc1-c434-4fc7-9911-0afad158698f.jpg`,
    aircraft: ["B737-800", "B737 MAX 8", "A320"],
    sla: { counter: 4, gate: 3, jetBridge: 1, lead: 1, supervisor: 1 },
    slaConfirmed: false,
    stationManager: { name: "D. Hartwell", phone: "+1 242 555 0141", email: "station.nas@example-ua.com", preferences: "Dedicated core team only. Notify 24h before any non-core agent is placed on a flight." },
    requiredTraining: ["United Customer Service", "Preclearance Procedures", "Jet Bridge Operation"],
    usesJetBridge: true,
  },
  {
    code: "AC",
    name: "Air Canada",
    terminal: "INTL",
    colour: "#dc2626",
    logoUrl: `${RAMPLINE_MARKS}/AC/40a5c505-b384-4b2c-9e9e-44cdfcb9a65c.webp`,
    aircraft: ["A220-300", "B737 MAX 8"],
    sla: { counter: 3, gate: 2, jetBridge: 1, lead: 1, supervisor: 0 },
    slaConfirmed: false,
    stationManager: { name: "M. Lavoie", phone: "+1 242 555 0177", email: "nas.station@example-ac.com", preferences: "Bilingual agent preferred on gate." },
    requiredTraining: ["Air Canada Altea DCS", "Jet Bridge Operation"],
    usesJetBridge: true,
  },
  {
    code: "WS",
    name: "WestJet",
    terminal: "INTL",
    colour: "#0d9488",
    logoUrl: `${RAMPLINE_MARKS}/WS/3f861235-20f2-4e4b-b8c2-8832e80bb27e.png`,
    aircraft: ["B737-800", "B737 MAX 8"],
    sla: { counter: 3, gate: 2, jetBridge: 1, lead: 1, supervisor: 0 },
    slaConfirmed: false,
    stationManager: { name: "K. Brandt", phone: "+1 242 555 0192", email: "nas@example-westjet.com", preferences: "Weekly OTP summary every Monday." },
    requiredTraining: ["WestJet Customer Service", "Jet Bridge Operation"],
    usesJetBridge: true,
  },
  {
    code: "BW",
    name: "Caribbean Airlines",
    terminal: "INTL",
    colour: "#ea580c",
    logoUrl: `${RAMPLINE_MARKS}/BW/2305a86e-e4bc-4035-b4da-648961af8c8d.png`,
    aircraft: ["B737-800", "B737 MAX 8"],
    sla: { counter: 3, gate: 2, jetBridge: 1, lead: 1, supervisor: 0 },
    slaConfirmed: false,
    stationManager: { name: "R. Ramdial", phone: "+1 242 555 0118", email: "nas@example-caribbean.com", preferences: "Through-check documentation checks at counter." },
    requiredTraining: ["Caribbean Airlines DCS", "Jet Bridge Operation"],
    usesJetBridge: true,
  },
  {
    code: "JY",
    name: "InterCaribbean Airways",
    terminal: "INTL",
    colour: "#7c3aed",
    logoUrl: `${RAMPLINE_MARKS}/JY/6419245f-7c11-4aa3-95b4-c3e242d95b8e.png`,
    aircraft: ["ERJ-145", "EMB-120"],
    sla: { counter: 2, gate: 2, jetBridge: 0, lead: 1, supervisor: 0 },
    slaConfirmed: false,
    stationManager: { name: "T. Missick", phone: "+1 242 555 0163", email: "nas@example-intercaribbean.com", preferences: "Walk-out boarding; two agents on the ramp line." },
    requiredTraining: ["InterCaribbean DCS"],
    usesJetBridge: false,
  },
];

export interface RouteTemplate {
  airline: string;
  flightNo: string;
  dest: string;
  destName: string;
  std: string;
  turnMins: number;
  aircraft: string;
  gate: string;
  /** days of week operated (0 = Sun); undefined = daily */
  days?: number[];
  seats: number;
}

export const ROUTES: RouteTemplate[] = [
  // United — US Departures Terminal
  { airline: "UA", flightNo: "UA 1712", dest: "EWR", destName: "Newark", std: "07:40", turnMins: 60, aircraft: "B737-800", gate: "C34", seats: 166 },
  { airline: "UA", flightNo: "UA 2208", dest: "IAH", destName: "Houston", std: "11:55", turnMins: 60, aircraft: "B737 MAX 8", gate: "C36", seats: 166 },
  { airline: "UA", flightNo: "UA 1544", dest: "ORD", destName: "Chicago O'Hare", std: "15:20", turnMins: 65, aircraft: "B737-800", gate: "C34", seats: 166, days: [0, 3, 4, 5, 6] },
  { airline: "UA", flightNo: "UA 1189", dest: "IAD", destName: "Washington Dulles", std: "18:45", turnMins: 60, aircraft: "A320", gate: "C38", seats: 150 },
  // Air Canada — International
  { airline: "AC", flightNo: "AC 1265", dest: "YYZ", destName: "Toronto", std: "13:30", turnMins: 75, aircraft: "B737 MAX 8", gate: "D41", seats: 169 },
  { airline: "AC", flightNo: "AC 1709", dest: "YUL", destName: "Montréal", std: "16:35", turnMins: 70, aircraft: "A220-300", gate: "D43", seats: 137, days: [0, 2, 4, 6] },
  // WestJet
  { airline: "WS", flightNo: "WS 2645", dest: "YYZ", destName: "Toronto", std: "12:10", turnMins: 70, aircraft: "B737-800", gate: "D45", seats: 174 },
  // Caribbean Airlines
  { airline: "BW", flightNo: "BW 61", dest: "KIN", destName: "Kingston", std: "10:15", turnMins: 60, aircraft: "B737-800", gate: "D44", seats: 154, days: [1, 3, 5, 0] },
  // InterCaribbean
  { airline: "JY", flightNo: "JY 431", dest: "PLS", destName: "Providenciales", std: "09:05", turnMins: 50, aircraft: "ERJ-145", gate: "D47", seats: 50 },
  { airline: "JY", flightNo: "JY 437", dest: "PLS", destName: "Providenciales", std: "16:50", turnMins: 50, aircraft: "ERJ-145", gate: "D47", seats: 50, days: [1, 3, 5, 0] },
];
