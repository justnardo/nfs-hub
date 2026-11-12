"use client";
import * as React from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { Avatar, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Table, Td, Th, Tr } from "@nfs/ui";
import { ROLE_LABEL } from "@nfs/auth";
import { formatDate } from "@nfs/db";
import { useHub, personName } from "@/lib/store";
import { RequirePerm } from "@/components/guard";

export default function AdminPage() {
  return (
    <RequirePerm perm="system.admin">
      <Accounts />
    </RequirePerm>
  );
}

function Accounts() {
  const hub = useHub();
  const open = hub.requests.filter((r) => r.status === "open");
  const done = hub.requests.filter((r) => r.status !== "open").slice(0, 10);
  const counts = (["agent", "lead", "supervisor", "manager", "admin"] as const).map((r) => [r, hub.ds.people.filter((p) => p.role === r && p.active !== false).length] as const);

  return (
    <>
      <PageHeader eyebrow="Super Admin" title="Accounts" description="Password requests from staff and an overview of accounts. Roles and teams are changed from each person's profile." />
      <div className="mb-5 grid grid-cols-2 gap-3 @2xl/main:grid-cols-5">
        {counts.map(([r, n]) => (
          <Card key={r} className="p-4">
            <p className="text-xs font-semibold text-muted">{ROLE_LABEL[r]}s</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular">{n}</p>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><div><CardTitle>Password requests</CardTitle><CardDescription>Issue a temporary password and let the person know directly</CardDescription></div><KeyRound className="size-4 text-brand-500" /></CardHeader>
        <CardContent className="px-2 sm:px-5">
          {open.length === 0 ? <p className="px-2 pb-2 text-sm text-muted">No open requests.</p> : null}
          {open.length ? (
            <Table>
              <thead><tr><Th>Staff</Th><Th>Requested</Th><Th>Note</Th><Th /></tr></thead>
              <tbody>
                {open.map((r) => {
                  const p = hub.people.get(r.personId);
                  return (
                    <Tr key={r.id}>
                      <Td>
                        <Link href={`/agents/${r.personId}`} className="flex items-center gap-2 font-semibold transition-colors hover:text-brand-600">
                          <Avatar name={personName(p)} src={p?.photoUrl} className="size-7" />
                          <span>{personName(p)} <span className="block text-[11px] font-normal text-muted">{p?.staffNo} · {p ? ROLE_LABEL[p.role] : ""}</span></span>
                        </Link>
                      </Td>
                      <Td className="text-xs">{formatDate(r.at.slice(0, 10))}</Td>
                      <Td className="max-w-xs text-xs text-muted">{r.note || "—"}</Td>
                      <Td>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => hub.resolveRequest(r.id, "done")}>Issue temporary password</Button>
                          <Button size="sm" variant="ghost" onClick={() => hub.resolveRequest(r.id, "declined")}>Decline</Button>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          ) : null}
          {done.length ? (
            <div className="mt-4 space-y-1 px-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Recently handled</p>
              {done.map((r) => (
                <p key={r.id} className="text-xs text-muted">{personName(hub.people.get(r.personId))} — <Badge tone={r.status === "done" ? "ok" : "neutral"}>{r.status === "done" ? "temporary password issued" : "declined"}</Badge> {r.resolvedBy ? `by ${r.resolvedBy}` : ""}</p>
              ))}
            </div>
          ) : null}
          <p className="mt-4 px-2 text-[11px] text-muted">Demo: issuing a temporary password resets the account to the demo password. In production this sends a Supabase Auth reset link to the staff email on file.</p>
        </CardContent>
      </Card>
    </>
  );
}
