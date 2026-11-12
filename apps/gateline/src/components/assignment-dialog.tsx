"use client";
import * as React from "react";
import { Button, Dialog, DialogContent, Select, cn } from "@nfs/ui";
import { ROLE_LABEL, can } from "@nfs/auth";
import type { Person, Role, Terminal } from "@nfs/db";
import { useHub, personName } from "@/lib/store";

/** Manager edit of the parts staff can't change themselves: team, role, terminal, qualifications, active. */
export function AssignmentDialog({ person, onClose }: { person: Person; onClose: () => void }) {
  const hub = useHub();
  const superAdmin = can(hub.session?.role, "system.admin");
  const [core, setCore] = React.useState(person.coreAirline ?? "");
  const [role, setRole] = React.useState<Role>(person.role);
  const [term, setTerm] = React.useState<Terminal>(person.homeTerminal);
  const [trained, setTrained] = React.useState<string[]>(person.trainedAirlines);
  const [active, setActive] = React.useState(person.active !== false);
  const roles: Role[] = superAdmin ? ["agent", "lead", "supervisor", "manager", "admin"] : ["agent", "lead", "supervisor"];
  const lockedRole = !roles.includes(person.role);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Assignment · ${personName(person)}`} description="Changes rebuild the rosters. Training records stay in TakeFlight — qualification here is a demo stand-in for that sync.">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-muted">Core team</span>
            <Select value={core} onChange={(e) => setCore(e.target.value)} className="mt-1 w-full">
              <option value="">Float pool (no core airline)</option>
              {hub.ds.airlines.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
            </Select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted">Role</span>
            <Select value={role} disabled={lockedRole} onChange={(e) => setRole(e.target.value as Role)} className="mt-1 w-full">
              {(lockedRole ? [person.role] : roles).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted">Home terminal</span>
            <Select value={term} onChange={(e) => setTerm(e.target.value as Terminal)} className="mt-1 w-full">
              <option value="US">US Departures</option>
              <option value="INTL">International</option>
            </Select>
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-[var(--color-brand-500)]" />
            Active (inactive staff leave the roster, history stays)
          </label>
        </div>
        <p className="mt-5 text-xs font-semibold text-muted">Qualified on</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {hub.ds.airlines.map((a) => {
            const on = trained.includes(a.code);
            return (
              <button
                key={a.code}
                type="button"
                onClick={() => setTrained(on ? trained.filter((c) => c !== a.code) : [...trained, a.code])}
                className={cn("h-9 rounded-lg border px-3 text-xs font-semibold transition-colors cursor-pointer", on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line text-muted hover:border-brand-400 hover:text-brand-700")}
              >
                {a.code}
              </button>
            );
          })}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              hub.savePerson(person.id, { coreAirline: core || null, role, homeTerminal: term, trainedAirlines: core && !trained.includes(core) ? [...trained, core] : trained, active });
              onClose();
            }}
          >
            Save assignment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
