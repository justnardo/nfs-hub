/**
 * Core + Gateline domain types.
 * Mirrors supabase/migrations: core.* (shared with Rampline, TakeFlight) and gateline.*.
 */

export type Role = "agent" | "lead" | "supervisor" | "manager" | "admin";
export type Terminal = "US" | "INTL";
export type ShiftCode = "E" | "M" | "L" | "O" | "V";

export interface SlaAgreement {
  /** Date the airline agreed these figures (YYYY-MM-DD). */
  agreedOn: string;
  /** Who agreed them for the airline, e.g. the station manager. */
  agreedWith: string;
  /** NFS manager who recorded them in Gateline. */
  recordedBy: string;
  recordedAt: string;
  note?: string;
}

export interface SlaMinimums {
  counter: number;
  gate: number;
  jetBridge: number;
  lead: number;
  supervisor: number;
}

export interface Airline {
  code: string;
  name: string;
  /** NFS station that handles this airline (e.g. "NAS" Nassau, "GGT" Exuma). Missing means Nassau. */
  station?: string;
  terminal: Terminal;
  colour: string;
  /** Airline mark shared with Rampline (public airline-marks bucket). Falls back to the code chip. */
  logoUrl: string | null;
  aircraft: string[];
  sla: SlaMinimums;
  /** SLA figures are demo placeholders until NFS supplies the real minimums. */
  slaConfirmed: boolean;
  /** Who agreed the current SLA and when (set when a manager records a new agreement). */
  slaAgreement?: SlaAgreement;
  /** Earlier SLA figures, newest first, so a change can be traced. */
  slaHistory?: (SlaAgreement & { sla: SlaMinimums; replacedAt: string })[];
  stationManager: { name: string; phone: string; email: string; preferences: string };
  requiredTraining: string[];
  usesJetBridge: boolean;
  /** Added by a manager in the app (not part of the seed) */
  custom?: boolean;
  /** The built-in operator for charters and ad-hoc flights (no core team; any trained agent qualifies). */
  charter?: boolean;
  /** When check-in opens and closes and when boarding should start, in minutes before STD. */
  timings?: AirlineTimings;
  /**
   * Line roster, the way NFS presents rosters to agents: each line is a fixed week (Sun–Sat) of
   * shift times or days off, and each agent is put on a line. When set, the airline's roster is
   * built from its lines instead of the optimiser.
   */
  lines?: RosterLine[];
  /** Standing line for each person (personId → line label). */
  lineAssign?: Record<string, string>;
  /** Week-by-week changes to the standing line (week start → personId → line label). */
  lineWeeks?: Record<string, Record<string, string>>;
  /** Heading over the names on the printed roster, e.g. "WN PSA". Defaults to the airline's name. */
  sheetLabel?: string;
  /** Private link the station manager uses to send feedback without signing in. */
  feedbackToken?: string | null;
}

export interface AirlineTimings {
  checkInOpens: number;
  checkInCloses: number;
  boardingStarts: number;
  gateCloses: number;
}

export interface TrainingRecord {
  airline: string;
  course: string;
  completed: string; // YYYY-MM-DD
  expires: string; // YYYY-MM-DD
  source: "TakeFlight";
}

export interface Person {
  id: string;
  staffNo: string;
  firstName: string;
  lastName: string;
  role: Role;
  homeTerminal: Terminal;
  /** NFS station the person works at. Missing means Nassau. Managers and admins see every station. */
  station?: string;
  /** Core airline team this person belongs to. Null for floating supervisors/managers. */
  coreAirline: string | null;
  /** Airlines trained on (core + qualified to cover). */
  trainedAirlines: string[];
  training: TrainingRecord[];
  phone: string;
  hireYear: number;
  /** Self-service fields (staff can edit) */
  email?: string;
  photoUrl?: string | null;
  /** Managers can deactivate a staff record without deleting history */
  active?: boolean;
  /** Last day worked, for staff who have left NFS: rostered up to and including this day only. */
  leftOn?: string;
  leaving?: { reason: string; hrContact: string; hrRef?: string; recordedBy: string; at: string };
}

