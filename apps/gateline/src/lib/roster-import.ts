/**
 * Read a roster spreadsheet laid out the way NFS issues rosters (see the Breeze and Southwest sheets):
 *
 *        SUN        MON        …  SAT        BREEZE        EMP#  01-Nov  08-Nov …
 *   A    0700-1500  0600-1400  …  OFF        S. NEWBOLD    1213  A       A
 *
 * Blocks follow one another down the sheet, separated by blank rows. Later blocks may repeat only the
 * right-hand headings (name / EMP# / weeks) and reuse the day columns above. Each block is a section
 * (agents, a supervisor, the leads) or a set of weeks in which a line had a different pattern.
 */
import { addDays, weekStart, type Airline, type LineGroup, type Person, type RosterLine } from "@nfs/db";
import { normaliseSpan } from "@nfs/rules";

export type Cell = string | number | Date | null | undefined;

export interface ImportedRow {
  label: string;
  days: (string | null)[];
  name: string;
  emp: string;
  /** Line letter for each of the block's weeks. */
  weeks: string[];
}
export interface ImportedBlock {
  weekStarts: string[];
  rows: ImportedRow[];
}
export interface ImportedSheet {
  sheet: string;
  title: string;
  nameHeader: string;
  blocks: ImportedBlock[];
  warnings: string[];
}

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const txt = (c: Cell) => (c instanceof Date ? c.toISOString().slice(0, 10) : c == null ? "" : String(c)).trim();
const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

/** A week heading: a real date, an Excel date number, or text like "01-Nov" (year taken as the one nearest today). */
export function parseWeek(c: Cell, today: string): string | null {
  if (c instanceof Date && !isNaN(c.getTime())) return weekStart(iso(c));
  if (typeof c === "number" && c > 30000 && c < 80000) return weekStart(iso(new Date(Date.UTC(1899, 11, 30) + c * 86400000)));
  const s = txt(c).toUpperCase();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return weekStart(`${m[1]}-${m[2]}-${m[3]}`);
  m = /^(\d{1,2})[-\s/]?([A-Z]{3})[A-Z]*(?:[-\s/]?(\d{2,4}))?$/.exec(s);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[2]);
  if (mon < 0) return null;
  const dd = Number(m[1]);
  const pick = (y: number) => `${y}-${String(mon + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  if (m[3]) return weekStart(pick(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])));
  const y = Number(today.slice(0, 4));
  const near = [y - 1, y, y + 1].map(pick).sort((a, b) => Math.abs(Date.parse(a) - Date.parse(today)) - Math.abs(Date.parse(b) - Date.parse(today)))[0];
  return weekStart(near);
}

/** A day cell: "0700-1500", "07:00-15:00", "OFF" or blank. */
export function parseDay(c: Cell): { time: string | null; ok: boolean } {
  const s = txt(c).toUpperCase();
  if (!s || s === "OFF" || s === "O" || s === "-" || s === "X") return { time: null, ok: true };
  const t = normaliseSpan(s.replace(/\s+/g, ""));
  return t ? { time: t, ok: true } : { time: null, ok: false };
}

/** Turn one sheet's grid of cells into blocks of lines. */
export function parseRosterGrid(grid: Cell[][], sheet: string, today: string): ImportedSheet {
  const warnings: string[] = [];
  const rowText = (r: number) => (grid[r] ?? []).map(txt);
  // The day columns: the first row reading SUN…SAT left to right
  let dayCol = -1;
  for (let r = 0; r < grid.length && dayCol < 0; r++) {
    const t = rowText(r).map((x) => x.toUpperCase());
    for (let c = 0; c + 6 < t.length; c++) if (DAYS.every((d, i) => t[c + i].startsWith(d))) { dayCol = c; break; }
  }
  const title = grid.flatMap((row) => row.map(txt)).find((x) => x && !DAYS.includes(x.toUpperCase())) ?? sheet;
  if (dayCol < 0) return { sheet, title, nameHeader: "", blocks: [], warnings: ["Couldn't find the SUN … SAT headings on this sheet."] };

  const blocks: ImportedBlock[] = [];
  let nameHeader = "";
  for (let r = 0; r < grid.length; r++) {
    const t = rowText(r);
    const empCol = t.findIndex((x, i) => i > dayCol + 6 && /^EMP/i.test(x));
    if (empCol < 0) continue;
    const nameCol = empCol - 1;
    if (!nameHeader && t[nameCol]) nameHeader = t[nameCol];
    const weekCols: { c: number; ws: string }[] = [];
    for (let c = empCol + 1; c < (grid[r] ?? []).length; c++) {
      const ws = parseWeek(grid[r][c], today);
      if (ws) weekCols.push({ c, ws });
    }
    const rows: ImportedRow[] = [];
    for (let rr = r + 1; rr < grid.length; rr++) {
      const tt = rowText(rr);
      const label = (tt[dayCol - 1] ?? "").toUpperCase();
      const name = tt[nameCol] ?? "";
      if (tt.some((x, i) => i > dayCol + 6 && /^EMP/i.test(x))) break; // next block's headings
      if (!/^[A-Z]$/.test(label) || !name) {
        if (rows.length) break; // blank row ends the block
        continue;
      }
      const days = DAYS.map((d, i) => {
        const p = parseDay(grid[rr][dayCol + i]);
        if (!p.ok) warnings.push(`Row ${rr + 1}, ${d}: "${tt[dayCol + i]}" isn't a time like 0700-1500, read as OFF.`);
        return p.time;
      });
      rows.push({ label, days, name, emp: (tt[empCol] ?? "").replace(/\D/g, ""), weeks: weekCols.map(({ c }) => (tt[c] ?? "").toUpperCase() || label) });
    }
    if (rows.length) blocks.push({ weekStarts: weekCols.map((w) => w.ws), rows });
  }
  if (!blocks.length) warnings.push("No lines found under the EMP# headings.");
  return { sheet, title, nameHeader, blocks, warnings };
}

