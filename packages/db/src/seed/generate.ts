import type {
  Airline, DelayCause, Discrepancy, DiscrepancyType, FeedbackItem, Flight, GateEventType, GateLog,
  Person, Role, RosterEntry, ShiftCode, TeamMember, Terminal, TrainingRecord,
} from "../types";
import { AIRLINES, ROUTES } from "./airlines";
import { FIRST_NAMES, LAST_NAMES } from "./names";
import { rng } from "./prng";
import { addDays, dayOfWeek, fromMinutes, rangeDays, toMinutes, weekStart } from "../time";
import { shiftDemand, shiftForStd } from "../demand";

export interface Dataset {
  today: string;
  nowMinutes: number;
  windowStart: string;
  windowDays: string[];
  airlines: Airline[];
  people: Person[];
  flights: Flight[];
  roster: RosterEntry[];
  gateLogs: GateLog[];
  feedback: FeedbackItem[];
}

const TEAM_PLAN: { airline: string; leads: number; agents: number }[] = [
  { airline: "UA", leads: 3, agents: 13 },
  { airline: "AC", leads: 2, agents: 10 },
  { airline: "WS", leads: 2, agents: 6 },
  { airline: "BW", leads: 1, agents: 5 },
  { airline: "JY", leads: 2, agents: 6 },
  { airline: "WU", leads: 2, agents: 7 },
];
const FLOAT_POOL = 5;
const SUPERVISORS: Terminal[] = ["US", "US", "INTL", "INTL"];

const COURSES: Record<string, string[]> = Object.fromEntries(AIRLINES.map((a) => [a.code, a.requiredTraining]));

/** Every valid Sun–Sat pattern: 2 consecutive days off inside the week, E before L in each block, ≤3 lates in a row. */
export function validWeekPatterns(): ShiftCode[][] {
  const out: ShiftCode[][] = [];
  for (let off = 0; off <= 5; off++) {
    for (let mask = 0; mask < 32; mask++) {
      const p: ShiftCode[] = [];
      let bit = 0;
      for (let d = 0; d < 7; d++) {
        if (d === off || d === off + 1) p.push("O");
        else p.push(mask & (1 << bit++) ? "L" : "E");
      }
      let ok = true;
      let lateRun = 0;
      for (let d = 0; d < 7; d++) {
        if (d > 0 && p[d - 1] === "L" && p[d] === "E") ok = false;
        lateRun = p[d] === "L" ? lateRun + 1 : 0;
        if (lateRun > 3) ok = false;
      }
      if (ok) out.push(p);
    }
  }
  return out;
}

function boundaryOk(prev: ShiftCode[] | undefined, next: ShiftCode[]): boolean {
  if (!prev) return true;
  if (prev[6] === "L" && next[0] === "E") return false;
  let run = 0;
  for (const s of [...prev, ...next]) {
    run = s === "L" ? run + 1 : 0;
    if (run > 3) return false;
  }
  return true;
}

function makeName(r: ReturnType<typeof rng>, used: Set<string>) {
  for (let i = 0; i < 200; i++) {
    const f = r.pick(FIRST_NAMES);
    const l = r.pick(LAST_NAMES);
    if (!used.has(`${f} ${l}`)) {
      used.add(`${f} ${l}`);
      return { f, l };
    }
  }
  return { f: "Demo", l: `Agent${used.size}` };
}

function training(r: ReturnType<typeof rng>, airline: string, today: string, risk = 0.06): TrainingRecord[] {
  return COURSES[airline].map((course) => {
    const completed = addDays(today, -r.int(60, 700));
    let expires = addDays(completed, 730);
    if (r.chance(risk)) expires = addDays(today, r.int(-20, 25)); // a few expired / expiring soon
    return { airline, course, completed, expires, source: "TakeFlight" as const };
  });
}

