/**
 * Week optimiser for one team. Builds the week from valid patterns, honours locked cells
 * (leave, manager edits), meets SLA demand first, then shares weekends and lates fairly and
 * avoids repeating last week's pattern. Greedy start + improvement passes, best of several restarts.
 */
import { addDays, dayOfWeek, formatDate, rangeDays, type Person, type ShiftCode } from "@nfs/db";
import type { RuleSettings } from "./config";
import { offTogether } from "./check";
import { SHIFT_LABEL, endMin, isWork, startMin } from "./shifts";

type Code = ShiftCode;
type Prng = { next: () => number };

function prng(seed: string): Prng {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return {
    next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Valid Sun–Sat patterns over Early/Late/Off for the current rules. */
export function weekPatterns(rules: RuleSettings): Code[][] {
  const offCount = rules["days-off-count"].params.count;
  const circular = rules["days-off-consecutive"].params.satSunPairs >= 1;
  const maxLates = rules["consecutive-lates-max"].params.max;
  const out: Code[][] = [];
  const seen = new Set<string>();
  for (let start = 0; start < 7; start++) {
    const offIdx = new Set(Array.from({ length: offCount }, (_, k) => (start + k) % 7));
    if (!circular && [...offIdx].some((d) => d < start)) continue; // would wrap Sat→Sun
    const workIdx = [0, 1, 2, 3, 4, 5, 6].filter((d) => !offIdx.has(d));
    for (let mask = 0; mask < 1 << workIdx.length; mask++) {
      const p: Code[] = Array(7).fill("O");
      workIdx.forEach((d, b) => (p[d] = mask & (1 << b) ? "L" : "E"));
      if (sequenceViolations([], p, rules) > 0) continue;
      let run = 0;
      let ok = true;
      for (const s of p) {
        run = s === "L" ? run + 1 : 0;
        if (run > maxLates) ok = false;
      }
      const k = p.join("");
      if (ok && !seen.has(k)) {
        seen.add(k);
        out.push(p);
      }
    }
  }
  return out;
}

/**
 * Violations for `week` (7 codes) given the previous week's codes (seams).
 * Counts fatigue + days-off breaches; used to score candidates fast.
 */
export function sequenceViolations(prev: (Code | undefined)[], week: Code[], rules: RuleSettings): number {
  const seq = [...prev, ...week];
  const from = prev.length;
  let n = 0;
  let lateRun = 0;
  let dayRun = 0;
  for (let i = 0; i < seq.length; i++) {
    const s = seq[i];
    if (isWork(s)) {
      const p = seq[i - 1];
      if (i >= from && isWork(p)) {
        if ((startMin(s) + 1440 - endMin(p)) / 60 < rules["rest-min"].params.hours) n++;
        if (rules["forward-rotation"].enabled && startMin(s) < startMin(p)) n++;
      }
      dayRun++;
      lateRun = s === "L" ? lateRun + 1 : 0;
      if (i >= from && rules["consecutive-days-max"].enabled && dayRun > rules["consecutive-days-max"].params.max) n++;
      if (i >= from && rules["consecutive-lates-max"].enabled && lateRun > rules["consecutive-lates-max"].params.max) n++;
    } else {
      lateRun = 0;
      dayRun = 0;
    }
  }
  if (!week.includes("V")) {
    const offs = week.filter((s) => s === "O").length;
    if (rules["days-off-count"].enabled && offs < rules["days-off-count"].params.count) n += rules["days-off-count"].params.count - offs;
    if (rules["days-off-consecutive"].enabled && !offTogether(week.map((s) => s === "O"), rules["days-off-consecutive"].params.satSunPairs >= 1)) n++;
  }
  return n;
}

export interface WeekPlanInput {
  members: Person[];
  weekStart: string;
  /** People needed on that shift (peak). */
  demand: (date: string, shift: "E" | "L") => number;
  prevWeek: (personId: string) => (Code | undefined)[];
  /** Fixed cells: leave (V) or manager edits. */
  locked?: (personId: string, dayIndex: number) => Code | undefined;
  history?: (personId: string) => { weekendOffs: number; lates: number };
  /** Whether a member counts toward cover (e.g. current on the airline). Default: everyone. */
  counts?: (personId: string) => boolean;
  rules: RuleSettings;
  seed: string;
  restarts?: number;
}

export interface Deficit {
  date: string;
  shift: "E" | "L";
  short: number;
}

export interface WeekPlan {
  patterns: Map<string, Code[]>;
  deficits: Deficit[];
  violations: number;
  notes: string[];
  score: number;
}

export function optimiseWeek(input: WeekPlanInput, basePatterns = weekPatterns(input.rules)): WeekPlan {
  const days = rangeDays(input.weekStart, 7);
  const need = days.map((d) => ({ E: input.demand(d, "E"), L: input.demand(d, "L") }));
  const members = input.members;
  const hist = new Map(members.map((m) => [m.id, input.history?.(m.id) ?? { weekendOffs: 0, lates: 0 }]));
  const avgW = members.length ? [...hist.values()].reduce((s, h) => s + h.weekendOffs, 0) / members.length : 0;
  const avgL = members.length ? [...hist.values()].reduce((s, h) => s + h.lates, 0) / members.length : 0;
  const repeatOn = input.rules["same-pattern-repeat"].enabled;

  // Candidate sets per person (locks applied, deduped, invalid ones penalised)
  const cand = new Map<string, { p: Code[]; viol: number }[]>();
  for (const m of members) {
    const prev = input.prevWeek(m.id);
    const locks = Array.from({ length: 7 }, (_, i) => input.locked?.(m.id, i));
    const fullLeave = locks.every((l) => l === "V");
    const list = new Map<string, { p: Code[]; viol: number }>();
    if (fullLeave) {
      list.set("VVVVVVV", { p: Array(7).fill("V"), viol: 0 });
    } else {
      for (const bp of basePatterns) {
        const p = bp.map((s, i) => locks[i] ?? s) as Code[];
        const k = p.join("");
        if (!list.has(k)) list.set(k, { p, viol: sequenceViolations(prev, p, input.rules) });
      }
    }
    const arr = [...list.values()];
    const best = Math.min(...arr.map((c) => c.viol));
    cand.set(m.id, arr.filter((c) => c.viol <= best)); // keep only the least-violating options
  }

  const run = (seed: string) => {
    const r = prng(seed);
    const cur = days.map(() => ({ E: 0, L: 0 }));
    const chosen = new Map<string, { p: Code[]; viol: number }>();
    const apply = (p: Code[], sign: 1 | -1, id?: string) => {
      if (id && input.counts && !input.counts(id)) return;
      p.forEach((s, i) => {
        if (s === "E" || s === "L") cur[i][s] += sign;
        else if (s === "M") {
          cur[i].E += sign;
          cur[i].L += sign;
        }
      });
    };
    const personScore = (m: Person, c: { p: Code[]; viol: number }) => {
      let sc = -1000 * c.viol + r.next() * 0.2;
      const counted = !input.counts || input.counts(m.id);
      c.p.forEach((s, i) => {
        if (!counted || (s !== "E" && s !== "L")) return;
        const have = cur[i][s];
        const n = need[i][s];
        sc += have < n ? 100 : 3 / (1 + have - n);
      });
      const h = hist.get(m.id)!;
      const weekendOff = c.p[0] === "O" || c.p[6] === "O";
      if (weekendOff) sc += 4 * (avgW - h.weekendOffs) + 1;
      const lates = c.p.filter((s) => s === "L").length;
      sc -= 1.5 * (h.lates + lates - (avgL + 2));
      if (repeatOn) {
        const prev = input.prevWeek(m.id);
        if (prev.length === 7 && prev.join("") === c.p.join("")) sc -= 6;
      }
      return sc;
    };
    const pick = (m: Person) => {
      let best = cand.get(m.id)![0];
      let bs = -Infinity;
      for (const c of cand.get(m.id)!) {
        const s = personScore(m, c);
        if (s > bs) {
          bs = s;
          best = c;
        }
      }
      return best;
    };
    const order = [...members].sort(() => r.next() - 0.5);
    for (const m of order) {
      const c = pick(m);
      chosen.set(m.id, c);
      apply(c.p, 1, m.id);
    }
    for (let pass = 0; pass < 8; pass++) {
      let changed = false;
      for (const m of order) {
        const old = chosen.get(m.id)!;
        apply(old.p, -1, m.id);
        const c = pick(m);
        if (c !== old) changed = true;
        chosen.set(m.id, c);
        apply(c.p, 1, m.id);
      }
      if (!changed) break;
    }
    const deficits: Deficit[] = [];
    let short = 0;
    days.forEach((d, i) =>
      (["E", "L"] as const).forEach((s) => {
        const gap = need[i][s] - cur[i][s];
        if (gap > 0) {
          deficits.push({ date: d, shift: s, short: gap });
          short += gap;
        }
      }),
    );
    const viol = [...chosen.values()].reduce((s, c) => s + c.viol, 0);
    let fairness = 0;
    for (const m of members) {
      const p = chosen.get(m.id)!.p;
      if (p[0] === "O" || p[6] === "O") fairness += avgW - hist.get(m.id)!.weekendOffs;
    }
    const score = -short * 100 - viol * 1000 + fairness;
    return { chosen, deficits, viol, score };
  };

  let best = run(`${input.seed}#0`);
  for (let k = 1; k < (input.restarts ?? 3); k++) {
    const next = run(`${input.seed}#${k}`);
    if (next.score > best.score) best = next;
  }

  // Explain what could not be covered
  const notes: string[] = [];
  for (const d of best.deficits) {
    const i = days.indexOf(d.date);
    const free = members.filter((m) => {
      const l = input.locked?.(m.id, i);
      return l !== "V" && l !== "O";
    }).length;
    const total = need[i].E + need[i].L;
    notes.push(
      free < total
        ? `${formatDate(d.date)} ${SHIFT_LABEL[d.shift].toLowerCase()}: short ${d.short}. Only ${free} of ${members.length} people are available for ${total} positions that day — needs cover from another team or overtime.`
        : `${formatDate(d.date)} ${SHIFT_LABEL[d.shift].toLowerCase()}: short ${d.short}. Enough people overall, but rest and days-off rules stop a rearrangement — see suggested fixes.`,
    );
  }
  return { patterns: new Map([...best.chosen].map(([k, v]) => [k, v.p])), deficits: best.deficits, violations: best.viol, notes, score: best.score };
}

/** Weekend days off and late shifts worked over the given dates (for fairness). */
export function fairnessHistory(personId: string, dates: string[], shiftOf: (personId: string, date: string) => ShiftCode | undefined) {
  let weekendOffs = 0;
  let lates = 0;
  for (const d of dates) {
    const s = shiftOf(personId, d);
    if (s === "O" && [0, 6].includes(dayOfWeek(d))) weekendOffs++;
    if (s === "L") lates++;
  }
  return { weekendOffs, lates };
}

export { addDays };
