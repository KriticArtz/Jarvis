/**
 * Timezone-aware date helpers built on Intl (no dependencies). All "user day"
 * values are ISO dates (YYYY-MM-DD) in the user's own IANA timezone.
 */

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // ISO 1 = Monday ... 7 = Sunday
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday] ?? 1,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Today's date (YYYY-MM-DD) in the given timezone. */
export function localDate(timeZone: string, now: Date = new Date()): string {
  const p = zonedParts(now, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Current wall-clock minutes since midnight in the given timezone. */
export function localMinutesNow(timeZone: string, now: Date = new Date()): number {
  const p = zonedParts(now, timeZone);
  return p.hour * 60 + p.minute;
}

/** Parse "YYYY-MM-DD" into a UTC-midnight Date for pure calendar math. */
function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return formatISODate(d);
}

/** ISO weekday (1 = Monday ... 7 = Sunday) for a calendar date. */
export function isoWeekday(iso: string): number {
  const day = parseISODate(iso).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  return addDays(iso, 1 - isoWeekday(iso));
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function monthEnd(iso: string): string {
  const d = parseISODate(monthStart(iso));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return formatISODate(d);
}

export function daysBetweenInclusive(start: string, end: string): number {
  return Math.round((parseISODate(end).getTime() - parseISODate(start).getTime()) / 86_400_000) + 1;
}

export function isoDateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "HH:MM" or "HH:MM:SS" -> minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

/** "18:30" -> "6:30 PM" */
export function formatTime12(time: string | null | undefined): string {
  if (!time) return "";
  const mins = timeToMinutes(time);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${suffix}`;
}

export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return "";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/**
 * Convert a wall-clock time on a date in `timeZone` into a UTC Date.
 * Handles DST by iterating on the offset.
 */
export function zonedTimeToUtc(isoDate: string, time: string, timeZone: string): Date {
  const [y, mo, d] = isoDate.split("-").map(Number);
  const mins = timeToMinutes(time);
  const targetAsUtc = Date.UTC(y, mo - 1, d, Math.floor(mins / 60), mins % 60);
  let guess = targetAsUtc;
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const diff = asUtc - targetAsUtc;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

export type DayPart = "morning" | "afternoon" | "evening";

export function dayPart(timeZone: string, now: Date = new Date()): DayPart {
  const h = zonedParts(now, timeZone).hour;
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

/** Human date like "Monday, September 28" for a YYYY-MM-DD value. */
export function formatLongDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(
    parseISODate(iso),
  );
}

export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(parseISODate(iso));
}
