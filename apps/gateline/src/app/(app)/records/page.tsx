"use client";
import * as React from "react";
import Link from "next/link";
import { Pagination, usePaged } from "@/components/pagination";
import { Download } from "lucide-react";
import { Badge, Button, Card, Input, Label, PageHeader, Select, Table, Td, Th, Tr } from "@nfs/ui";
import { addDays, formatDate } from "@nfs/db";
import { useHub, personName } from "@/lib/store";
import { RequirePerm } from "@/components/guard";
import { AirlineChip } from "@/components/ops";
import { isNfsCause, slaMet } from "@/lib/metrics";

export default function RecordsPage() {
  return (
    <RequirePerm perm="staff.view">
      <Records />
    </RequirePerm>
  );
}

function Records() {
  const hub = useHub();
  const [from, setFrom] = React.useState(addDays(hub.today, -6));
  const [to, setTo] = React.useState(hub.today);
  const [airline, setAirline] = React.useState("");
  const [lead, setLead] = React.useState("");
  const [onlyIssues, setOnlyIssues] = React.useState(false);
  const map = new Map(hub.ds.airlines.map((a) => [a.code, a]));
  const flightById = new Map(hub.ds.flights.map((f) => [f.id, f]));
  const leads = hub.ds.people.filter((p) => p.role === "lead").sort((a, b) => a.lastName.localeCompare(b.lastName));

  const rows = hub.gateLogs
    .filter((l) => l.status === "filed" && l.date >= from && l.date <= to)
    .filter((l) => !airline || l.airline === airline)
    .filter((l) => !lead || l.leadId === lead)
    .filter((l) => !onlyIssues || l.delayMinutes > 0 || l.discrepancies.length > 0)
    .map((l) => ({ l, f: flightById.get(l.flightId)! }))
    .sort((a, b) => (b.f.date + b.f.std).localeCompare(a.f.date + a.f.std));
  const paged = usePaged(rows, 15, [from, to, airline, lead, onlyIssues]);
  const top = React.useRef<HTMLParagraphElement>(null);

  const exportCsv = () => {
    const head = ["Date", "Flight", "Airline", "Destination", "STD", "Lead", "Team", "Boarding start", "Boarding close", "Door close", "Pushback", "Delay min", "Cause", "Pax booked", "Pax boarded", "Discrepancies", "SLA met"];
    const lines = rows.map(({ l, f }) => [
      f.date, f.flightNo, l.airline, f.destination, f.std, personName(hub.people.get(l.leadId)), new Set(l.team.map((t) => t.personId)).size, l.events.boarding_start ?? "", l.events.boarding_close ?? "",
      l.events.door_close ?? "", l.events.pushback ?? "", l.delayMinutes, l.delayCause ?? "", f.paxBooked, l.paxBoarded ?? "", l.discrepancies.map((d) => d.type).join("; "), slaMet(l, map.get(l.airline)!) ? "Y" : "N",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `gateline-records-${from}-to-${to}.csv`;
    a.click();
  };

  return (
    <>
      <PageHeader
        eyebrow="Flight records"
        title="Filed gate records"
        description="Every flight's record, filed by date, airline, lead and team. Open one to print or share it with the airline's station manager."
        actions={<Button variant="outline" onClick={exportCsv}><Download /> Export CSV</Button>}
      />
      <Card className="mb-4 grid grid-cols-2 items-end gap-3 p-3 @2xl/main:grid-cols-5">
        <div><Label htmlFor="from">From</Label><Input id="from" type="date" value={from} min={hub.ds.windowStart} max={to} onChange={(e) => setFrom(e.target.value)} className="mt-1" /></div>
        <div><Label htmlFor="to">To</Label><Input id="to" type="date" value={to} min={from} max={hub.today} onChange={(e) => setTo(e.target.value)} className="mt-1" /></div>
        <div><Label htmlFor="al">Airline</Label><Select id="al" value={airline} onChange={(e) => setAirline(e.target.value)} className="mt-1 w-full"><option value="">All</option>{hub.ds.airlines.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</Select></div>
        <div><Label htmlFor="ld">Lead</Label><Select id="ld" value={lead} onChange={(e) => setLead(e.target.value)} className="mt-1 w-full"><option value="">All leads</option>{leads.map((p) => <option key={p.id} value={p.id}>{personName(p)}</option>)}</Select></div>
        <label className="flex h-10 cursor-pointer items-center gap-2 text-sm font-medium"><input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} className="size-4 accent-[var(--color-brand-500)]" /> Delays or issues only</label>
      </Card>
      <Card className="px-2 sm:px-4">
        <p ref={top} className="scroll-mt-20 px-2 pt-3 text-xs text-muted">{rows.length} records</p>
        <Table>
          <thead><tr><Th>Date</Th><Th>Flight</Th><Th className="hidden @4xl/main:table-cell">Lead</Th><Th>Team</Th><Th className="hidden @5xl/main:table-cell">Boarding</Th><Th className="hidden @5xl/main:table-cell">Door close</Th><Th>Pushback</Th><Th>Outcome</Th><Th>Issues</Th></tr></thead>
          <tbody>
            {paged.rows.map(({ l, f }) => {
              const a = map.get(l.airline)!;
              return (
                <Tr key={l.id}>
                  <Td className="whitespace-nowrap text-xs">{formatDate(f.date)}</Td>
                  <Td><Link href={`/records/${l.id}`} className="flex items-center gap-1.5 font-semibold transition-colors hover:text-brand-600"><AirlineChip airline={a} />{f.flightNo}<span className="text-xs font-normal text-muted">{f.destination}</span></Link></Td>
                  <Td className="hidden @4xl/main:table-cell text-xs">{personName(hub.people.get(l.leadId))}</Td>
                  <Td>{slaMet(l, a) ? <Badge tone="ok">{new Set(l.team.map((t) => t.personId)).size} · SLA</Badge> : <Badge tone="warn">{new Set(l.team.map((t) => t.personId)).size} · short</Badge>}</Td>
                  <Td className="hidden @5xl/main:table-cell tabular text-xs">{l.events.boarding_start}–{l.events.boarding_close}</Td>
                  <Td className="hidden @5xl/main:table-cell tabular">{l.events.door_close}</Td>
                  <Td className="tabular">{l.events.pushback}</Td>
                  <Td>{l.delayMinutes === 0 ? <Badge tone="ok">On time</Badge> : <Badge tone={isNfsCause(l.delayCause) ? "warn" : "neutral"}>+{l.delayMinutes}m · {l.delayCause}</Badge>}</Td>
                  <Td>{l.discrepancies.length ? <Badge tone="gold">{l.discrepancies.length}</Badge> : <span className="text-xs text-muted">—</span>}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
        <Pagination paged={paged} noun="records" scrollTo={top} sizes={[15, 30, 60]} className="mx-1 mt-1 pb-3" />
      </Card>
    </>
  );
}
