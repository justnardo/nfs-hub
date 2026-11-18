"use client";
import * as React from "react";
import Link from "next/link";
import { Pagination, usePaged } from "@/components/pagination";
import { Search } from "lucide-react";
import { Avatar, Badge, Card, Input, PageHeader, Select, Table, Td, Th, Tr } from "@nfs/ui";
import { ROLE_LABEL } from "@nfs/auth";
import { formatDate, type Role } from "@nfs/db";
import { eligibleFor, expiringSoon } from "@nfs/rules";
import { useHub, personName } from "@/lib/store";
import { RequirePerm } from "@/components/guard";
import { AirlineChip, ShiftChip } from "@/components/ops";
import { DatePicker } from "@/components/date-picker";
import { AbsenceChip } from "@/components/absence";
import { buildPortfolio } from "@/lib/portfolio";
import { pct } from "@/lib/metrics";

export default function AgentsPage() {
  return (
    <RequirePerm perm="staff.view">
      <Agents />
    </RequirePerm>
  );
}

function Agents() {
  const hub = useHub();
  const [q, setQ] = React.useState("");
  const [role, setRole] = React.useState<"" | Role>("");
  const [airline, setAirline] = React.useState("");
  const [term, setTerm] = React.useState("");
  const [day, setDay] = React.useState(hub.today);
  const [onDay, setOnDay] = React.useState<"" | "working" | "off" | "absent" | "former">("");
  const shiftOn = React.useMemo(() => new Map(hub.ds.roster.filter((r) => r.date === day).map((r) => [r.personId, r.shift])), [hub.ds.roster, day]);
  const workedOn = React.useMemo(() => {
    const m = new Map<string, { flightNo: string; pos: string; logId: string; filed: boolean }[]>();
    const fl = new Map(hub.ds.flights.map((f) => [f.id, f]));
    for (const g of hub.gateLogs) {
      if (g.date !== day) continue;
      for (const t of g.team) {
        const list = m.get(t.personId) ?? [];
        if (!list.some((x) => x.logId === g.id)) m.set(t.personId, [...list, { flightNo: fl.get(g.flightId)?.flightNo ?? "", pos: t.position, logId: g.id, filed: g.status === "filed" }]);
      }
    }
    return m;
  }, [hub.gateLogs, hub.ds.flights, day]);
  const status = (pid: string) => {
    const s = shiftOn.get(pid);
    if (hub.absenceOn(pid, day)) return "absent";
    return s === "E" || s === "M" || s === "L" ? "working" : "off";
  };
  const map = new Map(hub.ds.airlines.map((a) => [a.code, a]));
  const flightById = React.useMemo(() => new Map(hub.ds.flights.map((f) => [f.id, f])), [hub.ds]);

  const rows = hub.ds.people
    .filter((p) => ["agent", "lead", "supervisor"].includes(p.role))
    .filter((p) => !role || p.role === role)
    .filter((p) => !airline || (airline === "POOL" ? !p.coreAirline : p.trainedAirlines.includes(airline)))
    .filter((p) => !term || p.homeTerminal === term)
    .filter((p) => !q || `${personName(p)} ${p.staffNo}`.toLowerCase().includes(q.toLowerCase()))
    .filter((p) => (onDay === "former" ? p.active === false : p.active !== false))
    .filter((p) => !onDay || onDay === "former" || status(p.id) === onDay)
    .sort((a, b) => a.lastName.localeCompare(b.lastName));
  const paged = usePaged(rows, 15, [q, role, airline, term, day, onDay]);
  const top = React.useRef<HTMLDivElement>(null);

  return (
    <>
      <PageHeader eyebrow="Agent profiles & portfolios" title="Passenger services staff" description={`${rows.length} staff shown. Pick a day to see who worked, who was off or away, and the flights they worked. Each profile carries role, home terminal, airlines trained on, and a portfolio of flights worked, teammates and outcomes.`} />
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or staff no." className="pl-9" />
        </div>
        <Select value={role} onChange={(e) => setRole(e.target.value as Role | "")} aria-label="Role">
          <option value="">All roles</option>
          <option value="agent">Agents</option>
          <option value="lead">Leads</option>
          <option value="supervisor">Supervisors</option>
        </Select>
        <Select value={airline} onChange={(e) => setAirline(e.target.value)} aria-label="Airline">
          <option value="">Any airline</option>
          {hub.ds.airlines.map((a) => <option key={a.code} value={a.code}>Trained on {a.code}</option>)}
          <option value="POOL">Float pool</option>
        </Select>
        <Select value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Terminal">
          <option value="">Both terminals</option>
          <option value="US">US Departures</option>
          <option value="INTL">International</option>
        </Select>
        <span className="mx-1 hidden h-6 w-px bg-line md:block" />
        <DatePicker value={day} onChange={setDay} min={hub.ds.windowStart} max={hub.ds.horizonEnd} today={hub.today} />
        <Select value={onDay} onChange={(e) => setOnDay(e.target.value as typeof onDay)} aria-label="On that day">
          <option value="">Everyone</option>
          <option value="working">Working that day</option>
          <option value="off">Off that day</option>
          <option value="absent">Sick or on leave</option>
          <option value="former">Former staff</option>
        </Select>
      </Card>
      <div ref={top} className="scroll-mt-20" />
      <Card className="px-2 pb-3 sm:px-4">
        <Table>
          <thead>
            <tr><Th>Name</Th><Th className="hidden @4xl/main:table-cell">Role</Th><Th>Core</Th><Th className="hidden @5xl/main:table-cell">Trained on</Th><Th className="hidden @4xl/main:table-cell">Terminal</Th><Th>{day === hub.today ? "Today" : formatDate(day, { weekday: "short", day: "numeric", month: "short" })}</Th><Th className="hidden @5xl/main:table-cell">Flights that day</Th><Th className="hidden @4xl/main:table-cell">Flights · 28d</Th><Th className="hidden @4xl/main:table-cell">On-time</Th><Th>Training</Th></tr>
          </thead>
          <tbody>
            {paged.rows.map((p) => {
              const pf = buildPortfolio(p.id, hub.gateLogs, flightById);
              const expired = p.trainedAirlines.some((c) => !eligibleFor(p, map.get(c)!, hub.today).ok);
              const soon = expiringSoon(p, hub.today).length > 0;
              return (
                <Tr key={p.id}>
                  <Td>
                    <Link href={`/agents/${p.id}`} className="flex items-center gap-2.5 transition-colors hover:text-brand-600">
                      <Avatar name={personName(p)} src={p.photoUrl} tone={p.role === "agent" ? "brand" : "dark"} className="size-7" />
                      <span><span className="block font-semibold">{personName(p)}</span><span className="text-[11px] text-muted">{p.staffNo}</span></span>
                    </Link>
                  </Td>
                  <Td className="hidden @4xl/main:table-cell">{ROLE_LABEL[p.role]}</Td>
                  <Td>{p.coreAirline ? <AirlineChip airline={map.get(p.coreAirline)!} /> : <Badge tone="brand">Float</Badge>}</Td>
                  <Td className="hidden @5xl/main:table-cell"><div className="flex flex-wrap gap-1">{p.trainedAirlines.map((c) => <AirlineChip key={c} airline={map.get(c)!} />)}</div></Td>
                  <Td className="hidden @4xl/main:table-cell">{p.homeTerminal === "US" ? "US" : "Intl"}</Td>
                  <Td>
                    {p.active === false ? <Badge tone="bad">Left {p.leftOn ? formatDate(p.leftOn, { day: "numeric", month: "short" }) : ""}</Badge> : hub.absenceOn(p.id, day) ? <AbsenceChip a={hub.absenceOn(p.id, day)!} /> : <ShiftChip shift={shiftOn.get(p.id) ?? "O"} />}
                  </Td>
                  <Td className="hidden @5xl/main:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {(workedOn.get(p.id) ?? []).map((w) => (
                        <Link key={w.logId} href={w.filed ? `/records/${w.logId}` : `/gate/${w.logId.replace(/^log-/, "")}`} className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-semibold transition-colors hover:bg-brand-50 hover:text-brand-700">{w.flightNo}</Link>
                      ))}
                      {workedOn.get(p.id)?.length ? null : <span className="text-xs text-muted">—</span>}
                    </div>
                  </Td>
                  <Td className="hidden @4xl/main:table-cell tabular">{pf.flights.length}</Td>
                  <Td className="hidden @4xl/main:table-cell tabular">{pf.flights.length ? pct(pf.d0) : "—"}</Td>
                  <Td>{expired ? <Badge tone="bad">Expired</Badge> : soon ? <Badge tone="warn">Due soon</Badge> : <Badge tone="ok">Current</Badge>}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
        <Pagination paged={paged} noun="staff" scrollTo={top} sizes={[15, 30, 60]} className="mx-1 mt-1" />
      </Card>
    </>
  );
}
