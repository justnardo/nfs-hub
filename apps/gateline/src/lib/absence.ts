import type { EngineInput } from "@nfs/rules";
import type { RosterEntry } from "@nfs/db";

/** Why someone isn't working a rostered day. The roster engine treats every type as unavailable. */
export const ABSENCE_TYPES = {
  sick: { label: "Called out sick", short: "SICK", tone: "bg-red-100 text-red-800", days: 1 },
  noshow: { label: "No call, no show", short: "NCNS", tone: "bg-red-600 text-white", days: 1 },
  personal: { label: "Personal / emergency", short: "PERS", tone: "bg-amber-100 text-amber-900", days: 1 },
  bereavement: { label: "Bereavement leave", short: "BRV", tone: "bg-slate-200 text-slate-800", days: 3 },
  annual: { label: "Annual leave", short: "AL", tone: "bg-gold-100 text-gold-700", days: 7 },
  maternity: { label: "Maternity leave", short: "MAT", tone: "bg-fuchsia-100 text-fuchsia-800", days: 91 },
  paternity: { label: "Paternity leave", short: "PAT", tone: "bg-violet-100 text-violet-800", days: 7 },
  injury: { label: "Injured on duty", short: "IOD", tone: "bg-orange-100 text-orange-800", days: 7 },
  training: { label: "Training / course", short: "TRN", tone: "bg-sky-100 text-sky-800", days: 1 },
  unpaid: { label: "Unpaid leave", short: "UNP", tone: "bg-stone-200 text-stone-700", days: 7 },
} as const;
export type AbsenceType = keyof typeof ABSENCE_TYPES;

export interface Absence {
  id: string;
  personId: string;
  type: AbsenceType;
  from: string;
  to: string;
  note?: string;
  by: string;
  at: string;
}

export const absenceCovers = (a: Absence, date: string) => date >= a.from && date <= a.to;

/** Absent days become unavailable (the engine's leave code), so coverage, rules and fixes see them. */
export function applyAbsences<T extends Pick<EngineInput, "roster">>(input: T, absences: Absence[]): T {
  if (!absences.length) return input;
  const byPerson = new Map<string, Absence[]>();
  for (const a of absences) byPerson.set(a.personId, [...(byPerson.get(a.personId) ?? []), a]);
  const roster: RosterEntry[] = input.roster.map((r) => (byPerson.get(r.personId)?.some((a) => absenceCovers(a, r.date)) ? { personId: r.personId, date: r.date, shift: "V" } : r));
  return { ...input, roster };
}

/** Demo history: a few call-outs, leave and one maternity leave, so reports and rosters show real-looking absences. */
export function demoAbsences(today: string, people: { id: string; role: string; coreAirline: string | null }[]): Absence[] {
  const add = (d: string, n: number) => {
    const t = new Date(`${d}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };
  const agents = people.filter((p) => p.role === "agent" && p.coreAirline && p.id !== "p4100");
  const pick = (i: number) => agents[(i * 7 + 3) % Math.max(1, agents.length)]?.id;
  const by = "NFS Duty Office";
  const at = `${add(today, -10)}T08:00:00.000Z`;
  const list: (Omit<Absence, "personId"> & { personId?: string })[] = [
    { id: "abs-demo-1", personId: pick(1), type: "sick", from: add(today, -9), to: add(today, -9), note: "Called the duty office at 03:50", by, at },
    { id: "abs-demo-2", personId: pick(2), type: "sick", from: add(today, -5), to: add(today, -4), note: "Doctor's note received", by, at },
    { id: "abs-demo-3", personId: pick(3), type: "noshow", from: add(today, -3), to: add(today, -3), by, at },
    { id: "abs-demo-4", personId: pick(4), type: "maternity", from: add(today, -20), to: add(today, 70), note: "Approved by HR", by, at },
    { id: "abs-demo-5", personId: pick(5), type: "bereavement", from: add(today, -8), to: add(today, -6), by, at },
    { id: "abs-demo-6", personId: pick(6), type: "annual", from: add(today, 5), to: add(today, 11), note: "Approved", by, at },
    { id: "abs-demo-7", personId: pick(8), type: "sick", from: add(today, -1), to: add(today, -1), by, at },
  ];
  return list.filter((a): a is Absence => !!a.personId);
}
