import { ENABLED_STATIONS, type Airline, type FlightKind, type RosterLine } from "@nfs/db";

/** Airline marks uploaded in Rampline (public bucket), reused so both modules show the same logos. */
export const RAMPLINE_MARKS = "https://cajatvbkaltwxtywpsjp.supabase.co/storage/v1/object/public/airline-marks";

/**
 * Above-the-wing carriers handled by NFS passenger services (demo set).
 * SLA minimums are PLACEHOLDERS until NFS supplies the contracted figures — flagged slaConfirmed: false.
 * Station manager names/contacts are fictional.
 */
/**
 * Breeze's lines, modelled on NFS's own line roster. Times only; who is on which line is set per team.
 * The second set of D–G applies from the current week, the way a mid-month change shows on the printed roster.
 */
const O = null;
const BREEZE_LINES: RosterLine[] = [
  { label: "A", days: ["07:00-15:00", "06:00-14:00", O, "09:00-17:00", "07:00-15:00", "06:00-14:00", O] },
  { label: "B", days: ["07:00-15:00", "06:00-14:00", O, O, "07:00-15:00", "06:00-14:00", "09:00-17:00"] },
  { label: "C", days: ["07:00-15:00", "06:00-14:00", O, O, "07:00-15:00", "06:00-14:00", "09:00-17:00"] },
  { label: "D", to: "@this-week-1", days: ["07:00-15:00", "06:00-14:00", O, O, "08:00-16:00", "14:00-22:00", "09:00-17:00"] },
  { label: "E", to: "@this-week-1", days: ["12:00-20:00", "14:00-22:00", O, O, "07:00-15:00", "06:00-14:00", "09:00-17:00"] },
  { label: "F", to: "@this-week-1", days: ["07:00-15:00", "06:00-14:00", O, O, "08:00-16:00", "14:00-22:00", "09:00-17:00"] },
  { label: "G", to: "@this-week-1", days: ["14:00-22:00", "14:00-22:00", O, O, "07:00-15:00", "06:00-14:00", "09:00-17:00"] },
  { label: "D", from: "@this-week", days: ["07:00-15:00", "06:00-14:00", O, O, "14:00-22:00", "14:00-22:00", "09:00-17:00"] },
  { label: "E", from: "@this-week", days: ["14:00-22:00", "14:00-22:00", O, O, "07:00-15:00", "06:00-14:00", "14:00-22:00"] },
  { label: "F", from: "@this-week", days: ["07:00-15:00", "06:00-14:00", O, O, "14:00-22:00", "14:00-22:00", "09:00-17:00"] },
  { label: "G", from: "@this-week", days: ["14:00-22:00", "14:00-22:00", O, O, "07:00-15:00", "06:00-14:00", "14:00-22:00"] },
  // The leads' own section at the foot of the roster
  { label: "A", group: "lead", days: ["07:00-15:00", "06:00-14:00", O, O, "07:00-15:00", "06:00-14:00", "09:00-17:00"] },
  { label: "B", group: "lead", days: ["14:00-22:00", "14:00-22:00", O, O, "07:00-15:00", "06:00-14:00", "14:00-22:00"] },
];

/** Southwest's lines, modelled on NFS's issued roster: agents A–F, a supervisor line, and two lead lines. */
const NINE = "09:00-17:00";
const SOUTHWEST_LINES: RosterLine[] = [
  { label: "A", days: [NINE, NINE, NINE, "08:00-16:00", O, O, NINE] },
  { label: "B", days: [NINE, NINE, NINE, NINE, O, O, NINE] },
  { label: "C", days: [NINE, O, O, NINE, NINE, NINE, NINE] },
  { label: "D", days: [O, NINE, NINE, NINE, NINE, NINE, O] },
  { label: "E", days: [O, O, NINE, NINE, NINE, NINE, NINE] },
  { label: "F", days: [NINE, NINE, O, O, NINE, NINE, NINE] },
  { label: "A", group: "supervisor", days: [NINE, NINE, NINE, NINE, NINE, O, O] },
  { label: "A", group: "lead", days: [NINE, NINE, O, O, NINE, NINE, NINE] },
  { label: "B", group: "lead", days: [NINE, NINE, NINE, NINE, O, O, NINE] },
];