/* ---------------- Matching and building lines ---------------- */

const digits = (s: string) => s.replace(/\D/g, "").replace(/^0+/, "");
/** Match a sheet row to a person: employee number first, then "S. NEWBOLD"-style initial and surname. */
export function matchPerson(row: Pick<ImportedRow, "name" | "emp">, people: Person[]): Person | undefined {
  if (row.emp) {
    const byEmp = people.filter((p) => digits(p.staffNo) === digits(row.emp));
    if (byEmp.length === 1) return byEmp[0];
  }
  const m = /^([A-Z])\.?\s*(.+)$/i.exec(row.name.trim());
  if (!m) return undefined;
  const surname = m[2].trim().toLowerCase();
  const hits = people.filter((p) => p.firstName[0].toLowerCase() === m[1].toLowerCase() && p.lastName.toLowerCase() === surname);
  return hits.length === 1 ? hits[0] : undefined;
}

/** Which airline a sheet is for, from its title or the heading over the names ("BREEZE", "WN PSA"). */
export function guessAirline(s: Pick<ImportedSheet, "title" | "nameHeader" | "sheet">, airlines: Airline[]): Airline | undefined {
  const hay = `${s.title} ${s.nameHeader} ${s.sheet}`.toUpperCase();
  return airlines.find((a) => hay.includes(a.name.split(" ")[0].toUpperCase())) ?? airlines.find((a) => new RegExp(`\\b${a.code}\\b`).test(hay));
}

/** Best guess at a block's section from who's in it. */
export function guessGroup(rows: ImportedRow[], match: (r: ImportedRow) => Person | undefined): LineGroup | undefined {
  const roles = rows.map(match).filter(Boolean).map((p) => p!.role);
  const share = (r: string) => roles.filter((x) => x === r).length / (roles.length || 1);
  if (share("supervisor") > 0.5) return "supervisor";
  if (share("lead") > 0.5) return "lead";
  return undefined;
}

