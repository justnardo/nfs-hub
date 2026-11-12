"use client";
/**
 * Branded roster PDF (landscape Letter): NFS logo, one table per team per week,
 * coverage vs SLA rows for airline teams, shift legend, page numbers. Drafts carry a DRAFT watermark.
 */
import type { ShiftCode } from "@nfs/db";

export interface PdfRow {
  staffNo: string;
  name: string;
  role: string;
  shifts: (ShiftCode | undefined)[];
  highlight?: boolean;
}
export interface PdfWeek {
  start: string;
  days: string[];
  rows: PdfRow[];
  coverage?: { label: string; values: string[]; short: boolean[] }[];
}
export interface PdfSection {
  team: string;
  weeks: PdfWeek[];
}
export interface RosterPdf {
  title: string;
  subtitle: string;
  status: "draft" | "published" | "live";
  meta: string[];
  sections: PdfSection[];
  filename: string;
}

const COLOR: Record<string, { fill: [number, number, number]; text: [number, number, number] }> = {
  E: { fill: [201, 238, 241], text: [11, 82, 90] },
  M: { fill: [233, 248, 249], text: [10, 102, 112] },
  L: { fill: [18, 40, 61], text: [255, 255, 255] },
  O: { fill: [255, 255, 255], text: [169, 188, 203] },
  V: { fill: [253, 241, 214], text: [154, 106, 12] },
};
const LABEL: Record<string, string> = { E: "E", M: "M", L: "L", O: "off", V: "VAC" };
const INK: [number, number, number] = [11, 27, 43];
const MUTED: [number, number, number] = [96, 117, 136];
const BRAND: [number, number, number] = [14, 154, 167];

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

const day = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", o);

export async function downloadRosterPdf(spec: RosterPdf) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const logo = await loadImage("/brand/nfs-logo.png");

  const header = () => {
    let x = M;
    if (logo) {
      const h = 30;
      const w = (logo.w / logo.h) * h;
      doc.addImage(logo.data, "PNG", M, 24, w, h);
      x = M + w + 14;
    }
    doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(...INK).text(spec.title, x, 38);
    doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(...MUTED).text(spec.subtitle, x, 52);
    const badge = spec.status === "draft" ? "DRAFT — NOT PUBLISHED" : spec.status === "published" ? "PUBLISHED" : "LIVE ROSTER";
    doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...(spec.status === "draft" ? ([180, 83, 9] as [number, number, number]) : BRAND));
    doc.text(badge, W - M, 34, { align: "right" });
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
    spec.meta.forEach((m, i) => doc.text(m, W - M, 46 + i * 10, { align: "right" }));
    doc.setDrawColor(...BRAND).setLineWidth(1.2).line(M, 64, W - M, 64);
  };

  const watermark = () => {
    if (spec.status !== "draft") return;
    const g = doc as unknown as { saveGraphicsState: () => void; restoreGraphicsState: () => void; setGState: (s: unknown) => void; GState: new (o: { opacity: number }) => unknown };
    g.saveGraphicsState();
    g.setGState(new g.GState({ opacity: 0.07 }));
    doc.setFont("helvetica", "bold").setFontSize(120).setTextColor(180, 83, 9).text("DRAFT", W / 2, H / 2 + 40, { align: "center", angle: 20 });
    g.restoreGraphicsState();
  };

  header();
  watermark();
  let y = 80;
  let firstTable = true;

  for (const sec of spec.sections) {
    for (const wk of sec.weeks) {
      const needed = 60 + (wk.rows.length + (wk.coverage?.length ?? 0)) * 16;
      if (!firstTable && y + Math.min(needed, 200) > H - 50) {
        doc.addPage();
        header();
        watermark();
        y = 80;
      }
      firstTable = false;
      doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...INK).text(sec.team, M, y);
      const wTxt = `Week of ${day(wk.start, { day: "numeric", month: "long", year: "numeric" })}`;
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED).text(wTxt, M + doc.getTextWidth(sec.team) * (11 / 9) + 10, y);
      const head = [["Staff no", "Name", "Role", ...wk.days.map((d) => day(d, { weekday: "short", day: "numeric" })), "Hrs"]];
      const body: string[][] = wk.rows.map((r) => [
        r.staffNo,
        r.name,
        r.role,
        ...r.shifts.map((s) => LABEL[s ?? ""] ?? "—"),
        String(r.shifts.filter((s) => s === "E" || s === "M" || s === "L").length * 8),
      ]);
      const covStart = body.length;
      for (const c of wk.coverage ?? []) body.push(["", c.label, "", ...c.values, ""]);
      autoTable(doc, {
        head,
        body,
        startY: y + 8,
        margin: { left: M, right: M, top: 80, bottom: 40 },
        theme: "grid",
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 3.5, lineColor: [226, 232, 238], lineWidth: 0.5, textColor: INK, valign: "middle" },
        headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: "bold", halign: "center" },
        columnStyles: { 0: { cellWidth: 56, textColor: MUTED }, 1: { cellWidth: 140, fontStyle: "bold" }, 2: { cellWidth: 56, textColor: MUTED } },
        didParseCell: (h) => {
          if (h.section !== "body") return;
          const ri = h.row.index;
          const ci = h.column.index;
          const isShift = ci >= 3 && ci < 3 + wk.days.length;
          if (ri >= covStart) {
            h.cell.styles.fillColor = [244, 247, 250];
            h.cell.styles.fontSize = 7.5;
            h.cell.styles.textColor = MUTED;
            if (isShift) {
              h.cell.styles.halign = "center";
              const c = wk.coverage![ri - covStart];
              if (c.short[ci - 3]) {
                h.cell.styles.textColor = [185, 28, 28];
                h.cell.styles.fontStyle = "bold";
              }
            }
            return;
          }
          const row = wk.rows[ri];
          if (isShift) {
            const s = row.shifts[ci - 3] ?? "";
            const c = COLOR[s];
            h.cell.styles.halign = "center";
            h.cell.styles.fontStyle = "bold";
            if (c) {
              h.cell.styles.fillColor = c.fill;
              h.cell.styles.textColor = c.text;
            }
          } else if (ci === 3 + wk.days.length) {
            h.cell.styles.halign = "center";
            h.cell.styles.textColor = MUTED;
          }
          if (row.highlight && !isShift) h.cell.styles.fillColor = [253, 241, 214];
        },
        // Pages autoTable adds when a table runs over get the same header.
        didDrawPage: (d) => {
          if (d.pageNumber > 1) {
            header();
            watermark();
          }
        },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 28;
    }
  }

  // Legend + footer on every page
  const pages = doc.getNumberOfPages();
  const generated = new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Nassau" });
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED);
    doc.text("E Early 04:00–12:30   ·   M Mid 08:00–16:30   ·   L Late 12:00–20:30   ·   off Day off   ·   VAC Vacation   ·   Paid 8 h per shift", M, H - 30);
    doc.text(`Gateline · Nassau Flight Services · generated ${generated} (Nassau)`, M, H - 18);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 18, { align: "right" });
  }
  doc.save(spec.filename);
}