const ALL_AIRLINES: Airline[] = [
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
    timings: { checkInOpens: 150, checkInCloses: 40, boardingStarts: 30, gateCloses: 10 },
    usesJetBridge: false,
  },
  {
    code: "WN",
    name: "Southwest Airlines",
    terminal: "US",
    colour: "#d97706",
    logoUrl: null,
    aircraft: ["B737-700", "B737-800", "B737 MAX 8"],
    sla: { counter: 3, gate: 2, jetBridge: 1, lead: 1, supervisor: 0 },
    slaConfirmed: false,
    stationManager: { name: "J. Okafor", phone: "+1 242 555 0125", email: "nas.station@example-southwest.com", preferences: "Open seating: boarding groups called strictly in order. Two bags fly free, so expect heavy counter volume." },
    requiredTraining: ["Southwest Customer Service", "Preclearance Procedures", "Jet Bridge Operation"],
    usesJetBridge: true,
    // Southwest is on lines too: one 0900–1700 shift, days off staggered so all seven days are covered,
    // with the supervisor and the leads on lines of their own (see SOUTHWEST_LINES).
    lines: SOUTHWEST_LINES,
    sheetLabel: "WN PSA",
  },
  {
    code: "CM",
    name: "Copa Airlines",
    terminal: "INTL",
    colour: "#1e3a8a",
    logoUrl: null,
    aircraft: ["B737-800", "B737 MAX 9"],
    sla: { counter: 3, gate: 2, jetBridge: 1, lead: 1, supervisor: 0 },
    slaConfirmed: false,
    stationManager: { name: "L. Batista", phone: "+1 242 555 0136", email: "nas@example-copa.com", preferences: "Spanish-speaking agent on the counter. Through-check onward connections at Panama." },
    requiredTraining: ["Copa Airlines DCS", "Jet Bridge Operation"],
    usesJetBridge: true,
  },
  {
    code: "MX",
    name: "Breeze Airways",
    terminal: "US",
    colour: "#0284c7",
    logoUrl: null,
    aircraft: ["A220-300", "E195"],
    sla: { counter: 3, gate: 2, jetBridge: 1, lead: 1, supervisor: 0 },
    slaConfirmed: false,
    stationManager: { name: "S. Whitfield", phone: "+1 242 555 0148", email: "nas@example-breeze.com", preferences: "Paid-bag checks at the counter; seasonal days of operation change each quarter." },
    requiredTraining: ["Breeze Customer Service", "Preclearance Procedures", "Jet Bridge Operation"],
    usesJetBridge: true,
    // Breeze is rostered in lines, the way NFS issues its rosters: fixed weeks, Tuesday and Wednesday off.
    // Lines D–G change pattern part-way through the month (see BREEZE_LINES).
    lines: BREEZE_LINES,
  },
  {
    code: "PD",
    name: "Porter Airlines",
    terminal: "INTL",
    colour: "#334155",
    logoUrl: null,
    aircraft: ["E195-E2"],
    sla: { counter: 3, gate: 2, jetBridge: 1, lead: 1, supervisor: 0 },
    slaConfirmed: false,
    stationManager: { name: "A. Leclerc", phone: "+1 242 555 0154", email: "nas@example-porter.com", preferences: "Bilingual (English/French) agent preferred. Complimentary service: no paid seat upgrades at the gate." },
    requiredTraining: ["Porter Customer Service", "Jet Bridge Operation"],
    usesJetBridge: true,
  },
  {
    code: "BA",
    name: "British Airways",
    terminal: "INTL",
    colour: "#9f1239",
    logoUrl: null,
    aircraft: ["B777-200ER"],
    sla: { counter: 5, gate: 3, jetBridge: 1, lead: 1, supervisor: 1 },
    slaConfirmed: false,
    stationManager: { name: "P. Ashcombe", phone: "+1 242 555 0172", email: "nas@example-ba.com", preferences: "Wide-body: separate Club and Executive Club Gold counter. Supervisor present from check-in open to doors closed." },
    requiredTraining: ["British Airways DCS", "Wide-body Boarding", "Jet Bridge Operation"],
    usesJetBridge: true,
  },
  // ---- Exuma station (GGT): one terminal, walk-out boarding, no jet bridges ----
  {
    code: "AA",
    name: "American Airlines",
    station: "GGT",
    terminal: "INTL",
    colour: "#0078d2",
    logoUrl: null,
    aircraft: ["E175", "A319"],
    sla: { counter: 2, gate: 1, jetBridge: 0, lead: 1, supervisor: 0 },
    slaConfirmed: false,
    stationManager: { name: "K. Rolle", phone: "+1 242 555 0271", email: "ggt@example-aa.com", preferences: "Walk-out boarding; one agent at the stairs. Weight-and-balance figures to the captain before door close." },
    requiredTraining: ["American DCS", "Walk-out Boarding Safety"],
    timings: { checkInOpens: 180, checkInCloses: 45, boardingStarts: 35, gateCloses: 10 },
    usesJetBridge: false,
  },
  {
    code: "DL",
    name: "Delta Air Lines",
    station: "GGT",
    terminal: "INTL",
    colour: "#c8102e",
    logoUrl: null,
    aircraft: ["B737-800", "A320"],
    sla: { counter: 2, gate: 1, jetBridge: 0, lead: 1, supervisor: 0 },
    slaConfirmed: false,
    stationManager: { name: "S. Ferguson", phone: "+1 242 555 0284", email: "ggt@example-delta.com", preferences: "Weekend service. Bag tags checked twice; no gate-checked bags over 22 kg." },
    requiredTraining: ["Delta DCS", "Walk-out Boarding Safety"],
    timings: { checkInOpens: 180, checkInCloses: 45, boardingStarts: 40, gateCloses: 10 },
    usesJetBridge: false,
  },
  {
    code: "CHR",
    name: "Charters & ad-hoc",
    terminal: "INTL",
    colour: "#64748b",
    logoUrl: null,
    aircraft: [],
    sla: { counter: 3, gate: 2, jetBridge: 1, lead: 1, supervisor: 0 },
    slaConfirmed: false,
    stationManager: { name: "NFS Operations Control", phone: "+1 242 555 0100", email: "ops@nfsbahamas.example", preferences: "One-off flights. Staffing per flight is set when the charter is confirmed; any agent with the charter briefing can work them." },
    requiredTraining: ["Charter Handling Briefing"],
    usesJetBridge: true,
    charter: true,
  },
];

