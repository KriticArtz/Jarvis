import { addDays, zonedParts } from "@/lib/time";

/** A stored calendar event row, as read for display/AI (never includes tokens). */
export interface CalendarEventRow {
  id?: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  status: "confirmed" | "tentative" | "cancelled";
  is_busy: boolean;
  color_id?: string | null;
  recurring_event_id?: string | null;
  is_organizer?: boolean;
  attendee_count?: number;
}

export interface LocalCalendarEvent {
  /** Our event id (for the Calendar page and the assistant's calendar tools). */
  id?: string;
  title: string;
  /** Local "HH:MM" on this day; null for all-day events. Clamped to the day for events spanning midnight. */
  start: string | null;
  end: string | null;
  allDay: boolean;
  location: string | null;
  tentative: boolean;
  busy: boolean;
  colorId?: string | null;
  recurring?: boolean;
  editable?: boolean;
  attendeeCount?: number;
  /** Absolute start/end (ISO) of the whole event, for details and editing. */
  startsAt?: string;
  endsAt?: string;
}

export interface CalendarDay {
  date: string;
  events: LocalCalendarEvent[];
}

const pad = (n: number) => String(n).padStart(2, "0");

function local(iso: string, tz: string): { date: string; time: string } {
  const p = zonedParts(new Date(iso), tz);
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

function meta(r: CalendarEventRow): Partial<LocalCalendarEvent> {
  if (!r.id) return {};
  return {
    id: r.id,
    colorId: r.color_id ?? null,
    recurring: Boolean(r.recurring_event_id),
    editable: r.is_organizer ?? true,
    attendeeCount: r.attendee_count ?? 0,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
  };
}

/**
 * Group events into the user's local days `from` .. `from + days - 1`.
 * Cancelled events are dropped. Multi-day events appear on every day they
 * cover; timed events are clamped to each day (00:00 / 24:00).
 */
export function groupByLocalDay(rows: CalendarEventRow[], tz: string, from: string, days: number): CalendarDay[] {
  const out: CalendarDay[] = Array.from({ length: days }, (_, i) => ({ date: addDays(from, i), events: [] }));
  const index = new Map(out.map((d, i) => [d.date, i]));
  const sorted = [...rows].filter((r) => r.status !== "cancelled").sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  for (const r of sorted) {
    if (r.all_day) {
      const first = r.start_date ?? local(r.starts_at, tz).date;
      const lastExclusive = r.end_date ?? addDays(first, 1);
      for (let d = first; d < lastExclusive; d = addDays(d, 1)) {
        const i = index.get(d);
        if (i !== undefined) out[i].events.push({ ...meta(r), title: r.title, start: null, end: null, allDay: true, location: r.location, tentative: r.status === "tentative", busy: r.is_busy });
      }
      continue;
    }
    const s = local(r.starts_at, tz);
    const e = local(r.ends_at, tz);
    for (let d = s.date; d <= e.date; d = addDays(d, 1)) {
      // An event ending exactly at midnight doesn't occupy the next day.
      if (d === e.date && d !== s.date && e.time === "00:00") break;
      const i = index.get(d);
      if (i === undefined) continue;
      out[i].events.push({
        ...meta(r),
        title: r.title,
        start: d === s.date ? s.time : "00:00",
        end: d === e.date ? e.time : "24:00",
        allDay: false,
        location: r.location,
        tentative: r.status === "tentative",
        busy: r.is_busy,
      });
    }
  }
  // All-day items first (as calendars list them), then by start time.
  for (const d of out) d.events.sort((a, b) => Number(b.allDay) - Number(a.allDay) || (a.start ?? "").localeCompare(b.start ?? ""));
  return out;
}

/** Timed, busy events on one day as busy blocks for the planner. */
export function busyEventsForDay(day: CalendarDay | undefined): { title: string; start: string; end: string }[] {
  if (!day) return [];
  return day.events.filter((e) => !e.allDay && e.busy && e.start && e.end).map((e) => ({ title: e.title, start: e.start as string, end: e.end as string }));
}
