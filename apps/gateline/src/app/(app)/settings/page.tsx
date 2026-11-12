"use client";
import * as React from "react";
import { Lock, RotateCcw } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, PageHeader, Select, cn } from "@nfs/ui";
import { RULE_META, SEVERITY_LABEL, resolveRules, type RuleId, type RuleSetting, type Severity } from "@nfs/rules";
import { useHub } from "@/lib/store";
import { RequirePerm } from "@/components/guard";

export default function SettingsPage() {
  return (
    <RequirePerm perm="rules.edit">
      <RuleSettings />
    </RequirePerm>
  );
}

const CATS = ["Fatigue", "Days off", "Coverage", "Training", "Fairness", "Process"] as const;

function RuleSettings() {
  const hub = useHub();
  const defaults = resolveRules();
  const [draft, setDraft] = React.useState<Record<RuleId, RuleSetting>>(hub.rules);
  React.useEffect(() => setDraft(hub.rules), [hub.rules]);
  const changed = JSON.stringify(draft) !== JSON.stringify(hub.rules);
  const set = (id: RuleId, patch: Partial<RuleSetting>) => setDraft({ ...draft, [id]: { ...draft[id], ...patch } });

  const save = () => {
    const overrides: Partial<Record<RuleId, Partial<RuleSetting>>> = {};
    for (const m of RULE_META) {
      const d = draft[m.id];
      const base = defaults[m.id];
      if (JSON.stringify(d) !== JSON.stringify(base)) overrides[m.id] = d;
    }
    hub.saveRules(overrides);
  };

  return (
    <>
      <PageHeader
        eyebrow="Roster engine"
        title="Rule settings"
        description="Thresholds, severity and on/off for every rule the engine checks. Union law items stay on. Saving rebuilds the rosters with the new rules."
        actions={
          <>
            <Button variant="ghost" onClick={() => setDraft(defaults)}><RotateCcw /> Defaults</Button>
            <Button disabled={!changed} onClick={save}>Save rules</Button>
          </>
        }
      />
      <div className="space-y-5">
        {CATS.map((cat) => (
          <Card key={cat}>
            <CardHeader><div><CardTitle>{cat}</CardTitle></div></CardHeader>
            <CardContent className="divide-y divide-line">
              {RULE_META.filter((m) => m.category === cat).map((m) => {
                const s = draft[m.id];
                return (
                  <div key={m.id} className={cn("grid gap-3 py-3 @2xl/main:grid-cols-[1fr_auto_auto] md:items-center", !s.enabled && "opacity-60")}>
                    <div>
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        {m.name}
                        {m.locked ? <Badge tone="neutral"><Lock className="size-3" /> Union law</Badge> : null}
                      </p>
                      <p className="text-xs text-muted">{m.description}</p>
                      {m.paramMeta?.length ? (
                        <div className="mt-2 flex flex-wrap gap-3">
                          {m.paramMeta.map((pm) => (
                            <label key={pm.key} className="flex items-center gap-2 text-xs text-muted">
                              {pm.label}
                              <Input
                                type="number"
                                min={pm.min}
                                max={pm.max}
                                value={s.params[pm.key]}
                                onChange={(e) => set(m.id, { params: { ...s.params, [pm.key]: Math.max(pm.min, Math.min(pm.max, Number(e.target.value) || 0)) } })}
                                className="h-8 w-20"
                              />
                              {pm.unit}
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <Select value={s.severity} onChange={(e) => set(m.id, { severity: e.target.value as Severity })} aria-label={`${m.name} severity`} className="h-9 text-xs">
                      {(["hard", "soft", "warning"] as Severity[]).map((v) => <option key={v} value={v}>{SEVERITY_LABEL[v]}</option>)}
                    </Select>
                    <label className="flex items-center gap-2 text-xs font-semibold">
                      <input type="checkbox" disabled={m.locked} checked={s.enabled} onChange={(e) => set(m.id, { enabled: e.target.checked })} className="size-4 accent-[var(--color-brand-500)]" />
                      On
                    </label>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