/** Airlines at the stations switched on (see ENABLED_STATIONS). */
export const AIRLINES: Airline[] = ALL_AIRLINES.filter((a) => ENABLED_STATIONS.includes(a.station ?? "NAS"));

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
  /** Missing = turnaround. For arrival-only flights, std holds the arrival time. */
  kind?: FlightKind;
  /** Inbound leg (turnarounds and arrivals). */
  inboundNo?: string;
  origin?: string;
  originName?: string;
  /** Scheduled arrival; when missing it's std minus turnMins. */
  sta?: string;
  /** The inbound lands the evening before and the aircraft remains overnight. */
  overnight?: boolean;
  /** Entered in Gateline, or synced from Rampline / the airline (future). */
  source?: "gateline" | "rampline" | "airline";
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
  // Southwest — US Departures Terminal
  { airline: "WN", flightNo: "WN 1882", dest: "FLL", destName: "Fort Lauderdale", std: "12:10", turnMins: 50, aircraft: "B737-800", gate: "C32", seats: 175 },
  { airline: "WN", flightNo: "WN 2471", dest: "BWI", destName: "Baltimore", std: "14:05", turnMins: 55, aircraft: "B737 MAX 8", gate: "C32", seats: 175, days: [0, 4, 5, 6] },
  // Breeze — US Departures Terminal
  { airline: "MX", flightNo: "MX 811", dest: "CHS", destName: "Charleston", std: "13:10", turnMins: 50, aircraft: "A220-300", gate: "C30", seats: 137, days: [1, 4, 5, 0] },
  { airline: "MX", flightNo: "MX 637", dest: "ORF", destName: "Norfolk", std: "16:15", turnMins: 50, aircraft: "A220-300", gate: "C36", seats: 137, days: [0, 6] },
  // Copa — International
  { airline: "CM", flightNo: "CM 336", dest: "PTY", destName: "Panama City", std: "15:05", turnMins: 60, aircraft: "B737-800", gate: "D42", seats: 160 },
  // Porter — International
  { airline: "PD", flightNo: "PD 2793", dest: "YYZ", destName: "Toronto", std: "14:30", turnMins: 55, aircraft: "E195-E2", gate: "D46", seats: 132, days: [0, 3, 4, 6] },
  // British Airways — International (wide-body via Grand Cayman)
  { airline: "BA", flightNo: "BA 252", dest: "LHR", destName: "London Heathrow", std: "17:55", turnMins: 85, aircraft: "B777-200ER", gate: "D48", seats: 275, days: [0, 2, 4] },
  // Exuma (GGT) — appended last so Nassau's generated data is unchanged
  { airline: "AA", flightNo: "AA 2879", dest: "MIA", destName: "Miami", std: "12:45", turnMins: 50, aircraft: "E175", gate: "G1", seats: 76 },
  { airline: "AA", flightNo: "AA 1062", dest: "CLT", destName: "Charlotte", std: "16:30", turnMins: 55, aircraft: "A319", gate: "G2", seats: 128, days: [0, 4, 6] },
  { airline: "DL", flightNo: "DL 1846", dest: "ATL", destName: "Atlanta", std: "14:20", turnMins: 60, aircraft: "B737-800", gate: "G1", seats: 160, days: [0, 5, 6] },
];