export interface Flight {
  id: string;
  date: string; // YYYY-MM-DD (Nassau local)
  airline: string;
  flightNo: string;
  destination: string;
  destinationName: string;
  aircraft: string;
  std: string; // HH:mm scheduled departure (local)
  sta: string; // HH:mm scheduled inbound arrival (local)
  gate: string;
  terminal: Terminal;
  paxBooked: number;
  /** One-off charter / ad-hoc flight, not part of the published schedule. */
  adhoc?: AdhocInfo;
  /** Set when the gate was changed: the gate it was moved from. */
  gateFrom?: string;
}

/** Special service request codes (IATA SSR) handled above the wing. */
export type SsrCode = "WCHR" | "WCHS" | "WCHC" | "UMNR" | "MEDA" | "BLND" | "DEAF" | "DPNA" | "PETC" | "MAAS";
export interface SsrItem {
  id: string;
  code: SsrCode;
  /** Passenger surname / initial, as on the airline list. */
  name: string;
  seat?: string;
  note?: string;
  /** Where it came from: the airline's passenger list (PNL/ADL) or added by NFS. */
  source: "airline" | "nfs";
  handled?: boolean;
  handledAt?: string;
}

export type AdhocStatus = "tentative" | "confirmed" | "cancelled";
export interface AdhocInfo {
  /** Charter id (stable across schedule regeneration). */
  id: string;
  /** Who is flying it: a tour operator, charter company or private group. */
  operator: string;
  status: AdhocStatus;
  /** Handling request / quote reference for billing. */
  ref?: string;
  notes?: string;
  /** Where the request came from: entered in Gateline or received from Rampline ops. */
  source: "gateline" | "rampline";
}

export type FlightStatus =
  | "Scheduled"
  | "Check-in open"
  | "Check-in closed"
  | "Boarding"
  | "Final call"
  | "Door closed"
  | "Departed"
  | "Delayed"
  | "Cancelled";

export type GateEventType =
  | "door_open"
  | "groomers_on"
  | "groomers_off"
  | "boarding_start"
  | "boarding_close"
  | "door_close"
  | "pushback";

export const GATE_EVENT_ORDER: GateEventType[] = [
  "door_open",
  "groomers_on",
  "groomers_off",
  "boarding_start",
  "boarding_close",
  "door_close",
  "pushback",
];

export const GATE_EVENT_LABEL: Record<GateEventType, string> = {
  door_open: "Door open",
  groomers_on: "Groomers on",
  groomers_off: "Groomers off",
  boarding_start: "Boarding start",
  boarding_close: "Boarding close",
  door_close: "Door close",
  pushback: "Pushback",
};

export type TeamPosition = "lead" | "gate" | "jetBridge" | "counter";

export interface TeamMember {
  personId: string;
  position: TeamPosition;
}

export type DelayCause =
  | "Late inbound aircraft"
  | "Passenger processing"
  | "Staffing shortfall"
  | "Catering"
  | "Cleaning / groomers"
  | "Ground equipment"
  | "Weather"
  | "ATC / airport"
  | "Airline operations"
  | "Security / TSA";

/** Causes that sit with NFS passenger services (used for fair attribution). */
export const NFS_CONTROLLABLE: DelayCause[] = ["Passenger processing", "Staffing shortfall", "Cleaning / groomers"];

export type DiscrepancyType =
  | "Pax count mismatch"
  | "Wheelchair request not pre-advised"
  | "Bag offload"
  | "No-show"
  | "Denied boarding"
  | "Documentation issue"
  | "Unruly passenger"
  | "Seat duplication"
  | "Medical";

export interface Discrepancy {
  id: string;
  type: DiscrepancyType;
  note: string;
  at: string; // HH:mm
  hasPhoto: boolean;
  /** Checked bags to come off the aircraft (no-show, offload, denied boarding). */
  bags?: number;
  bagTags?: string;
  seat?: string;
  /** Sent to Rampline so the ramp team pulls the bags; acknowledged from Rampline. */
  rampHandoff?: { sentAt: string; ackAt?: string; ackBy?: string };
}

