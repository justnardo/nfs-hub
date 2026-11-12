/** Calendar file (.ics) for one person's shifts. Times are Nassau local, written as UTC. */
import type { ShiftCode } from "@nfs/db";

const TIMES: Record<string, [string, string, string]> = { E: ["04:00", "12:30", "Early"], M: ["08:00", "16:30", "Mid"], L: ["12:00", "20:30", "Late"] };

function nassauOffsetMin(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Nassau", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((local - at.getTime()) / 60000);
}

function utcStamp(date: string, hhmm: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const utc = new Date(guess - nassauOffsetMin(new Date(guess)) * 60000);
  return utc.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function shiftsIcs(name: string, team: string, shifts: { date: string; shift: ShiftCode | undefined }[]): string {
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const events = shifts
    .filter((s) => s.shift && TIMES[s.shift])
    .map((s) => {
      const [start, end, label] = TIMES[s.shift!];
      return [
        "BEGIN:VEVENT",
        `UID:gateline-${s.date}-${name.replace(/\W/g, "")}@nfs`,
        `DTSTAMP:${now}`,
        `DTSTART:${utcStamp(s.date, start)}`,
        `DTEND:${utcStamp(s.date, end)}`,
        `SUMMARY:NFS ${label} shift · ${team}`,
        `DESCRIPTION:${label} ${start}–${end} (Nassau). From your published Gateline roster.`,
        "LOCATION:Lynden Pindling International Airport",
        "END:VEVENT",
      ].join("\r\n");
    });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nassau Flight Services//Gateline//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", ...events, "END:VCALENDAR"].join("\r\n");
}

export function downloadText(text: string, filename: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
