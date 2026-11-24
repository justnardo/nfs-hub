"use client";
import * as React from "react";
import { FileBarChart2, Loader2 } from "lucide-react";
import { Button, Dialog, DialogContent, Label, Select } from "@nfs/ui";
import type { Airline } from "@nfs/db";
import { useEngineInput, useHub } from "@/lib/store";
import { downloadAirlineReport, monthLabel, monthRange, reportMonths } from "@/lib/airline-report";
import { flash } from "./flash";

/** "Monthly report" button: pick a month, download the airline's branded service report. */
export function AirlineReportButton({
  airline: fixed, variant = "outline", size, label = "Monthly report", preparedBy,
}: {
  /** Leave out to let the user pick the airline too (Airlines page). */
  airline?: Airline;
  variant?: "outline" | "primary" | "ghost";
  size?: "sm";
  label?: string;
  /** Defaults to the signed-in user; the station manager's link passes NFS Passenger Services. */
  preparedBy?: string;
}) {
  const hub = useHub();
  const engine = useEngineInput();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const choices = hub.ds.airlines.filter((a) => !a.charter);
  const [pick, setPick] = React.useState(choices[0]?.code ?? "");
  const airline = fixed ?? choices.find((a) => a.code === pick) ?? choices[0];
  const months = React.useMemo(() => {
    if (!airline) return [hub.today.slice(0, 7)];
    const m = reportMonths(airline.code, hub.gateLogs);
    const now = hub.today.slice(0, 7);
    return m.includes(now) ? m : [now, ...m];
  }, [airline, hub.gateLogs, hub.today]);
  const [month, setMonth] = React.useState(months[0]);
  React.useEffect(() => setMonth(months[0]), [months]);
  if (!airline) return null;
  const count = hub.gateLogs.filter((l) => {
    const r = monthRange(month, hub.today);
    return l.airline === airline.code && l.status === "filed" && l.date >= r.from && l.date <= r.to;
  }).length;

  const download = async () => {
    setBusy(true);
    try {
      await downloadAirlineReport(
        airline,
        month,
        { today: hub.today, logs: hub.gateLogs, flights: hub.ds.flights, airlines: hub.ds.airlines, people: hub.ds.people, absences: hub.absences, reassignments: hub.reassignments, feedback: hub.feedback, engine },
        preparedBy ?? hub.session?.name ?? "NFS Passenger Services",
      );
      flash({ title: "Report downloaded", body: `${airline.name} · ${monthLabel(month)}`, tone: "ok" });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}><FileBarChart2 />{label}</Button>
      {open ? (
        <Dialog open onOpenChange={(v) => !v && setOpen(false)}>
          <DialogContent
            className="max-w-md"
            title={fixed ? `${airline.name} monthly report` : "Airline monthly report"}
            description="A branded PDF for the station manager: on-time results, why flights were late, every flight handled, their feedback and the team's training."
            footer={
              <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={download} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <FileBarChart2 />}Download PDF</Button>
              </div>
            }
          >
            {fixed ? null : (
              <>
                <Label className="text-xs">Airline</Label>
                <Select value={airline.code} onChange={(e) => setPick(e.target.value)} className="mb-3 mt-1 w-full">
                  {choices.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
                </Select>
              </>
            )}
            <Label className="text-xs">Month</Label>
            <Select value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1 w-full">
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}{m === hub.today.slice(0, 7) ? " (to date)" : ""}</option>)}
            </Select>
            <p className="mt-2 text-xs text-muted">{count} filed flight record{count === 1 ? "" : "s"} in this period.</p>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