/** A one-off charter or ad-hoc flight. Lives alongside the schedule rather than in it. */
export interface Charter {
  id: string;
  /** Carrier whose team and SLA are used: an airline code, or "CHR" for third-party operators. */
  handledAs: string;
  operator: string;
  flightNo: string;
  date: string;
  std: string;
  sta: string;
  dest: string;
  destName: string;
  aircraft: string;
  gate: string;
  terminal: "US" | "INTL";
  pax: number;
  status: "tentative" | "confirmed" | "cancelled";
  ref?: string;
  notes?: string;
  source: "gateline" | "rampline";
  createdBy?: string;
  createdAt?: string;
  /** Missing = turnaround (charters usually depart only). */
  kind?: FlightKind;
  inboundNo?: string;
  origin?: string;
  originName?: string;
}

/** Demo charters, placed relative to today so there is always one recent and one coming up. */
export function demoCharters(addDaysFn: (d: string, n: number) => string, today: string): Charter[] {
  return [
    { id: "chr-demo-1", handledAs: "CHR", operator: "Sun Wings Holidays (tour operator)", flightNo: "SWH 404", date: addDaysFn(today, -4), std: "12:40", sta: "11:10", dest: "YUL", destName: "Montréal", aircraft: "B737-800", gate: "D45", terminal: "INTL", pax: 168, status: "confirmed", ref: "NFS-HR-2611-031", notes: "Group of 160, pre-assigned seats. Operator rep at the counter from 09:30.", source: "rampline" },
    { id: "chr-demo-2", handledAs: "CHR", operator: "Atlantic Sports Charter (university team)", flightNo: "ASC 18", date: addDaysFn(today, 2), std: "10:30", sta: "09:15", dest: "MIA", destName: "Miami", aircraft: "A320", gate: "C38", terminal: "US", pax: 112, status: "confirmed", ref: "NFS-HR-2611-044", notes: "Oversize sports equipment; extra counter agent for bag tags.", source: "gateline" },
    { id: "chr-demo-3", handledAs: "CHR", operator: "Private group (wedding party)", flightNo: "N512PJ", date: addDaysFn(today, 6), std: "15:30", sta: "14:30", dest: "TEB", destName: "Teterboro", aircraft: "E190 (VIP)", gate: "D49", terminal: "INTL", pax: 40, status: "tentative", ref: "Quote Q-0871", notes: "Awaiting operator confirmation. Walk-out boarding.", source: "gateline" },
  ];
}