export function generateDataset(today: string, nowMinutes: number): Dataset {
  const r = rng(`gateline-people-v1`);
  const used = new Set<string>();
  const people: Person[] = [];
  let staffNo = 4100;

  const mkPerson = (role: Role, terminal: Terminal, core: string | null, trained: string[], hireYear: number): Person => {
    const { f, l } = makeName(r, used);
    const t = trained.flatMap((a) => training(r, a, today, role === "agent" ? 0.07 : 0.03));
    const p: Person = {
      id: `p${staffNo}`,
      staffNo: `NFS-${staffNo}`,
      firstName: f,
      lastName: l,
      role,
      homeTerminal: terminal,
      coreAirline: core,
      trainedAirlines: trained,
      training: t,
      phone: `+1 242 555 ${String(1000 + (staffNo % 9000)).slice(-4)}`,
      hireYear,
    };
    staffNo++;
    return p;
  };

  const sameTerminal = (code: string) => AIRLINES.filter((a) => a.terminal === AIRLINES.find((x) => x.code === code)!.terminal && a.code !== code).map((a) => a.code);

  for (const plan of TEAM_PLAN) {
    const airline = AIRLINES.find((a) => a.code === plan.airline)!;
    for (let i = 0; i < plan.leads; i++) {
      const extra = r.shuffle(AIRLINES.filter((a) => a.code !== plan.airline).map((a) => a.code)).slice(0, r.int(1, 2));
      people.push(mkPerson("lead", airline.terminal, plan.airline, [plan.airline, ...extra], r.int(2008, 2017)));
    }
    for (let i = 0; i < plan.agents; i++) {
      const pool = airline.terminal === "US" ? AIRLINES.filter((a) => a.code !== "UA").map((a) => a.code) : sameTerminal(plan.airline);
      const extra = r.chance(0.55) ? r.shuffle(pool).slice(0, r.int(1, 2)) : [];
      people.push(mkPerson("agent", airline.terminal, plan.airline, [plan.airline, ...extra], r.int(2011, 2025)));
    }
  }
  for (let i = 0; i < FLOAT_POOL; i++) {
    const trained = r.shuffle(AIRLINES.map((a) => a.code)).slice(0, r.int(3, 4));
    const term: Terminal = trained.includes("UA") ? "US" : "INTL";
    people.push(mkPerson("agent", term, null, trained, r.int(2012, 2022)));
  }
  for (const term of SUPERVISORS) {
    const trained = AIRLINES.filter((a) => a.terminal === term || r.chance(0.5)).map((a) => a.code);
    people.push(mkPerson("supervisor", term, null, trained, r.int(2004, 2012)));
  }
  people.push(mkPerson("manager", "INTL", null, AIRLINES.map((a) => a.code), 2003));
  people.push(mkPerson("manager", "US", null, AIRLINES.map((a) => a.code), 2006));
  people.push(mkPerson("admin", "INTL", null, [], 2015));

  // ---------- Flights ----------
  const windowStart = addDays(weekStart(today), -14);
  const windowDays = rangeDays(windowStart, 28);
  const flights: Flight[] = [];
  for (const date of windowDays) {
    const dow = dayOfWeek(date);
    const fr = rng(`flights-${date}`);
    for (const route of ROUTES) {
      if (route.days && !route.days.includes(dow)) continue;
      const airline = AIRLINES.find((a) => a.code === route.airline)!;
      flights.push({
        id: `${date}-${route.flightNo.replace(/\s/g, "")}`,
        date,
        airline: route.airline,
        flightNo: route.flightNo,
        destination: route.dest,
        destinationName: route.destName,
        aircraft: route.aircraft,
        std: route.std,
        sta: fromMinutes(toMinutes(route.std) - route.turnMins),
        gate: route.gate,
        terminal: airline.terminal,
        paxBooked: Math.round(route.seats * (0.62 + fr.next() * 0.36)),
      });
    }
  }
  flights.sort((a, b) => (a.date + a.std).localeCompare(b.date + b.std));

  // ---------- Rosters ----------
  const patterns = validWeekPatterns();
  const roster: RosterEntry[] = [];
  const weeks = [0, 7, 14, 21].map((n) => addDays(windowStart, n));
  const lastWeek = new Map<string, ShiftCode[]>();
  const vr = rng("vacations-v1");
  const vacationWeek = new Map<string, string>();
  for (const p of people) {
    if (p.role === "agent" && vr.chance(0.06)) vacationWeek.set(p.id, vr.pick(weeks));
  }

  const rosterTeam = (members: Person[], ws: string, req: (date: string, s: "E" | "L") => number) => {
    const days = rangeDays(ws, 7);
    const cur = days.map(() => ({ E: 0, L: 0 }));
    const wr = rng(`roster-${ws}-${members.map((m) => m.id).join(",")}`);
    const working = wr.shuffle(members).filter((m) => {
      if (vacationWeek.get(m.id) !== ws) return true;
      days.forEach((d) => roster.push({ personId: m.id, date: d, shift: "V" }));
      lastWeek.set(m.id, ["O", "O", "O", "O", "O", "O", "O"]);
      return false;
    });
    const chosen = new Map<string, ShiftCode[]>();
    const apply = (p: ShiftCode[], sign: 1 | -1) =>
      p.forEach((s, i) => {
        if (s === "E" || s === "L") cur[i][s] += sign;
      });
    const pickBest = (m: Person) => {
      const prev = lastWeek.get(m.id);
      let best: ShiftCode[] = patterns[0];
      let bestScore = -Infinity;
      for (const p of patterns) {
        if (!boundaryOk(prev, p)) continue;
        let score = wr.next() * 0.3;
        if (prev && prev.join("") === p.join("")) score -= 3; // nobody fixed
        p.forEach((s, i) => {
          if (s === "O") return;
          const need = req(days[i], s as "E" | "L");
          const have = cur[i][s as "E" | "L"];
          score += have < need ? 10 : 1 / (2 + have - need);
        });
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
      return best;
    };
    // greedy pass, then improvement passes (each person re-optimised against the rest of the team)
    for (const m of working) {
      const p = pickBest(m);
      chosen.set(m.id, p);
      apply(p, 1);
    }
    for (let pass = 0; pass < 8; pass++) {
      for (const m of working) {
        apply(chosen.get(m.id)!, -1);
        const p = pickBest(m);
        chosen.set(m.id, p);
        apply(p, 1);
      }
    }
    for (const m of working) {
      const p = chosen.get(m.id)!;
      p.forEach((s, i) => roster.push({ personId: m.id, date: days[i], shift: s }));
      lastWeek.set(m.id, p);
    }
  };

  const flightsByDate = new Map<string, Flight[]>();
  for (const f of flights) flightsByDate.set(f.date, [...(flightsByDate.get(f.date) ?? []), f]);

  for (const ws of weeks) {
    for (const plan of TEAM_PLAN) {
      const airline = AIRLINES.find((a) => a.code === plan.airline)!;
      const agents = people.filter((p) => p.role === "agent" && p.coreAirline === plan.airline);
      const leads = people.filter((p) => p.role === "lead" && p.coreAirline === plan.airline);
      rosterTeam(agents, ws, (d, s) => shiftDemand(flightsByDate.get(d) ?? [], airline, s).agents);
      rosterTeam(leads, ws, (d, s) => Math.min(1, shiftDemand(flightsByDate.get(d) ?? [], airline, s).leads));
    }
    rosterTeam(people.filter((p) => p.role === "agent" && !p.coreAirline), ws, () => 1);
    for (const term of ["US", "INTL"] as Terminal[]) {
      rosterTeam(people.filter((p) => p.role === "supervisor" && p.homeTerminal === term), ws, () => 1);
    }
  }

  // ---------- Gate logs (history + today up to now) ----------
  const shiftOf = new Map<string, ShiftCode>();
  for (const e of roster) shiftOf.set(`${e.personId}|${e.date}`, e.shift);

  const leadQuality = new Map<string, number>();
  const qr = rng("lead-quality");
  for (const p of people) if (p.role === "lead") leadQuality.set(p.id, qr.next());

  const CAUSES: [DelayCause, number][] = [
    ["Late inbound aircraft", 34], ["Airline operations", 12], ["Weather", 8], ["ATC / airport", 8],
    ["Ground equipment", 8], ["Catering", 6], ["Passenger processing", 9],
    ["Cleaning / groomers", 4], ["Security / TSA", 3],
  ];
  const weighted = <T,>(rr: ReturnType<typeof rng>, items: [T, number][]): T => {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let x = rr.next() * total;
    for (const [v, w] of items) if ((x -= w) <= 0) return v;
    return items[0][0];
  };
  const DISC: [DiscrepancyType, number][] = [
    ["Pax count mismatch", 18], ["Wheelchair request not pre-advised", 16], ["Bag offload", 12], ["No-show", 18],
    ["Documentation issue", 12], ["Seat duplication", 8], ["Denied boarding", 6], ["Unruly passenger", 4], ["Medical", 6],
  ];
  const DISC_NOTES: Record<DiscrepancyType, string[]> = {
    "Pax count mismatch": ["Manifest showed one more than headcount; reconciled with DCS.", "Headcount short by 2, found in lavatory queue."],
    "Wheelchair request not pre-advised": ["WCHR passenger arrived at gate without SSR; chair sourced in 9 min.", "Two WCHC requests not on PNL."],
    "Bag offload": ["Pax failed to board, one bag offloaded.", "Offload of 2 bags for no-show couple."],
    "No-show": ["Single no-show, bag not checked.", "Family of three no-show after check-in."],
    "Documentation issue": ["ESTA not approved, passenger re-accommodated.", "Expired passport detected at gate."],
    "Seat duplication": ["Duplicate seat 14C; reseated in 16A.", "Two boarding passes for 22F."],
    "Denied boarding": ["Oversold by 1, volunteer compensated per airline policy.", "Intoxicated passenger denied by captain."],
    "Unruly passenger": ["Verbal altercation at podium, resolved with security assist.", "Passenger refused gate-check of bag."],
    "Medical": ["Passenger felt unwell, paramedics cleared to fly.", "Oxygen request handled, airline approved."],
  };

  const gateLogs: GateLog[] = [];
  for (const f of flights) {
    if (f.date > today) continue;
    const airline = AIRLINES.find((a) => a.code === f.airline)!;
    const std = toMinutes(f.std);
    const isToday = f.date === today;
    if (isToday && nowMinutes < std - 75) continue; // not started yet
    const fr = rng(`log-${f.id}`);
    const shift = shiftForStd(f.std);
    const onShift = (p: Person) => shiftOf.get(`${p.id}|${f.date}`) === shift;
    const leads = people.filter((p) => p.role === "lead" && p.coreAirline === f.airline && onShift(p));
    const fallbackLeads = people.filter((p) => p.role === "lead" && p.trainedAirlines.includes(f.airline) && onShift(p));
    const lead = leads[0] ?? fallbackLeads[0] ?? people.find((p) => p.role === "lead" && p.coreAirline === f.airline)!;
    const agents = fr.shuffle(people.filter((p) => p.role === "agent" && p.coreAirline === f.airline && onShift(p)));
    const team: TeamMember[] = [{ personId: lead.id, position: "lead" }];
    let i = 0;
    const take = (pos: TeamMember["position"], n: number) => {
      for (let k = 0; k < n && i < agents.length; k++) team.push({ personId: agents[i++].id, position: pos });
    };
    take("gate", airline.sla.gate);
    take("jetBridge", airline.sla.jetBridge);
    i = 0;
    take("counter", Math.min(airline.sla.counter, agents.length));
    const gateShort = airline.sla.gate + airline.sla.jetBridge - team.filter((t) => t.position === "gate" || t.position === "jetBridge").length;

    // delay model — lead quality and staffing nudge outcomes, but the cause is recorded fairly
    const q = leadQuality.get(lead.id) ?? 0.5;
    let delay = 0;
    let cause: DelayCause | null = null;
    const roll = fr.next();
    const pDelay = 0.2 + (gateShort > 0 ? 0.25 : 0) + (0.5 - q) * 0.12;
    if (roll < pDelay) {
      cause = gateShort > 0 && fr.chance(0.6) ? "Staffing shortfall" : weighted(fr, CAUSES);
      delay = fr.chance(0.55) ? fr.int(3, 14) : fr.int(15, 70);
    } else {
      delay = fr.int(-4, 0);
    }
    const narrow = airline.usesJetBridge;
    const inboundLate = cause === "Late inbound aircraft" ? delay + fr.int(0, 6) : fr.int(-8, 4);
    const sta = toMinutes(f.sta);
    const doorOpen = sta + 3 + Math.max(0, inboundLate);
    const groomOn = doorOpen + fr.int(3, 6);
    const groomOff = groomOn + (narrow ? fr.int(12, 20) : fr.int(4, 7)) + (cause === "Cleaning / groomers" ? delay * 0.6 : 0);
    const bStart = Math.max(groomOff + 2, std - (narrow ? 40 : 25) + Math.max(0, delay - 5));
    const bClose = std - 10 + Math.max(0, delay);
    const dClose = std - 5 + Math.max(0, delay);
    const push = std + delay + fr.int(0, 2);

    const times: Record<GateEventType, number> = {
      door_open: doorOpen, groomers_on: groomOn, groomers_off: groomOff, boarding_start: bStart,
      boarding_close: bClose, door_close: dClose, pushback: push,
    };
    const events: Partial<Record<GateEventType, string>> = {};
    let complete = true;
    for (const k of Object.keys(times) as GateEventType[]) {
      if (isToday && times[k] > nowMinutes) {
        complete = false;
        continue;
      }
      events[k] = fromMinutes(times[k]);
    }

    const discrepancies: Discrepancy[] = [];
    const nDisc = fr.chance(0.3) ? (fr.chance(0.25) ? 2 : 1) : 0;
    for (let d = 0; d < nDisc; d++) {
      const type = weighted(fr, DISC);
      discrepancies.push({ id: `${f.id}-d${d}`, type, note: fr.pick(DISC_NOTES[type]), at: fromMinutes(bStart + fr.int(0, 25)), hasPhoto: fr.chance(0.3) });
    }
    const noShows = discrepancies.filter((d) => d.type === "No-show").length * fr.int(1, 3);

    gateLogs.push({
      id: `log-${f.id}`,
      flightId: f.id,
      date: f.date,
      airline: f.airline,
      leadId: lead.id,
      team,
      events,
      paxBoarded: complete ? Math.max(0, f.paxBooked - noShows - fr.int(0, 2)) : null,
      discrepancies: complete ? discrepancies : [],
      delayMinutes: complete ? Math.max(0, delay) : 0,
      delayCause: complete && delay > 0 ? cause : null,
      notes: "",
      status: complete ? "filed" : "open",
      filedAt: complete ? fromMinutes(push + fr.int(3, 12)) : null,
      source: "seed",
    });
  }

  // ---------- Airline feedback ----------
  const feedback: FeedbackItem[] = [];
  const fbr = rng("feedback-v1");
  const filed = gateLogs.filter((g) => g.status === "filed");
  const PRAISE = [
    "Station manager thanked the gate team for a smooth on-time departure despite late inbound.",
    "Positive passenger comment about the wheelchair assistance at the gate.",
    "Airline noted excellent turnaround coordination and early boarding completion.",
    "Compliment from crew on podium communication during the weather hold.",
  ];
  const COMPLAINT = [
    "Station manager flagged a non-core agent on the podium without notice.",
    "Boarding started late; airline requested an explanation.",
    "Passenger complaint about queue management at the counter.",
    "Airline reported the final headcount sent to the crew late.",
    "Jet bridge positioned late on arrival; crew waited at the door.",
  ];
  for (let k = 0; k < 26; k++) {
    const g = fbr.pick(filed);
    const praise = fbr.chance(g.delayMinutes > 14 ? 0.15 : 0.55);
    const air = AIRLINES.find((a) => a.code === g.airline)!;
    feedback.push({
      id: `fb${k}`,
      date: g.date,
      airline: g.airline,
      flightId: g.flightId,
      kind: praise ? "praise" : "complaint",
      from: air.stationManager.name,
      summary: praise ? fbr.pick(PRAISE) : fbr.pick(COMPLAINT),
      personIds: [g.leadId],
      status: g.date < addDays(today, -7) ? "closed" : fbr.pick(["open", "reviewed"] as const),
    });
  }
  feedback.sort((a, b) => b.date.localeCompare(a.date));

  return { today, nowMinutes, windowStart, windowDays, airlines: AIRLINES, people, flights, roster, gateLogs, feedback };
}
