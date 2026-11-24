"use client";
/**
 * Monthly service report for one airline (portrait Letter, NFS-branded), written for the airline's
 * station manager: the month's KPIs, weekly trend, why flights were late, every flight handled,
 * their feedback and the state of the team that works their flights.
 */
import { addDays, rangeDays, stationBy, stationOf, type Airline, type FeedbackItem, type Flight, type GateLog, type Person, type Reassignment } from "@nfs/db";
import type { EngineInput } from "@nfs/rules";
import type { Absence } from "./absence";
import { boardingMinutes, doorCloseVsStd, isNfsCause, slaMet } from "./metrics";
import { buildReport } from "./report";

type RGB = [number, number, number];
const INK: RGB = [11, 27, 43];
const MUTED: RGB = [96, 117, 136];
const LINE: RGB = [226, 232, 238];
const TEAL: RGB = [14, 154, 167];
const VIOLET: RGB = [108, 92, 231];
const GOLD: RGB = [255, 200, 45];
const OK: RGB = [22, 128, 61];
const WARN: RGB = [180, 83, 9];
const BAD: RGB = [185, 28, 28];
const SURFACE: RGB = [244, 247, 250];

const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", o);
const tone = (x: number): RGB => (x >= 85 ? OK : x >= 70 ? WARN : BAD);
const hex = (h: string): RGB => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h);
  if (!m) return TEAL;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export interface AirlineReportData {
  today: string;
  logs: GateLog[];
  flights: Flight[];
  airlines: Airline[];
  people: Person[];
  absences: Absence[];
  reassignments: Reassignment[];
  feedback: FeedbackItem[];
  engine: EngineInput;
}

/** Months (YYYY-MM) with filed records for this airline, newest first. */
export function reportMonths(code: string, logs: GateLog[]): string[] {
  return [...new Set(logs.filter((l) => l.airline === code && l.status === "filed").map((l) => l.date.slice(0, 7)))].sort().reverse();
}

export function monthLabel(month: string) {
  return fmt(`${month}-01`, { month: "long", year: "numeric" });
}

/** The month's date range, ending today if the month isn't over. */
export function monthRange(month: string, today: string) {
  const from = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from, to: last < today ? last : today, partial: last >= today };
}

async function loadImage(src: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string>((ok) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((ok) => {
      const i = new Image();
      i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight });
      i.onerror = () => ok({ w: 1, h: 1 });
      i.src = data;
    });
    return { data, ...dims };
  } catch {
    return null;
  }
}

