import { addDays, daysBetweenInclusive, monthEnd, monthStart, timeToMinutes, weekStart } from "@/lib/time";
import type { LocalCalendarEvent } from "./local";

/**
 * Pure helpers for the Calendar page: which dates a view shows, navigation,
 * titles, and side-by-side layout of overlapping events. All dates are the
 * user's local calendar dates (YYYY-MM-DD); weeks start on Monday, like the
 * rest of the app.
 */

export type CalendarView = "day" | "week" | "month";
export const CALENDAR_VIEWS: CalendarView[] = ["day", "week", "month"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(v: unknown): v is string {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** View and anchor date from the URL, falling back to week / today. Far-off dates are clamped. */
export function parseCalendarParams(params: { view?: unknown; date?: unknown }, today: string): { view: CalendarView; date: string } {
  const view = CALENDAR_VIEWS.includes(params.view as CalendarView) ? (params.view as CalendarView) : "week";
  let date = isCalendarDate(params.date) ? params.date : today;
  // Keep navigation within ±5 years of today.
  if (date < addDays(today, -1826) || date > addDays(today, 1826)) date = today;
  return { view, date };
}

/** First date and number of days a view displays. Month = whole weeks covering the month. */
export function viewRange(view: CalendarView, date: string): { from: string; days: number } {
  if (view === "day") return { from: date, days: 1 };
  if (view === "week") return { from: weekStart(date), days: 7 };
  const from = weekStart(monthStart(date));
  const last = monthEnd(date);
  const days = Math.ceil(daysBetweenInclusive(from, last) / 7) * 7;
  return { from, days };
}

function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, lastDay));
  return first.toISOString().slice(0, 10);
}

/** The anchor date one step before/after in this view. */
export function shiftDate(view: CalendarView, date: string, dir: -1 | 1): string {
  if (view === "day") return addDays(date, dir);
  if (view === "week") return addDays(date, 7 * dir);
  return addMonths(date, dir);
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" });
const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Heading for the visible period, e.g. "Wednesday, September 30", "Sep 28 – Oct 4, 2026", "September 2026". */
export function viewTitle(view: CalendarView, date: string): string {
  if (view === "day") return fmt({ weekday: "long", month: "long", day: "numeric" }).format(asDate(date));
  if (view === "month") return fmt({ month: "long", year: "numeric" }).format(asDate(date));
  const from = weekStart(date);
  const to = addDays(from, 6);
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const start = fmt({ month: "short", day: "numeric" }).format(asDate(from));
  const end = sameMonth ? fmt({ day: "numeric" }).format(asDate(to)) : fmt({ month: "short", day: "numeric" }).format(asDate(to));
  return `${start} – ${end}, ${to.slice(0, 4)}`;
}

export function calendarHref(view: CalendarView, date: string): string {
  return `/calendar?view=${view}&date=${date}`;
}

export interface PositionedEvent {
  event: LocalCalendarEvent;
  /** Minutes from local midnight. */
  top: number;
  height: number;
  /** Column within its overlap group, and how many columns the group has. */
  column: number;
  columns: number;
}

/**
 * Lay out a day's timed events in a time grid: overlapping events share the
 * width side by side. Very short events get a minimum height so they stay
 * tappable.
 */
export function layoutTimedEvents(events: LocalCalendarEvent[], minHeight = 20): PositionedEvent[] {
  const timed = events
    .filter((e) => !e.allDay && e.start && e.end)
    .map((e) => {
      const start = timeToMinutes(e.start!);
      const end = e.end === "24:00" ? 1440 : timeToMinutes(e.end!);
      return { event: e, start, end: Math.max(end, start + 1) };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const out: PositionedEvent[] = [];
  let group: { item: (typeof timed)[number]; column: number }[] = [];
  let groupEnd = -1;
  const flush = () => {
    const columns = Math.max(1, ...group.map((g) => g.column + 1));
    for (const g of group) {
      out.push({ event: g.item.event, top: g.item.start, height: Math.max(minHeight, g.item.end - g.item.start), column: g.column, columns });
    }
    group = [];
  };
  for (const item of timed) {
    if (group.length && item.start >= groupEnd) flush();
    // First column whose last event has ended.
    const used = new Map<number, number>();
    for (const g of group) used.set(g.column, Math.max(used.get(g.column) ?? 0, g.item.end));
    let column = 0;
    while (used.has(column) && used.get(column)! > item.start) column++;
    group.push({ item, column });
    groupEnd = Math.max(groupEnd, item.end);
  }
  if (group.length) flush();
  return out;
}

/** Google Calendar's event palette ("1".."11"); null = the app accent. */
export const GOOGLE_EVENT_COLORS: Record<string, { name: string; hex: string }> = {
  "1": { name: "Lavender", hex: "#7986cb" },
  "2": { name: "Sage", hex: "#33b679" },
  "3": { name: "Grape", hex: "#8e24aa" },
  "4": { name: "Flamingo", hex: "#e67c73" },
  "5": { name: "Banana", hex: "#f6bf26" },
  "6": { name: "Tangerine", hex: "#f4511e" },
  "7": { name: "Peacock", hex: "#039be5" },
  "8": { name: "Graphite", hex: "#616161" },
  "9": { name: "Blueberry", hex: "#3f51b5" },
  "10": { name: "Basil", hex: "#0b8043" },
  "11": { name: "Tomato", hex: "#d50000" },
};

export function eventColor(colorId: string | null | undefined): string | null {
  return colorId && GOOGLE_EVENT_COLORS[colorId] ? GOOGLE_EVENT_COLORS[colorId].hex : null;
}
