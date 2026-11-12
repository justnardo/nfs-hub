"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Mail, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { can } from "@nfs/auth";
import type { RouteTemplate } from "@nfs/demo";
import { AirlineDialog, RouteDialog } from "@/components/airline-editor";
import { Pagination, usePaged } from "@/components/pagination";
import { Avatar, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Stat, Table, Td, Th, Tr } from "@nfs/ui";
import { addDays, formatDate } from "@nfs/db";
import { eligibleFor, expiringSoon } from "@nfs/rules";
import { useHub, personName } from "@/lib/store";
import { RequirePerm } from "@/components/guard";
import { AirlineChip, PersonLink } from "@/components/ops";
import { pct, summarise } from "@/lib/metrics";

export default function AirlinePage() {
  return (
    <RequirePerm perm="staff.view">
      <AirlineProfile />
    </RequirePerm>
  );
}

function AirlineProfile() {
  const { code } = useParams<{ code: string }>();
  const hub = useHub();
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [route, setRoute] = React.useState<RouteTemplate | "new" | null>(null);
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const a = hub.ds.airlines.find((x) => x.code === code);
  const core = hub.ds.people.filter((p) => a && p.coreAirline === a.code).sort((x, y) => (x.role === y.role ? x.lastName.localeCompare(y.lastName) : x.role === "lead" ? -1 : 1));
  const corePage = usePaged(core, 10, code);
  if (!a) return <p className="text-sm text-muted">Airline not found.</p>;
  const manage = can(hub.session?.role, "airlines.edit");
  const map = new Map(hub.ds.airlines.map((x) => [x.code, x]));
  const since = addDays(hub.today, -21);
  const logs = hub.gateLogs.filter((g) => g.airline === a.code && g.date >= since);
  const s = summarise(logs, map);
  const backup = hub.ds.people.filter((p) => p.coreAirline !== a.code && p.trainedAirlines.includes(a.code) && (p.role === "agent" || p.role === "lead"));
  const fb = hub.feedback.filter((f) => f.airline === a.code).slice(0, 5);
  const routes = hub.routes.filter((r) => r.airline === a.code).sort((x, y) => x.std.localeCompare(y.std));
  const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/airlines"><ArrowLeft /> Airlines</Link></Button>
      <PageHeader
        eyebrow={a.terminal === "US" ? "US Departures Terminal" : "International Terminal"}
        title={a.name}
        description={a.stationManager.preferences}
        actions={
          <>
            {!a.slaConfirmed ? <Badge tone="gold">SLA figures are placeholders until NFS confirms</Badge> : null}
            {manage ? <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit airline</Button> : null}
            {manage ? (
              confirmRemove ? (
                <>
                  <span className="text-xs text-muted">Remove {a.code}? Its core staff move to the float pool.</span>
                  <Button variant="danger" size="sm" onClick={() => { hub.removeAirline(a.code); router.push("/airlines"); }}>Remove</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(false)}>Keep</Button>
                </>
              ) : (
                <Button variant="ghost" size="icon" title="Remove airline" onClick={() => setConfirmRemove(true)}><Trash2 /></Button>
              )
            ) : null}
          </>
        }
      />
      {editing ? <AirlineDialog airline={a} onClose={() => setEditing(false)} /> : null}
      {route ? <RouteDialog airline={a} route={route === "new" ? undefined : route} onClose={() => setRoute(null)} /> : null}
      <div className="grid grid-cols-2 gap-3 @3xl/main:grid-cols-4">
        <Stat label="On-time D0 · 21 days" value={pct(s.d0)} tone={s.d0 >= 85 ? "ok" : "warn"} sub={`${s.flights} flights`} />
        <Stat label="D15" value={pct(s.d15)} />
        <Stat label="Team met SLA" value={pct(s.slaCompliance)} tone={s.slaCompliance >= 90 ? "ok" : "warn"} />
        <Stat label="NFS-caused delays" value={s.nfsDelays} sub={`${s.otherDelays} delays from other causes`} tone={s.nfsDelays ? "warn" : "ok"} />
      </div>

      <div className="mt-5 grid gap-5 @5xl/main:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader><div><CardTitle>Core team</CardTitle><CardDescription>Protected — moving these staff off {a.code} needs a manager when it breaks SLA</CardDescription></div></CardHeader>
          <CardContent className="px-2 sm:px-5">
            <Table>
              <thead><tr><Th>Name</Th><Th>Role</Th><Th className="hidden @lg/tbl:table-cell">Also qualified</Th><Th>Training</Th></tr></thead>
              <tbody>
                {corePage.rows.map((p) => {
                  const e = eligibleFor(p, a, hub.today);
                  const soon = expiringSoon(p, hub.today).filter((t) => t.airline === a.code);
                  return (
                    <Tr key={p.id}>
                      <Td><div className="flex items-center gap-2"><Avatar name={personName(p)} src={p.photoUrl} tone={p.role === "lead" ? "dark" : "brand"} className="size-7" /><PersonLink p={p} /></div></Td>
                      <Td className="capitalize">{p.role}</Td>
                      <Td className="hidden @lg/tbl:table-cell"><div className="flex flex-wrap gap-1">{p.trainedAirlines.filter((c) => c !== a.code).map((c) => <AirlineChip key={c} airline={map.get(c)!} />)}</div></Td>
                      <Td>{!e.ok ? <Badge tone="bad">{e.reason}</Badge> : soon.length ? <Badge tone="warn">Expires {formatDate(soon[0].expires, { day: "numeric", month: "short" })}</Badge> : <Badge tone="ok">Current</Badge>}</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination paged={corePage} noun="staff" sizes={[10, 25]} className="mx-1 mt-1" />
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader><div><CardTitle>Station manager</CardTitle><CardDescription>Contact details are fictional in the demo</CardDescription></div></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-semibold">{a.stationManager.name}</p>
              <p className="flex items-center gap-2 text-muted"><Phone className="size-3.5" />{a.stationManager.phone}</p>
              <p className="flex items-center gap-2 text-muted"><Mail className="size-3.5" />{a.stationManager.email}</p>
              <p className="rounded-lg bg-surface p-2.5 text-xs">{a.stationManager.preferences}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Required training</CardTitle><CardDescription>Synced from TakeFlight</CardDescription></div></CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">{a.requiredTraining.map((t) => <Badge key={t} tone="brand">{t}</Badge>)}</CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Approved backup pool</CardTitle><CardDescription>Qualified on {a.code} from other teams and the float pool</CardDescription></div></CardHeader>
            <CardContent className="space-y-1.5">
              {backup.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <PersonLink p={p} />
                  <Badge tone={p.coreAirline ? "neutral" : "brand"}>{p.coreAirline ? `Core ${p.coreAirline}` : "Float"}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-5 grid gap-5 @3xl/main:grid-cols-2">
        <Card>
          <CardHeader>
            <div><CardTitle>Flight schedule</CardTitle><CardDescription>Feeds SLA demand for rosters and coverage</CardDescription></div>
            {manage ? <Button variant="secondary" size="sm" onClick={() => setRoute("new")}><Plus /> Add departure</Button> : null}
          </CardHeader>
          <CardContent className="px-2 sm:px-5">
            {routes.length === 0 ? <p className="px-2 text-sm text-muted">No departures scheduled yet{manage ? " — add the first one" : ""}.</p> : null}
            <Table>
              <thead><tr><Th>Flight</Th><Th>To</Th><Th>STD</Th><Th className="hidden @lg/tbl:table-cell">Days</Th><Th className="hidden @lg/tbl:table-cell">Aircraft</Th><Th>Gate</Th>{manage ? <Th /> : null}</tr></thead>
              <tbody>
                {routes.map((r) => (
                  <Tr key={r.flightNo}>
                    <Td className="font-semibold">{r.flightNo}</Td>
                    <Td>{r.destName} <span className="text-xs text-muted">{r.dest}</span></Td>
                    <Td className="tabular">{r.std}</Td>
                    <Td className="hidden @lg/tbl:table-cell text-xs">{r.days ? r.days.map((d) => DOW[d]).join(" ") : "Daily"}</Td>
                    <Td className="hidden @lg/tbl:table-cell">{r.aircraft}</Td>
                    <Td>{r.gate}</Td>
                    {manage ? <Td><Button variant="ghost" size="icon" onClick={() => setRoute(r)} aria-label={`Edit ${r.flightNo}`}><Pencil /></Button></Td> : null}
                  </Tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Airline feedback</CardTitle></div><Button variant="ghost" size="sm" asChild><Link href="/feedback">All</Link></Button></CardHeader>
          <CardContent className="space-y-2">
            {fb.map((f) => (
              <div key={f.id} className="rounded-lg border border-line p-2.5 text-sm">
                <div className="flex items-center gap-2"><Badge tone={f.kind === "praise" ? "ok" : "bad"}>{f.kind}</Badge><span className="text-xs text-muted">{formatDate(f.date)}</span></div>
                <p className="mt-1">{f.summary}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