/** Lines, standing lines and week-by-week moves for an airline, from the imported blocks. */
export function linesFromImport(blocks: ImportedBlock[], groups: (LineGroup | undefined)[], personFor: (b: number, r: number) => string | undefined) {
  const allWeeks = [...new Set(blocks.flatMap((b) => b.weekStarts))].sort();
  const first = allWeeks[0];
  const last = allWeeks[allWeeks.length - 1];
  const lines: RosterLine[] = [];
  const seen = new Set<string>();
  const renamed: string[] = [];
  // Same section, same letter, overlapping weeks but a different week of times: give it the next free letter
  const clash = (g: LineGroup | undefined, label: string, from: string | undefined, to: string | undefined, days: (string | null)[]) =>
    lines.some((l) => (l.group ?? undefined) === g && l.label === label && (l.from ?? "") <= (to ?? "9999") && (from ?? "") <= (l.to ?? "9999") && l.days.join(",") !== days.join(","));
  const perPerson = new Map<string, Map<string, string>>();
  // Letters the sheet defines, per section; a week letter with no row of its own keeps the row's line
  const defined = new Map<string, Set<string>>();
  blocks.forEach((b, bi) => b.rows.forEach((r) => defined.set(groups[bi] ?? "", (defined.get(groups[bi] ?? "") ?? new Set()).add(r.label))));
  blocks.forEach((b, bi) => {
    const g = groups[bi];
    const from = b.weekStarts.length && b.weekStarts[0] !== first ? b.weekStarts[0] : undefined;
    const to = b.weekStarts.length && b.weekStarts[b.weekStarts.length - 1] !== last ? addDays(b.weekStarts[b.weekStarts.length - 1], 6) : undefined;
    b.rows.forEach((row, ri) => {
      let label = row.label;
      if (clash(g, label, from, to, row.days)) {
        const used = new Set(lines.filter((l) => (l.group ?? undefined) === g).map((l) => l.label));
        let n = 0;
        while (used.has(String.fromCharCode(65 + n))) n++;
        label = String.fromCharCode(65 + n);
        renamed.push(`${row.name}: line ${row.label} had different times from another line ${row.label}, so it's imported as line ${label}.`);
        row = { ...row, label, weeks: row.weeks.map((w) => (w === row.label ? label : w)) };
      }
      const k = `${g ?? ""}|${label}|${from ?? ""}|${to ?? ""}|${row.days.join(",")}`;
      if (!seen.has(k)) {
        seen.add(k);
        lines.push({ label, days: row.days, ...(g ? { group: g } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) });
      }
      const pid = personFor(bi, ri);
      if (!pid) return;
      const m = perPerson.get(pid) ?? new Map<string, string>();
      b.weekStarts.forEach((ws, wi) => {
        const w = row.weeks[wi] || label;
        const ok = defined.get(g ?? "")?.has(w) || w === label;
        if (!ok) renamed.push(`${row.name}, week of ${ws}: line ${w} isn't on the sheet, so they stay on line ${label} that week.`);
        m.set(ws, ok ? w : label);
      });
      perPerson.set(pid, m);
    });
  });
  const lineAssign: Record<string, string> = {};
  const lineWeeks: Record<string, Record<string, string>> = {};
  for (const [pid, m] of perPerson) {
    // Standing line: the one they're on most often; other weeks are recorded as moves
    const count = new Map<string, number>();
    for (const l of m.values()) count.set(l, (count.get(l) ?? 0) + 1);
    const standing = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
    lineAssign[pid] = standing;
    for (const [ws, l] of m) if (l !== standing) (lineWeeks[ws] ??= {})[pid] = l;
  }
  lines.sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.label.localeCompare(b.label) || (a.from ?? "").localeCompare(b.from ?? ""));
  return { lines, lineAssign, lineWeeks, weeks: allWeeks, renamed };
}

/** Read every sheet of an .xlsx (or a .csv) in the browser. */
export async function readRosterFile(file: File, today: string): Promise<ImportedSheet[]> {
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text();
    const grid = text.split(/\r?\n/).map((line) => parseCsvLine(line));
    return [parseRosterGrid(grid, file.name.replace(/\.csv$/i, ""), today)];
  }
  if (/\.xls$/i.test(file.name)) throw new Error("This is an older .xls file. Open it in Excel and save it as .xlsx, then import that.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import("exceljs/dist/exceljs.min.js");
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const out: ImportedSheet[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wb.eachSheet((ws: any) => {
    const grid: Cell[][] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ws.eachRow({ includeEmpty: true }, (row: any, r: number) => {
      const cells: Cell[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      row.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
        const v = cell.value;
        cells[c - 1] = v instanceof Date ? v : typeof v === "number" ? (cell.numFmt && /[dmy]/i.test(cell.numFmt) ? new Date(Date.UTC(1899, 11, 30) + v * 86400000) : v) : v && typeof v === "object" ? (v.result ?? v.text ?? (v.richText ? v.richText.map((t: { text: string }) => t.text).join("") : cell.text)) : v;
      });
      grid[r - 1] = cells;
    });
    for (let i = 0; i < grid.length; i++) grid[i] ??= [];
    const parsed = parseRosterGrid(grid, ws.name, today);
    if (parsed.blocks.length || out.length === 0) out.push(parsed);
  });
  return out.filter((s) => s.blocks.length).length ? out.filter((s) => s.blocks.length) : out;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
