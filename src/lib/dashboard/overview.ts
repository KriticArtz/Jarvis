import { addDays, isoWeekday, timeToMinutes } from "@/lib/time";

/**
 * Pure helpers for Today's overview panels (unit-tested). Every figure is
 * counted from the user's own tasks, calendar and routines; nothing is
 * estimated or invented. Empty input gives empty output.
 */

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface WeekDay {
  date: string;
  /** "Mon" … "Sun" */
  label: string;
  /** Tasks planned for the day (skipped ones don't count). */
  planned: number;
  done: number;
  isToday: boolean;
  isFuture: boolean;
}

/** Monday→Sunday of the week starting `monday`: what was planned and what got done each day. */
export function weekRhythm(tasks: { task_date: string; status: string }[], monday: string, today: string): WeekDay[] {
  return WEEKDAY.map((label, i) => {
    const date = addDays(monday, i);
    const own = tasks.filter((t) => t.task_date === date && t.status !== "skipped");
    return { date, label, planned: own.length, done: own.filter((t) => t.status === "done").length, isToday: date === today, isFuture: date > today };
  });
}

/** Totals for the week so far (today included, later days excluded). */
export function weekSoFar(days: WeekDay[]): { planned: number; done: number } {
  return days.filter((d) => !d.isFuture).reduce((a, d) => ({ planned: a.planned + d.planned, done: a.done + d.done }), { planned: 0, done: 0 });
}

export interface ComingItem {
  key: string;
  kind: "event" | "task" | "routine";
  date: string;
  /** "HH:MM", or null for all-day */
  start: string | null;
  title: string;
}

/**
 * The next few fixed things after today: calendar events, scheduled tasks and
 * the user's recurring routines, in time order, for the `days` days after
 * `today`. Untimed tasks are left out — they aren't commitments yet.
 */
export function comingUp(input: {
  today: string;
  days: number;
  events: { id?: string; date: string; title: string; start: string | null; allDay: boolean }[];
  tasks: { id: string; task_date: string; title: string; scheduled_start: string | null; status: string }[];
  routines: { id: string; title: string; days_of_week: number[]; start_time: string }[];
  limit: number;
}): ComingItem[] {
  const out: ComingItem[] = [];
  for (let i = 1; i <= input.days; i++) {
    const date = addDays(input.today, i);
    for (const e of input.events) {
      if (e.date !== date) continue;
      out.push({ key: `e:${e.id ?? `${e.title}-${date}-${e.start}`}`, kind: "event", date, start: e.allDay ? null : e.start, title: e.title });
    }
    for (const t of input.tasks) {
      if (t.task_date !== date || !t.scheduled_start || t.status !== "pending") continue;
      out.push({ key: `t:${t.id}`, kind: "task", date, start: t.scheduled_start.slice(0, 5), title: t.title });
    }
    const wd = isoWeekday(date);
    for (const r of input.routines) {
      if (!r.days_of_week.includes(wd)) continue;
      out.push({ key: `r:${r.id}:${date}`, kind: "routine", date, start: r.start_time.slice(0, 5), title: r.title });
    }
  }
  const at = (x: ComingItem) => (x.start ? timeToMinutes(x.start) : -1);
  return out.sort((a, b) => a.date.localeCompare(b.date) || at(a) - at(b)).slice(0, input.limit);
}

/**
 * The waking day to draw Today's time graphic across, in minutes: wake to
 * sleep from the profile, widened to fit anything planned outside it.
 * Falls back to 7 AM–11 PM when waking hours aren't set.
 */
export function dayWindow(input: { wake: string | null; sleep: string | null; entries: { start: string; end: string | null }[] }): { start: number; end: number } {
  let start = input.wake ? timeToMinutes(input.wake) : 7 * 60;
  let end = input.sleep ? timeToMinutes(input.sleep) : 23 * 60;
  if (end <= start) end = Math.min(24 * 60, start + 16 * 60); // sleep after midnight
  for (const e of input.entries) {
    const s = timeToMinutes(e.start);
    const f = e.end ? timeToMinutes(e.end) : s + 30;
    start = Math.min(start, Math.floor(s / 60) * 60);
    end = Math.max(end, Math.ceil(f / 60) * 60);
  }
  return { start, end: Math.min(end, 24 * 60) };
}
