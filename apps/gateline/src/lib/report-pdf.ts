"use client";
/**
 * Board report (portrait Letter): executive summary with KPIs and highlights, trend and delay-cause
 * charts drawn as vectors, airline scorecard, lead performance, staffing and attendance, passenger
 * issues and airline feedback. Same numbers as the Analytics page.
 */
import { ABSENCE_TYPES, type AbsenceType } from "./absence";
import type { Report } from "./report";

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

export async function downloadBoardReport(rep: Report, preparedBy: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 42;
  const CW = W - M * 2;
  const logo = await loadImage("/brand/nfs-logo.png");
  const period = `${fmt(rep.from, { day: "numeric", month: "long" })} – ${fmt(rep.to, { day: "numeric", month: "long", year: "numeric" })}`;
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  const pageHeader = (compact: boolean) => {
    if (compact) {
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...INK).text("Passenger Services Performance Report", M, 34);
      doc.setFont("helvetica", "normal").setTextColor(...MUTED).text(`${period} · ${rep.scope}`, W - M, 34, { align: "right" });
      doc.setDrawColor(...TEAL).setLineWidth(0.8).line(M, 42, W - M, 42);
      return 62;
    }
    doc.setFillColor(...INK).rect(0, 0, W, 118, "F");
    doc.setFillColor(...GOLD).rect(0, 118, W, 3, "F");
    if (logo) {
      const h = 40;
      const w = (logo.w / logo.h) * h;
      doc.setFillColor(255, 255, 255).roundedRect(M - 8, 28, w + 16, h + 14, 6, 6, "F");
      doc.addImage(logo.data, "PNG", M, 35, w, h);
    }
    doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...GOLD).text("NASSAU FLIGHT SERVICES · GATELINE", W - M, 40, { align: "right" });
    doc.setFont("helvetica", "bold").setFontSize(19).setTextColor(255, 255, 255).text("Passenger Services Performance", W - M, 64, { align: "right" });
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(201, 226, 229).text(`${period} · ${rep.days} days · ${rep.scope}`, W - M, 82, { align: "right" });
    doc.setFontSize(8.5).text(`Prepared by ${preparedBy} · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Nassau" })}`, W - M, 98, { align: "right" });
    return 146;
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

  /* ---------- Page 1: summary ---------- */
  let y = pageHeader(false);
  const s = rep.summary;
  const p = rep.previous;
  const delta = (a: number, b: number) => {
    if (!p.flights) return "";
    const d = Math.round(a - b);
    return d === 0 ? "level with previous period" : `${d > 0 ? "up" : "down"} ${Math.abs(d)} pts on previous period`;
  };
  const kpis: { label: string; value: string; sub: string; color: RGB }[] = [
    { label: "On time (D0)", value: `${Math.round(s.d0)}%`, sub: delta(s.d0, p.d0) || "pushed back by STD", color: tone(s.d0) },
    { label: "Within 15 min (D15)", value: `${Math.round(s.d15)}%`, sub: delta(s.d15, p.d15) || "of departures", color: tone(s.d15) },
    { label: "Team met SLA", value: `${Math.round(s.slaCompliance)}%`, sub: delta(s.slaCompliance, p.slaCompliance) || "of flights", color: s.slaCompliance >= 90 ? OK : WARN },
    { label: "Flights handled", value: String(s.flights), sub: rep.charters ? `incl. ${rep.charters} charter` : "filed records", color: INK },
    { label: "Passengers boarded", value: rep.pax.toLocaleString("en-US"), sub: rep.wheelchairs ? `${rep.wheelchairs} wheelchair assists` : "", color: INK },
    { label: "Delays caused by NFS", value: String(s.nfsDelays), sub: `of ${s.nfsDelays + s.otherDelays} delays`, color: s.nfsDelays ? WARN : OK },
  ];
  const kw = (CW - 5 * 8) / 6;
  kpis.forEach((k, i) => {
    const x = M + i * (kw + 8);
    doc.setFillColor(...SURFACE).roundedRect(x, y, kw, 66, 5, 5, "F");
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...MUTED).text(k.label.toUpperCase(), x + 8, y + 15, { maxWidth: kw - 12 });
    doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...k.color).text(k.value, x + 8, y + 42);
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...MUTED).text(k.sub, x + 8, y + 56, { maxWidth: kw - 12 });
  });
  y += 88;

  y = sectionTitle("Highlights", y);
  doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(...INK);
  for (const line of rep.highlights) {
    const wrapped = doc.splitTextToSize(line, CW - 16) as string[];
    doc.setFillColor(...TEAL).circle(M + 3, y + 5, 2, "F");
    doc.text(wrapped, M + 14, y + 8);
    y += wrapped.length * 12.5 + 5;
  }
  y += 10;

  // On-time trend chart
  y = ensure(y, 190);
  y = sectionTitle("On-time trend", y, "Share of departures on time (D0) and within 15 minutes (D15), by day");
  const ch = { x: M + 26, y: y + 6, w: CW - 30, h: 130 };
  const yMin = 40;
  const yOf = (v: number) => ch.y + ch.h - ((Math.max(yMin, v) - yMin) / (100 - yMin)) * ch.h;
  doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...MUTED);
  for (const g of [40, 60, 80, 100]) {
    doc.setDrawColor(...LINE).setLineWidth(0.5).line(ch.x, yOf(g), ch.x + ch.w, yOf(g));
    doc.text(`${g}%`, ch.x - 6, yOf(g) + 2.5, { align: "right" });
  }
  const pts = rep.trend;
  const xOf = (i: number) => ch.x + (pts.length <= 1 ? ch.w / 2 : (i / (pts.length - 1)) * ch.w);
  const series = (key: "d0" | "d15", color: RGB) => {
    doc.setDrawColor(...color).setLineWidth(1.6);
    let prev: [number, number] | null = null;
    pts.forEach((pt, i) => {
      const v = pt[key];
      if (v === null) return;
      const cur: [number, number] = [xOf(i), yOf(v)];
      if (prev) doc.line(prev[0], prev[1], cur[0], cur[1]);
      doc.setFillColor(...color).circle(cur[0], cur[1], 1.8, "F");
      prev = cur;
    });
  };
  series("d15", VIOLET);
  series("d0", TEAL);
  const step = Math.max(1, Math.ceil(pts.length / 8));
  pts.forEach((pt, i) => {
    if (i % step === 0 || i === pts.length - 1) doc.text(fmt(pt.date, { day: "numeric", month: "short" }), xOf(i), ch.y + ch.h + 12, { align: "center" });
  });
  doc.setFillColor(...TEAL).rect(ch.x, ch.y + ch.h + 22, 10, 2.5, "F");
  doc.setTextColor(...INK).text("D0 on time", ch.x + 14, ch.y + ch.h + 25);
  doc.setFillColor(...VIOLET).rect(ch.x + 80, ch.y + ch.h + 22, 10, 2.5, "F");
  doc.text("D15 within 15 min", ch.x + 94, ch.y + ch.h + 25);
  y = ch.y + ch.h + 44;

  // Delay causes
  if (rep.causes.length) {
    y = ensure(y, 40 + rep.causes.length * 16);
    y = sectionTitle("Why flights were late", y, "Every delay carries its recorded cause, so staff aren't marked down for late inbounds or weather");
    const max = Math.max(...rep.causes.map((c) => c.n));
    const labelW = 150;
    const barW = CW - labelW - 60;
    for (const c of rep.causes) {
      doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...INK).text(c.cause, M, y + 9);
      doc.setFillColor(...(c.nfs ? VIOLET : TEAL)).roundedRect(M + labelW, y + 2, Math.max(3, (c.n / max) * barW), 9, 2, 2, "F");
      doc.setTextColor(...MUTED).text(`${c.n} · ${c.minutes} min`, M + labelW + (c.n / max) * barW + 6, y + 9.5);
      y += 15;
    }
    doc.setFontSize(7.5).setFillColor(...TEAL).rect(M, y + 4, 8, 6, "F");
    doc.setTextColor(...MUTED).text("Outside NFS control", M + 12, y + 9.5);
    doc.setFillColor(...VIOLET).rect(M + 110, y + 4, 8, 6, "F");
    doc.text("NFS passenger services", M + 122, y + 9.5);
    y += 38;
  }

  /* ---------- Airline scorecard ---------- */
  y = ensure(y, 120);
  y = sectionTitle("Airline scorecard", y, "Ranked by on-time departures");
  autoTable(doc, {
    startY: y + 4,
    margin: { left: M, right: M, top: 62, bottom: 56 },
    head: [["Airline", "Flights", "Pax", "D0", "D15", "SLA met", "Boarding", "Issues /100", "Delays NFS / other"]],
    body: rep.airlines.map((a) => [a.name, a.flights, a.pax.toLocaleString("en-US"), `${a.d0}%`, `${a.d15}%`, `${a.sla}%`, `${a.boarding} min`, a.issuesPer100, `${a.nfsDelays} / ${a.otherDelays}`]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, lineColor: LINE, lineWidth: 0.5, textColor: INK },
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: SURFACE },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 120 } },
    didParseCell: (h) => {
      if (h.section === "body" && h.column.index === 3) {
        h.cell.styles.textColor = tone(Number(String(h.cell.raw).replace("%", "")));
        h.cell.styles.fontStyle = "bold";
      }
    },
    didDrawPage: (d) => {
      if (d.pageNumber > 1 && d.cursor && d.cursor.y < 80) pageHeader(true);
    },
  });
  y = lastY() + 26;

  /* ---------- Staffing and attendance ---------- */
  y = ensure(y, 150);
  y = sectionTitle("Staffing and attendance", y, "Rostered trained agents against each airline's SLA, absences and covers between teams");
  const st = rep.staffing;
  const absRows = st.byType.map((b) => [ABSENCE_TYPES[b.type as AbsenceType]?.label ?? b.type, `${b.days} day${b.days === 1 ? "" : "s"}`]);
  autoTable(doc, {
    startY: y + 4,
    margin: { left: M, right: M + CW / 2 + 8, top: 62, bottom: 56 },
    body: [
      ["Operating shifts fully covered", st.shifts ? `${st.shiftsAtSla} of ${st.shifts} (${Math.round((st.shiftsAtSla / st.shifts) * 100)}%)` : "—"],
      ["Critically short shifts", String(st.red)],
      ["Sick call-outs", String(st.callOuts)],
      ["Days lost to sickness or no-show", String(st.sickDays)],
      ["Covers placed between teams", `${st.covers}${st.overrides ? ` (${st.overrides} override)` : ""}`],
    ],
    theme: "plain",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 3.5, textColor: INK },
    columnStyles: { 0: { textColor: MUTED }, 1: { fontStyle: "bold", halign: "right" } },
  });
  const leftEnd = lastY();
  autoTable(doc, {
    startY: y + 4,
    margin: { left: M + CW / 2 + 8, right: M, top: 62, bottom: 56 },
    head: [["Time away", "Days"]],
    body: absRows.length ? absRows : [["No absences recorded", ""]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 3.5, lineColor: LINE, lineWidth: 0.5, textColor: INK },
    headStyles: { fillColor: SURFACE, textColor: INK, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
  });
  y = Math.max(leftEnd, lastY()) + 26;

  /* ---------- Lead performance ---------- */
  if (rep.leads.length) {
    y = ensure(y, 120);
    y = sectionTitle("Lead performance", y, "Flights led in the period; delays split by recorded cause");
    autoTable(doc, {
      startY: y + 4,
      margin: { left: M, right: M, top: 62, bottom: 56 },
      head: [["Lead", "Core", "Flights led", "On time D0", "Team met SLA", "NFS delays", "Other delays"]],
      body: rep.leads.slice(0, 15).map((l) => [`${l.person.firstName} ${l.person.lastName}`, l.person.coreAirline ?? "Float", l.flights, `${Math.round(l.d0)}%`, `${Math.round(l.sla)}%`, l.nfs, l.other]),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, lineColor: LINE, lineWidth: 0.5, textColor: INK },
      headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: SURFACE },
      didDrawPage: (d) => {
        if (d.pageNumber > 1 && d.cursor && d.cursor.y < 80) pageHeader(true);
      },
    });
    y = lastY() + 26;
  }

  /* ---------- Passenger issues and feedback ---------- */
  y = ensure(y, 110);
  y = sectionTitle("Passenger issues and airline feedback", y);
  autoTable(doc, {
    startY: y + 4,
    margin: { left: M, right: M + CW / 2 + 8, top: 62, bottom: 56 },
    head: [["Issue logged at the gate", "Count"]],
    body: rep.discrepancies.length ? rep.discrepancies.map((d) => [d.type, d.n]) : [["None logged", ""]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 3.5, lineColor: LINE, lineWidth: 0.5, textColor: INK },
    headStyles: { fillColor: SURFACE, textColor: INK, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
  });
  const issuesEnd = lastY();
  autoTable(doc, {
    startY: y + 4,
    margin: { left: M + CW / 2 + 8, right: M, top: 62, bottom: 56 },
    head: [["Station manager feedback", ""]],
    body: [["Compliments", rep.feedback.praise], ["Complaints", rep.feedback.complaints], ["Still open", rep.feedback.open]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 3.5, lineColor: LINE, lineWidth: 0.5, textColor: INK },
    headStyles: { fillColor: SURFACE, textColor: INK, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
  });
  y = Math.max(issuesEnd, lastY()) + 24;

  y = ensure(y, 50);
  doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED);
  const notes = doc.splitTextToSize(
    "How to read this report: D0 counts a departure as on time when it pushed back at or before scheduled departure; D15 within 15 minutes. Delays are attributed to the cause recorded by the lead at the gate. 'Team met SLA' compares each flight's logged team with the airline's minimum staffing. SLA minimums are placeholders until confirmed with each airline.",
    CW,
  ) as string[];
  doc.text(notes, M, y);

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE).setLineWidth(0.5).line(M, H - 40, W - M, H - 40);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED);
    doc.text("Confidential · Nassau Flight Services internal · Generated by Gateline", M, H - 26);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 26, { align: "right" });
  }
  doc.save(`NFS-Passenger-Services-Report-${rep.from}-to-${rep.to}.pdf`);
}
