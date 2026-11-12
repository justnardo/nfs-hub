"use client";
import Link from "next/link";
import { CalendarDays, CalendarPlus } from "lucide-react";
import { Button, Card, CardContent } from "@nfs/ui";
import { formatDate } from "@nfs/db";
import { useHub } from "@/lib/store";
import { PortfolioView } from "@/components/portfolio-view";
import { periodDays, periodEnd, teamLabel, teamOf } from "@/lib/periods";
import { downloadText, shiftsIcs } from "@/lib/ics";

export default function MePage() {
  const hub = useHub();
  const { me } = hub;
  if (!me) return null;
  const mine = hub.periods.filter((p) => p.status === "published" && p.grid[me.id] !== undefined && periodEnd(p) >= hub.today).sort((a, b) => a.start.localeCompare(b.start));
  const shiftOf = new Map(hub.ds.roster.filter((r) => r.personId === me.id).map((r) => [r.date, r.shift]));
  return (
    <>
      {mine.length ? (
        <div className="mb-5 space-y-2">
          {mine.map((p) => (
            <Card key={p.id} className="border-brand-200">
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <CalendarDays className="size-5 text-brand-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Roster published: {formatDate(p.start, { day: "numeric", month: "short" })} – {formatDate(periodEnd(p), { day: "numeric", month: "short" })}</p>
                  <p className="text-xs text-muted">By {p.publishedBy?.name}{p.note ? ` · ${p.note}` : ""}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => downloadText(shiftsIcs(`${me.firstName} ${me.lastName}`, teamLabel(teamOf(me) ?? "", hub.ds.airlines), periodDays(p).map((d) => ({ date: d, shift: shiftOf.get(d) }))), `NFS-shifts-${p.start}.ics`, "text/calendar")}>
                  <CalendarPlus /> Add to calendar
                </Button>
                <Button size="sm" asChild><Link href={`/rosters/periods/${p.id}`}>View roster</Link></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
      <PortfolioView p={me} />
    </>
  );
}