export interface GateLog {
  id: string;
  flightId: string;
  date: string;
  airline: string;
  leadId: string;
  team: TeamMember[];
  events: Partial<Record<GateEventType, string>>; // HH:mm local
  /** Entered by the lead from the airline DCS / load sheet at check-in close. */
  paxBooked?: number | null;
  paxCheckedIn?: number | null;
  paxBoarded: number | null;
  /** Wheelchair passengers (WCHR/WCHS/WCHC) handled on this flight. */
  wheelchairs?: number | null;
  /** When final passenger figures were handed to the crew (HH:mm). */
  figuresToCrew?: string | null;
  discrepancies: Discrepancy[];
  delayMinutes: number;
  delayCause: DelayCause | null;
  notes: string;
  status: "open" | "filed";
  filedAt: string | null;
  source: "seed" | "device";
}

export interface RosterEntry {
  personId: string;
  date: string;
  shift: ShiftCode;
  /** Exact shift time when it differs from the standard band, e.g. "07:00-15:00". */
  time?: string;
}

export type LineGroup = "lead" | "supervisor";

/** One line of a line roster: a label (A, B, C…) and a week of shift times, Sunday first; null is a day off. */
export interface RosterLine {
  label: string;
  /** Seven entries, Sunday to Saturday: "07:00-15:00" or null for OFF. */
  days: (string | null)[];
  /** The line's pattern applies from this week start (inclusive), until `to` if set. Lets a line change mid-month. */
  from?: string;
  to?: string;
  /** Leads and supervisors can have their own lines, lettered from A again in their own section of the printed roster. Unset: agents' lines. */
  group?: LineGroup;
}

export interface FeedbackItem {
  id: string;
  date: string;
  airline: string;
  flightId: string | null;
  kind: "complaint" | "praise";
  from: string;
  summary: string;
  personIds: string[];
  status: "open" | "reviewed" | "closed";
  /** 1–5 stars, when given. */
  rating?: number;
  category?: string;
  /** How it reached NFS: the airline's feedback link, or logged by NFS from an email, call or visit. */
  source?: "link" | "email" | "phone" | "in person" | "seed";
  loggedBy?: string;
  at?: string;
  contact?: string;
  /** What NFS did about it, shown on the record. */
  response?: string;
}

export interface HubEvent {
  id: string;
  at: string; // ISO
  module: "gateline" | "rampline" | "takeflight" | "brain";
  type: string; // e.g. gate.door_close, agent.reassigned
  payload: Record<string, unknown>;
}

export interface Reassignment {
  id: string;
  date: string;
  shift: ShiftCode;
  personId: string;
  fromAirline: string;
  toAirline: string;
  overrideReason: string | null;
  approvedBy: string;
  at: string;
}

/** NFS stations. Each has its own airlines, staff, flights and rosters; managers switch between them. */
export interface Station {
  code: string;
  name: string;
  airport: string;
  /** Short airport label for headers, e.g. "LPIA". */
  short: string;
}
/**
 * Stations switched on in the app. Exuma is built but off for now:
 * add "GGT" here to bring back its airlines, team, rosters and the station switch.
 */
export const ENABLED_STATIONS: string[] = ["NAS"];
export const ALL_STATIONS: Station[] = [
  { code: "NAS", name: "Nassau", airport: "Lynden Pindling International Airport", short: "LPIA" },
  { code: "GGT", name: "Exuma", airport: "Exuma International Airport", short: "Exuma Intl" },
];
export const STATIONS: Station[] = ALL_STATIONS.filter((s) => ENABLED_STATIONS.includes(s.code));
export const DEFAULT_STATION = "NAS";
/** Station of an airline or person; missing means Nassau. */
export const stationOf = (x?: { station?: string } | null): string => x?.station ?? DEFAULT_STATION;
export const stationBy = (code: string): Station => ALL_STATIONS.find((s) => s.code === code) ?? ALL_STATIONS[0];
