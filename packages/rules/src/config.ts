/**
 * Rule registry. Predicates are code (check.ts); thresholds, severity and on/off are data a
 * manager edits — the same split Rampline uses.
 */
export type Severity = "hard" | "soft" | "warning";

export type RuleId =
  | "rest-min"
  | "consecutive-lates-max"
  | "consecutive-days-max"
  | "weekly-hours-max"
  | "days-off-count"
  | "days-off-consecutive"
  | "forward-rotation"
  | "training-current"
  | "sla-coverage"
  | "lead-on-duty"
  | "same-pattern-repeat"
  | "weekend-off-fairness"
  | "cover-override"
  | "change-notice";

export interface RuleParam {
  key: string;
  label: string;
  unit?: string;
  min: number;
  max: number;
}

export interface RuleMeta {
  id: RuleId;
  name: string;
  category: "Fatigue" | "Days off" | "Coverage" | "Training" | "Fairness" | "Process";
  description: string;
  defaultSeverity: Severity;
  /** Union law items cannot be switched off. */
  locked?: boolean;
  params: Record<string, number>;
  paramMeta?: RuleParam[];
}

export const RULE_META: RuleMeta[] = [
  { id: "rest-min", name: "Rest between shifts", category: "Fatigue", description: "Minimum rest between the end of one shift and the start of the next, across week boundaries.", defaultSeverity: "hard", locked: true, params: { hours: 11 }, paramMeta: [{ key: "hours", label: "Minimum rest", unit: "h", min: 8, max: 16 }] },
  { id: "consecutive-lates-max", name: "Consecutive late shifts", category: "Fatigue", description: "Late shifts in a row before a day off.", defaultSeverity: "hard", params: { max: 3 }, paramMeta: [{ key: "max", label: "Maximum in a row", min: 1, max: 6 }] },
  { id: "consecutive-days-max", name: "Consecutive working days", category: "Fatigue", description: "Working days in a row, counted across weeks.", defaultSeverity: "hard", params: { max: 5 }, paramMeta: [{ key: "max", label: "Maximum in a row", min: 3, max: 7 }] },
  { id: "weekly-hours-max", name: "Weekly hours", category: "Fatigue", description: "Rostered hours in a Sun–Sat week. Overtime beyond this is flagged for approval.", defaultSeverity: "soft", params: { hours: 40 }, paramMeta: [{ key: "hours", label: "Standard week", unit: "h", min: 32, max: 56 }] },
  { id: "forward-rotation", name: "Forward rotation", category: "Fatigue", description: "Shifts move early → mid → late; a later-to-earlier change needs a day off in between.", defaultSeverity: "hard", params: {} },
  { id: "days-off-count", name: "Days off per week", category: "Days off", description: "Days off in each Sun–Sat week (vacation days aside).", defaultSeverity: "hard", params: { count: 2 }, paramMeta: [{ key: "count", label: "Days off", min: 1, max: 3 }] },
  { id: "days-off-consecutive", name: "Days off together", category: "Days off", description: "Days off form one run inside the Sun–Sat week (Saturday + Sunday counts as a pair).", defaultSeverity: "hard", params: { satSunPairs: 1 }, paramMeta: [{ key: "satSunPairs", label: "Sat + Sun counts as a pair (1 = yes)", min: 0, max: 1 }] },
  { id: "training-current", name: "Current on the airline", category: "Training", description: "Agents only count toward an airline they are trained and current on (TakeFlight records).", defaultSeverity: "hard", locked: true, params: {} },
  { id: "sla-coverage", name: "SLA coverage", category: "Coverage", description: "Trained agents on duty meet each airline's SLA demand every 15 minutes.", defaultSeverity: "hard", params: {} },
  { id: "lead-on-duty", name: "Lead on duty", category: "Coverage", description: "A lead is on duty whenever the airline has a flight working. A terminal supervisor on duty can count as the lead.", defaultSeverity: "hard", params: { supervisorsCount: 1 }, paramMeta: [{ key: "supervisorsCount", label: "Terminal supervisor counts as lead (1 = yes)", min: 0, max: 1 }] },
  { id: "same-pattern-repeat", name: "Nobody fixed", category: "Fairness", description: "Avoid giving someone the same weekly pattern two weeks running.", defaultSeverity: "soft", params: {} },
  { id: "weekend-off-fairness", name: "Weekend days off shared", category: "Fairness", description: "Everyone gets at least this many weekend days off across four weeks.", defaultSeverity: "soft", params: { min: 1 }, paramMeta: [{ key: "min", label: "Weekend days off per 4 weeks", min: 0, max: 8 }] },
  { id: "cover-override", name: "Core team pulled", category: "Process", description: "A core agent moved to another airline below their own airline's SLA (manager override).", defaultSeverity: "warning", params: {} },
  { id: "change-notice", name: "Change notice", category: "Process", description: "Roster changes made less than this long before the shift.", defaultSeverity: "warning", params: { hours: 48 }, paramMeta: [{ key: "hours", label: "Notice", unit: "h", min: 0, max: 168 }] },
];

export interface RuleSetting {
  enabled: boolean;
  severity: Severity;
  params: Record<string, number>;
}
export type RuleSettings = Record<RuleId, RuleSetting>;

export function resolveRules(overrides?: Partial<Record<RuleId, Partial<RuleSetting>>>): RuleSettings {
  const out = {} as RuleSettings;
  for (const m of RULE_META) {
    const o = overrides?.[m.id];
    out[m.id] = {
      enabled: m.locked ? true : o?.enabled ?? true,
      severity: o?.severity ?? m.defaultSeverity,
      params: { ...m.params, ...(o?.params ?? {}) },
    };
  }
  return out;
}

export const SEVERITY_LABEL: Record<Severity, string> = { hard: "Blocks publish", soft: "Should fix", warning: "Note" };
