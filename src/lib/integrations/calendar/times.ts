import { addDays, timeToMinutes, zonedParts, zonedTimeToUtc } from "@/lib/time";
import type { EventTimes } from "./google";

/**
 * Wall-clock ↔ instant conversions for calendar writes (pure, DST-aware).
 * Timed events are stored/sent as UTC instants computed from the user's local
 * date + time in their IANA time zone, so "3 PM" stays 3 PM on either side of
 * a DST change and durations are real elapsed minutes.
 */

const pad = (n: number) => String(n).padStart(2, "0");

export function localDateTime(iso: string, tz: string): { date: string; time: string } {
  const p = zonedParts(new Date(iso), tz);
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

export function timedTimes(date: string, time: string, durationMinutes: number, tz: string): EventTimes {
  const start = zonedTimeToUtc(date, time, tz);
  return { allDay: false, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + durationMinutes * 60_000).toISOString(), timeZone: tz };
}

export function allDayTimes(startDate: string, days: number, tz: string): EventTimes {
  return { allDay: true, startDate, endDate: addDays(startDate, Math.max(1, days)), timeZone: tz };
}

export interface EventTimesSource {
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  start_date: string | null;
  end_date: string | null;
}

export function durationMinutes(ev: EventTimesSource): number {
  return Math.max(0, Math.round((Date.parse(ev.ends_at) - Date.parse(ev.starts_at)) / 60_000));
}

/**
 * New times for moving an event to `date` (and optionally `time`), keeping its
 * length. Without a time the local start time is kept (so "move my 2 PM to
 * Thursday" stays at 2 PM even across a DST change). All-day events keep
 * their number of days.
 */
export function rescheduleTimes(ev: EventTimesSource, to: { date: string; time: string | null }, tz: string): EventTimes {
  if (ev.all_day) {
    const start = ev.start_date ?? localDateTime(ev.starts_at, tz).date;
    const end = ev.end_date ?? addDays(start, 1);
    const days = Math.max(1, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000));
    return allDayTimes(to.date, days, tz);
  }
  const time = to.time ?? localDateTime(ev.starts_at, tz).time;
  return timedTimes(to.date, time, durationMinutes(ev), tz);
}

const dateFmt = (tz: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz });
const timeFmt = (tz: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });

/** "Wed, Oct 1, 2:00 PM" / "Wed, Oct 1 (all day)" in the user's time zone. */
export function describeTimes(t: EventTimes | EventTimesSource, tz: string): string {
  const allDay = "allDay" in t ? t.allDay : t.all_day;
  if (allDay) {
    const start = "allDay" in t ? (t as Extract<EventTimes, { allDay: true }>).startDate : ((t as EventTimesSource).start_date ?? localDateTime((t as EventTimesSource).starts_at, tz).date);
    const end = "allDay" in t ? (t as Extract<EventTimes, { allDay: true }>).endDate : ((t as EventTimesSource).end_date ?? addDays(start, 1));
    const first = dateFmt("UTC").format(new Date(`${start}T12:00:00Z`));
    const lastDate = addDays(end, -1);
    return lastDate > start ? `${first} – ${dateFmt("UTC").format(new Date(`${lastDate}T12:00:00Z`))} (all day)` : `${first} (all day)`;
  }
  const startIso = "allDay" in t ? (t as Extract<EventTimes, { allDay: false }>).startsAt : (t as EventTimesSource).starts_at;
  const endIso = "allDay" in t ? (t as Extract<EventTimes, { allDay: false }>).endsAt : (t as EventTimesSource).ends_at;
  const s = new Date(startIso);
  const e = new Date(endIso);
  const sameDay = localDateTime(startIso, tz).date === localDateTime(endIso, tz).date;
  return `${dateFmt(tz).format(s)}, ${timeFmt(tz).format(s)}–${sameDay ? timeFmt(tz).format(e) : `${dateFmt(tz).format(e)}, ${timeFmt(tz).format(e)}`}`;
}

/** Validate a local time string "HH:MM" (24h). */
export function isTime(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) && timeToMinutes(v) >= 0;
}
