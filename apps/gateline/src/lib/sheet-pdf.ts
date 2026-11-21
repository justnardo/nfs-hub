"use client";
/**
 * The roster sheet as NFS hands it to agents: one table per block of weeks, each row a line
 * (A, B, C…) with its week of shift times, the agent's name and employee number, and the line
 * they're on each week. Landscape Letter, NFS-branded, with the change-notice line at the foot.
 */
import { formatDate } from "@nfs/db";
import type { SheetBlock } from "@nfs/rules";
import { compactSpan } from "@nfs/rules";

const INK: [number, number, number] = [11, 27, 43];
const MUTED: [number, number, number] = [96, 117, 136];
const BRAND: [number, number, number] = [14, 154, 167];
const BRAND_SOFT: [number, number, number] = [233, 248, 249];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export const sheetName = (first: string, last: string) => `${first[0]}. ${last}`.toUpperCase();
export const empNo = (staffNo: string) => staffNo.replace(/^\D+-?/, "");
export const weekHead = (ws: string) => formatDate(ws, { day: "2-digit", month: "short" }).replace(" ", "-");
export const cellTime = (t: string | null) => (t ? compactSpan(t) : "OFF");

async function loadImage(src: string): Promise<{ data: string; w: number; h: number; type: string } | null> {
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
      i.onerror = () => ok({ w: 0, h: 0 });
      i.src = data;
    });
    if (!dims.w) return null;
    const type = blob.type.includes("png") ? "PNG" : blob.type.includes("webp") ? "WEBP" : "JPEG";
    return { data, ...dims, type };
  } catch {
    return null;
  }
}

export async function downloadRosterSheet(spec: { airlineName: string; sheetLabel: string; airlineLogo?: string | null; blocks: SheetBlock[]; period: string; noticeHours: number; filename: string; generatedBy?: string }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 32;
  const [nfs, logo] = await Promise.all([loadImage("/brand/nfs-logo.png"), spec.airlineLogo ? loadImage(spec.airlineLogo) : Promise.resolve(null)]);

  const header = () => {
    let x = M;
    if (nfs) {
      const h = 30;
      doc.addImage(nfs.data, "PNG", x, 22, (nfs.w / nfs.h) * h, h);
      x += (nfs.w / nfs.h) * h + 14;
    }
    doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(...INK);
    doc.text(`${spec.airlineName.toUpperCase()} · PASSENGER SERVICES ROSTER`, x, 36);
    doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(...MUTED);
    doc.text(spec.period, x, 50);
    if (logo) {
      const ar = logo.w / logo.h;
      const w = Math.min(110, ar * 28);
      doc.addImage(logo.data, logo.type, W - M - w, 22, w, w / ar);
    }
    doc.setDrawColor(...BRAND).setLineWidth(1.2).line(M, 60, W - M, 60);
  };
  header();

  let y = 74;
  spec.blocks.forEach((b) => {
    const head = [["", ...DAYS, spec.sheetLabel, "EMP#", ...b.weekStarts.map(weekHead)]];
    const body = b.rows.map((r) => [r.label, ...r.days.map(cellTime), sheetName(r.person.firstName, r.person.lastName), empNo(r.person.staffNo), ...r.weeks]);
    autoTable(doc, {
      startY: y,
      head,
      body,
      margin: { left: M, right: M, top: 74 },
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: { top: 4, bottom: 4, left: 4, right: 4 }, lineColor: [205, 214, 222], lineWidth: 0.6, textColor: INK, halign: "center", valign: "middle" },
      headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 22 }, 8: { halign: "left", fontStyle: "bold", cellWidth: 108 }, 9: { cellWidth: 40 } },
      didParseCell: (d) => {
        if (d.section !== "body") return;
        const c = d.column.index;
        if (c >= 1 && c <= 7 && d.cell.raw === "OFF") {
          d.cell.styles.textColor = MUTED;
          d.cell.styles.fillColor = [246, 248, 250];
        }
        if (c >= 10) d.cell.styles.fillColor = BRAND_SOFT;
      },
      didDrawPage: () => header(),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 18;
    if (y > H - 90) {
      doc.addPage();
      y = 74;
    }
  });

  // The notice line agents know from the paper roster
  const note = `NOTE: ROSTERED SHIFTS SUBJECT TO CHANGE WITH A MINIMUM ${spec.noticeHours} HOURS NOTICE BY VERBAL OR WRITTEN COMMUNICATION`;
  doc.setFillColor(255, 236, 153).rect(M, y, W - M * 2, 20, "F");
  doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(185, 28, 28);
  doc.text(note, M + 8, y + 13.5);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED);
    doc.text(`Nassau Flight Services · issued from Gateline${spec.generatedBy ? ` by ${spec.generatedBy}` : ""} · ${formatDate(new Date().toISOString().slice(0, 10), { day: "numeric", month: "short", year: "numeric" })}`, M, H - 18);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 18, { align: "right" });
  }
  doc.save(spec.filename);
}

/**
 * The same sheet as an Excel file, in the layout the import reads back: edit it in Excel and
 * import it again to change the lines.
 */
export async function downloadRosterSheetXlsx(spec: { airlineName: string; sheetLabel: string; blocks: SheetBlock[]; noticeHours: number; filename: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import("exceljs/dist/exceljs.min.js");
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gateline · Nassau Flight Services";
  const ws = wb.addWorksheet(spec.airlineName.slice(0, 31));
  const DAYS_ = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const bold = { bold: true };
  const head = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E9AA7" } };
  const border = { top: { style: "thin", color: { argb: "FFCDD6DE" } }, left: { style: "thin", color: { argb: "FFCDD6DE" } }, bottom: { style: "thin", color: { argb: "FFCDD6DE" } }, right: { style: "thin", color: { argb: "FFCDD6DE" } } };
  ws.getCell(1, 1).value = spec.airlineName.toUpperCase();
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  let r = 3;
  spec.blocks.forEach((b) => {
    const header = ["", ...DAYS_, spec.sheetLabel, "EMP#", ...b.weekStarts.map(weekHead)];
    header.forEach((h, i) => {
      const c = ws.getCell(r, i + 1);
      c.value = h;
      c.font = { ...bold, color: { argb: "FFFFFFFF" } };
      c.fill = head;
      c.border = border;
      c.alignment = { horizontal: "center" };
    });
    r++;
    for (const row of b.rows) {
      const vals = [row.label, ...row.days.map(cellTime), sheetName(row.person.firstName, row.person.lastName), Number(empNo(row.person.staffNo)) || empNo(row.person.staffNo), ...row.weeks];
      vals.forEach((v, i) => {
        const c = ws.getCell(r, i + 1);
        c.value = v;
        c.border = border;
        c.alignment = { horizontal: i === 8 ? "left" : "center" };
        if (i === 0 || i === 8) c.font = bold;
        if (v === "OFF") c.font = { color: { argb: "FF7B93A8" } };
      });
      r++;
    }
    r += 2;
  });
  const note = ws.getCell(r, 1);
  note.value = `NOTE: ROSTERED SHIFTS SUBJECT TO CHANGE WITH A MINIMUM ${spec.noticeHours} HOURS NOTICE BY VERBAL OR WRITTEN COMMUNICATION`;
  note.font = { bold: true, color: { argb: "FFB91C1C" } };
  note.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEC99" } };
  ws.columns = [{ width: 5 }, ...DAYS_.map(() => ({ width: 12 })), { width: 22 }, { width: 8 }, ...Array.from({ length: 6 }, () => ({ width: 9 }))];
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = spec.filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