export async function downloadAirlineReport(airline: Airline, month: string, data: AirlineReportData, preparedBy: string) {
  const { from, to, partial } = monthRange(month, data.today);
  const rep = buildReport({
    from, to, terminal: "", airline: airline.code,
    logs: data.logs, flights: data.flights, airlines: data.airlines, people: data.people,
    absences: data.absences, reassignments: data.reassignments, feedback: data.feedback, engine: data.engine,
  });
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 42;
  const CW = W - M * 2;
  const logo = await loadImage("/brand/nfs-logo.png");
  const brand = hex(airline.colour);
  const station = stationBy(stationOf(airline));
  const monthName = monthLabel(month);
  const period = `${fmt(from, { day: "numeric", month: "long" })} – ${fmt(to, { day: "numeric", month: "long", year: "numeric" })}`;
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const flightBy = new Map(data.flights.map((f) => [f.id, f]));
  const logs = data.logs.filter((l) => l.airline === airline.code && l.status === "filed" && l.date >= from && l.date <= to).sort((a, b) => a.date.localeCompare(b.date) || (flightBy.get(a.flightId)?.std ?? "").localeCompare(flightBy.get(b.flightId)?.std ?? ""));

  const headed = new Set<number>();
  const pageHeader = (compact: boolean) => {
    headed.add(doc.getCurrentPageInfo().pageNumber);
    if (compact) {
      doc.setFillColor(...brand).rect(M, 26, 4, 12, "F");
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...INK).text(`${airline.name} · Monthly service report`, M + 10, 35);
      doc.setFont("helvetica", "normal").setTextColor(...MUTED).text(`${monthName} · ${station.name}`, W - M, 35, { align: "right" });
      doc.setDrawColor(...TEAL).setLineWidth(0.8).line(M, 44, W - M, 44);
      return 64;
    }
    doc.setFillColor(...INK).rect(0, 0, W, 132, "F");
    doc.setFillColor(...brand).rect(0, 132, W * 0.7, 4, "F");
    doc.setFillColor(...GOLD).rect(W * 0.7, 132, W * 0.3, 4, "F");
    if (logo) {
      const h = 40;
      const w = (logo.w / logo.h) * h;
      doc.setFillColor(255, 255, 255).roundedRect(M - 8, 30, w + 16, h + 14, 6, 6, "F");
      doc.addImage(logo.data, "PNG", M, 37, w, h);
    }
    doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...GOLD).text("NASSAU FLIGHT SERVICES · PASSENGER SERVICES", W - M, 40, { align: "right" });
    doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(255, 255, 255).text(`${airline.name}`, W - M, 64, { align: "right" });
    doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(201, 226, 229).text(`Monthly service report · ${monthName}${partial ? " (to date)" : ""}`, W - M, 82, { align: "right" });
    doc.setFontSize(8.5).text(`${station.airport} · ${period}`, W - M, 98, { align: "right" });
    doc.text(`Prepared for ${airline.stationManager.name}, station manager · by ${preparedBy}`, W - M, 112, { align: "right" });
    return 160;
  };
  const sectionTitle = (t: string, y: number, sub?: string) => {
    doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(...INK).text(t, M, y);
    if (sub) doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED).text(sub, M, y + 13);
    return y + (sub ? 24 : 12);
  };
  const ensure = (y: number, need: number) => {
    if (y + need <= H - 56) return y;
    doc.addPage();
    return pageHeader(true);
  };

  /* ---------- KPIs ---------- */
  let y = pageHeader(false);
  const s = rep.summary;
  const p = rep.previous;
  const delta = (a: number, b: number, unit = "pts") => {
    if (!p.flights) return "";
    const d = Math.round(a - b);
    return d === 0 ? "level with last month" : `${d > 0 ? "up" : "down"} ${Math.abs(d)} ${unit} on prior period`;
  };
  const kpis: { label: string; value: string; sub: string; color: RGB }[] = [
    { label: "Flights handled", value: String(s.flights), sub: "filed gate records", color: INK },
    { label: "On time (D0)", value: s.flights ? `${Math.round(s.d0)}%` : "—", sub: delta(s.d0, p.d0) || "pushed back by STD", color: s.flights ? tone(s.d0) : MUTED },
    { label: "Within 15 min (D15)", value: s.flights ? `${Math.round(s.d15)}%` : "—", sub: delta(s.d15, p.d15) || "of departures", color: s.flights ? tone(s.d15) : MUTED },
    { label: "Team met SLA", value: s.flights ? `${Math.round(s.slaCompliance)}%` : "—", sub: "staffing vs your minimums", color: s.slaCompliance >= 90 ? OK : WARN },
    { label: "Avg boarding", value: s.flights ? `${Math.round(s.avgBoarding)} min` : "—", sub: "start to close", color: INK },
    { label: "Passengers", value: rep.pax.toLocaleString("en-US"), sub: rep.wheelchairs ? `${rep.wheelchairs} wheelchair assists` : "boarded", color: INK },
  ];
  const kw = (CW - 2 * 10) / 3;
  kpis.forEach((k, i) => {
    const x = M + (i % 3) * (kw + 10);
    const ky = y + Math.floor(i / 3) * 72;
    doc.setFillColor(...SURFACE).roundedRect(x, ky, kw, 62, 5, 5, "F");
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED).text(k.label.toUpperCase(), x + 10, ky + 16);
    doc.setFont("helvetica", "bold").setFontSize(19).setTextColor(...k.color).text(k.value, x + 10, ky + 41);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED).text(k.sub, x + 10, ky + 54, { maxWidth: kw - 16 });
  });
  y += 150;

  // Delays: whose were they
  const totalDelays = s.nfsDelays + s.otherDelays;
  doc.setFillColor(...SURFACE).roundedRect(M, y, CW, 44, 5, 5, "F");
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...INK).text(`${totalDelays} delayed departure${totalDelays === 1 ? "" : "s"}`, M + 12, y + 18);
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED).text(
    totalDelays ? `${s.nfsDelays} caused by NFS passenger services · ${s.otherDelays} outside our control (inbound, weather, ATC)` : "Every departure this month left on time.",
    M + 12, y + 32, { maxWidth: CW - 170 },
  );
  if (totalDelays) {
    const bw = 130;
    const bx = W - M - bw - 12;
    doc.setFillColor(...TEAL).roundedRect(bx, y + 17, bw, 10, 3, 3, "F");
    if (s.nfsDelays) doc.setFillColor(...VIOLET).roundedRect(bx, y + 17, Math.max(6, (s.nfsDelays / totalDelays) * bw), 10, 3, 3, "F");
  }
  y += 62;

  /* ---------- Highlights ---------- */
  const highlights = rep.highlights
    .filter((h) => !/call-out|covers? placed/.test(h))
    .map((h) => h.replace(/^Station managers sent/, "Your station sent").replace(/^The team met each airline’s SLA staffing/, "The team met your SLA staffing"));
  if (highlights.length) {
    y = sectionTitle("Summary", y);
    doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(...INK);
    for (const line of highlights) {
      const wrapped = doc.splitTextToSize(line, CW - 16) as string[];
      y = ensure(y, wrapped.length * 12.5 + 6);
      doc.setFillColor(...brand).circle(M + 3, y + 5, 2, "F");
      doc.text(wrapped, M + 14, y + 8);
      y += wrapped.length * 12.5 + 5;
    }
    y += 12;
  }

  /* ---------- Weekly trend ---------- */
  const weeks: { label: string; flights: number; d0: number | null; d15: number | null; sla: number | null }[] = [];
  for (let ws = from; ws <= to; ws = addDays(ws, 7)) {
    const we = addDays(ws, 6) < to ? addDays(ws, 6) : to;
    const x = logs.filter((l) => l.date >= ws && l.date <= we);
    const on = x.filter((l) => l.delayMinutes <= 0).length;
    const on15 = x.filter((l) => l.delayMinutes <= 15).length;
    const sla = x.filter((l) => slaMet(l, airline)).length;
    weeks.push({
      label: `${fmt(ws, { day: "numeric", month: "short" })} – ${fmt(we, { day: "numeric", month: "short" })}`,
      flights: x.length,
      d0: x.length ? Math.round((on / x.length) * 100) : null,
      d15: x.length ? Math.round((on15 / x.length) * 100) : null,
      sla: x.length ? Math.round((sla / x.length) * 100) : null,
    });
  }
  while (weeks.length > 1 && weeks[0].flights === 0) weeks.shift(); // records start part-way through the month
  y = ensure(y, 60 + weeks.length * 22);
  y = sectionTitle("Week by week", y, "On time (D0) by week, with D15 and SLA staffing alongside");
  const labelW = 120;
  const barW = CW - labelW - 190;
  for (const w of weeks) {
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...INK).text(w.label, M, y + 10);
    doc.setFillColor(...LINE).roundedRect(M + labelW, y + 3, barW, 9, 2, 2, "F");
    if (w.d0 !== null) doc.setFillColor(...tone(w.d0)).roundedRect(M + labelW, y + 3, Math.max(3, (w.d0 / 100) * barW), 9, 2, 2, "F");
    doc.setFont("helvetica", "bold").setTextColor(...INK).text(w.d0 === null ? "—" : `${w.d0}%`, M + labelW + barW + 8, y + 10.5);
    doc.setFont("helvetica", "normal").setTextColor(...MUTED).text(w.flights ? `${w.flights} flights · D15 ${w.d15}% · SLA ${w.sla}%` : "no flights", M + labelW + barW + 40, y + 10.5);
    y += 20;
  }
  y += 14;

  /* ---------- Delay causes ---------- */
  if (rep.causes.length) {
    y = ensure(y, 50 + rep.causes.length * 16);
    y = sectionTitle("Why flights were late", y, "Cause recorded by the lead at the gate for each delayed departure");
    const max = Math.max(...rep.causes.map((c) => c.n));
    const lw = 150;
    const bw = CW - lw - 80;
    for (const c of rep.causes) {
      doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...INK).text(c.cause, M, y + 9);
      doc.setFillColor(...(c.nfs ? VIOLET : TEAL)).roundedRect(M + lw, y + 2, Math.max(3, (c.n / max) * bw), 9, 2, 2, "F");
      doc.setTextColor(...MUTED).text(`${c.n} · ${c.minutes} min`, M + lw + (c.n / max) * bw + 6, y + 9.5);
      y += 15;
    }
    doc.setFontSize(7.5).setFillColor(...TEAL).rect(M, y + 4, 8, 6, "F");
    doc.setTextColor(...MUTED).text("Outside NFS control", M + 12, y + 9.5);
    doc.setFillColor(...VIOLET).rect(M + 110, y + 4, 8, 6, "F");
    doc.text("NFS passenger services", M + 122, y + 9.5);
    y += 34;
  }

  /* ---------- Every flight ---------- */
  y = ensure(y, 110);
  y = sectionTitle("Every flight this month", y, "From the filed gate record; door close compared with scheduled departure");
  autoTable(doc, {
    startY: y + 4,
    margin: { left: M, right: M, top: 64, bottom: 56 },
    head: [["Date", "Flight", "STD", "Door close", "Delay", "Cause", "Pax", "Boarding", "SLA team"]],
    body: logs.map((l) => {
      const f = flightBy.get(l.flightId);
      const dc = f ? doorCloseVsStd(l, f) : null;
      const b = boardingMinutes(l);
      return [
        fmt(l.date, { weekday: "short", day: "numeric", month: "short" }),
        f?.flightNo ?? "",
        f?.std ?? "",
        l.events.door_close ? `${l.events.door_close}${dc !== null && dc !== 0 ? ` (${dc > 0 ? "+" : ""}${dc})` : ""}` : "—",
        l.delayMinutes > 0 ? `+${l.delayMinutes} min` : "On time",
        l.delayCause ? `${l.delayCause}${isNfsCause(l.delayCause) ? " (NFS)" : ""}` : "",
        l.paxBoarded ?? "",
        b !== null ? `${b} min` : "",
        slaMet(l, airline) ? "Met" : "Short",
      ];
    }),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7.8, cellPadding: 3.5, lineColor: LINE, lineWidth: 0.5, textColor: INK },
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: SURFACE },
    columnStyles: { 0: { cellWidth: 70 }, 1: { fontStyle: "bold", cellWidth: 52 }, 5: { cellWidth: 104 } },
    didParseCell: (h) => {
      if (h.section !== "body") return;
      if (h.column.index === 4) h.cell.styles.textColor = String(h.cell.raw) === "On time" ? OK : String(h.cell.raw).startsWith("+") && Number(String(h.cell.raw).replace(/\D/g, "")) > 15 ? BAD : WARN;
      if (h.column.index === 8) h.cell.styles.textColor = h.cell.raw === "Met" ? OK : WARN;
    },
  });
  if (!logs.length) {
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED).text("No filed records for this airline in the period.", M, lastY() + 14);
  }
  y = lastY() + 28;

  /* ---------- Feedback ---------- */
  const fb = data.feedback.filter((f) => f.airline === airline.code && f.date >= from && f.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  y = ensure(y, 90);
  y = sectionTitle("Your feedback", y, fb.length ? `${rep.feedback.praise} compliment${rep.feedback.praise === 1 ? "" : "s"} and ${rep.feedback.complaints} complaint${rep.feedback.complaints === 1 ? "" : "s"} from the station this month` : "No feedback logged this month");
  if (fb.length) {
    autoTable(doc, {
      startY: y + 4,
      margin: { left: M, right: M, top: 64, bottom: 56 },
      head: [["Date", "Type", "What was raised", "Status"]],
      body: fb.map((f) => [fmt(f.date, { day: "numeric", month: "short" }), f.kind === "praise" ? "Compliment" : "Complaint", f.summary, f.status === "open" ? "Open" : f.status === "reviewed" ? "Reviewed" : "Closed"]),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8.2, cellPadding: 4, lineColor: LINE, lineWidth: 0.5, textColor: INK },
      headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: SURFACE },
      columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 70 }, 3: { cellWidth: 60 } },
      didParseCell: (h) => {
        if (h.section === "body" && h.column.index === 1) h.cell.styles.textColor = h.cell.raw === "Compliment" ? OK : WARN;
      },
    });
    y = lastY() + 28;
  } else {
    y += 8;
  }

  /* ---------- Team and training ---------- */
  const core = data.people.filter((x) => x.active !== false && x.coreAirline === airline.code && (x.role === "agent" || x.role === "lead"));
  const backup = data.people.filter((x) => x.active !== false && x.coreAirline !== airline.code && (x.role === "agent" || x.role === "lead") && x.trainedAirlines.includes(airline.code) && stationOf(x) === stationOf(airline));
  const current = (x: Person) => airline.requiredTraining.every((course) => x.training.some((t) => t.airline === airline.code && t.course === course && t.expires >= data.today)) || !airline.requiredTraining.length;
  const coreCurrent = core.filter(current).length;
  const expSoon = core.filter((x) => x.training.some((t) => t.airline === airline.code && t.expires >= data.today && t.expires <= addDays(data.today, 30))).length;
  y = ensure(y, 150);
  y = sectionTitle("Your team", y, "The NFS staff who work your flights, and their airline training");
  const rows: [string, string][] = [
    ["Core team", `${core.filter((x) => x.role === "lead").length} leads · ${core.filter((x) => x.role === "agent").length} agents`],
    ["Qualified backup", `${backup.length} staff trained on ${airline.name} from other teams`],
    ["Training current", `${coreCurrent} of ${core.length} core staff current on ${airline.requiredTraining.join(", ") || "required courses"}`],
    ["Renewals due", expSoon ? `${expSoon} renewal${expSoon === 1 ? "" : "s"} due in the next 30 days, already scheduled` : "None due in the next 30 days"],
    ["SLA minimums", `${airline.sla.counter} counter · ${airline.sla.gate} gate${airline.sla.jetBridge ? ` · ${airline.sla.jetBridge} jet bridge` : ""} · ${airline.sla.lead} lead${airline.slaConfirmed ? "" : " (to be confirmed with you)"}`],
    ["Coverage", rep.staffing.shifts ? `${Math.round((rep.staffing.shiftsAtSla / rep.staffing.shifts) * 100)}% of operating shifts fully staffed against your minimums` : "No operating shifts in the period"],
  ];
  for (const [k, v] of rows) {
    const lines = doc.setFont("helvetica", "normal").setFontSize(8.8).splitTextToSize(v, CW - 130) as string[];
    const extra = (lines.length - 1) * 11;
    doc.setFont("helvetica", "bold").setTextColor(...INK).text(k, M, y + 10);
    doc.setFont("helvetica", "normal").setTextColor(...INK).text(lines, M + 120, y + 10);
    doc.setDrawColor(...LINE).setLineWidth(0.5).line(M, y + 17 + extra, W - M, y + 17 + extra);
    y += 22 + extra;
  }
  y += 16;

  y = ensure(y, 60);
  doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED);
  const notes = doc.splitTextToSize(
    "How to read this report: D0 counts a departure as on time when it pushed back at or before scheduled departure; D15 within 15 minutes. Delay causes are recorded by the NFS lead at the gate. 'SLA team' compares the staff logged on each flight with your agreed minimums. Questions about any flight: reply to your NFS passenger services contact and quote the date and flight number.",
    CW,
  ) as string[];
  doc.text(notes, M, y);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    if (!headed.has(i)) pageHeader(true); // pages started by a long table
    doc.setDrawColor(...LINE).setLineWidth(0.5).line(M, H - 40, W - M, H - 40);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED);
    doc.text(`Prepared for ${airline.name} · Nassau Flight Services · Generated by Gateline`, M, H - 26);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 26, { align: "right" });
  }
  doc.save(`NFS-${airline.code}-Service-Report-${month}.pdf`);
}

/** Days in the month so far, for the picker. */
export const monthDays = (month: string, today: string) => {
  const r = monthRange(month, today);
  return rangeDays(r.from, Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86400000) + 1).length;
};
