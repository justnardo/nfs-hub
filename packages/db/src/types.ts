/**
 * Core + Gateline domain types.
 * Mirrors supabase/migrations: core.* (shared with Rampline, TakeFlight) and gateline.*.
 */

export type Role = "agent" | "lead" | "supervisor" | "manager" | "admin";
export type Terminal = "US" | "INTL";
export type ShiftCode = "E" | "M" | "L" | "O" | "V";

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
  terminal: Terminal;
  colour: string;
  /** Airline mark shared with Rampline (public airline-marks bucket). Falls back to the code chip. */
  logoUrl: string | null;
  aircraft: string[];
  sla: SlaMinimums;
  /** SLA figures are demo placeholders until NFS supplies the real minimums. */
  slaConfirmed: boolean;
  stationManager: { name: string; phone: string; email: string; preferences: string };
  requiredTraining: string[];
  usesJetBridge: boolean;
  /** Added by a manager in the app (not part of the seed) */
  custom?: boolean;
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
}

export type FlightStatus =
  | "Scheduled"
  | "Check-in open"
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
}

export interface GateLog {
  id: string;
  flightId: string;
  date: string;
  airline: string;
  leadId: string;
  team: TeamMember[];
  events: Partial<Record<GateEventType, string>>; // HH:mm local
  paxBoarded: number | null;
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
