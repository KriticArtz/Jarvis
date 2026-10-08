import { addDays } from "@/lib/time";
import { localDateTime, type EventTimesSource } from "@/lib/integrations/calendar/times";
import type { EventTimes } from "@/lib/integrations/calendar/google";
import { sanitizeCard, type ActionCard, type EventCard, type GoalCard, type PlanCard, type TaskCard, type When } from "./cards";

/**
 * Build result cards from the rows a tool just read or wrote (pure). Every
 * builder runs its output through the card schema, so a value that doesn't
 * fit (e.g. an over-long title) yields no card rather than a malformed one.
 */

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

export function taskWhen(date: string, start: string | null): When {
  return { date, start: hhmm(start), end: null, allDay: false, lastDate: null };
}

export function taskCard(
  action: TaskCard["action"],
  task: { title: string; task_date: string; scheduled_start: string | null; duration_minutes: number | null },
  previous: { task_date: string; scheduled_start: string | null } | null = null,
): ActionCard | null {
  return sanitizeCard({
    v: 1,
    kind: "task",
    action,
    title: clip(task.title, 200),
    when: taskWhen(task.task_date, task.scheduled_start),
    durationMinutes: task.duration_minutes || null,
    previous: previous ? taskWhen(previous.task_date, previous.scheduled_start) : null,
  });
}

/** Local date/time of an event (or of proposed event times) in the user's time zone. */
export function eventWhen(t: EventTimes | EventTimesSource, tz: string): When {
  const allDay = "allDay" in t ? t.allDay : t.all_day;
  if (allDay) {
    const start = "allDay" in t ? (t as Extract<EventTimes, { allDay: true }>).startDate : ((t as EventTimesSource).start_date ?? localDateTime((t as EventTimesSource).starts_at, tz).date);
    const end = "allDay" in t ? (t as Extract<EventTimes, { allDay: true }>).endDate : ((t as EventTimesSource).end_date ?? addDays(start, 1));
    const last = addDays(end, -1);
    return { date: start, start: null, end: null, allDay: true, lastDate: last > start ? last : null };
  }
  const startsAt = "allDay" in t ? (t as Extract<EventTimes, { allDay: false }>).startsAt : (t as EventTimesSource).starts_at;
  const endsAt = "allDay" in t ? (t as Extract<EventTimes, { allDay: false }>).endsAt : (t as EventTimesSource).ends_at;
  const s = localDateTime(startsAt, tz);
  const e = localDateTime(endsAt, tz);
  return { date: s.date, start: s.time, end: e.date === s.date ? e.time : null, allDay: false, lastDate: null };
}

export function eventCard(
  action: EventCard["action"],
  input: { title: string; when: When | null; previous?: When | null; location?: string | null; notes?: string[] },
): ActionCard | null {
  return sanitizeCard({
    v: 1,
    kind: "event",
    action,
    title: clip(input.title, 200),
    when: input.when,
    previous: input.previous ?? null,
    location: input.location?.trim() ? clip(input.location.trim(), 300) : null,
    notes: (input.notes ?? []).filter((n) => n.trim()).slice(0, 6).map((n) => clip(n.trim(), 240)),
  });
}

export function goalCard(action: GoalCard["action"], title: string, detail: string | null = null): ActionCard | null {
  return sanitizeCard({ v: 1, kind: "goal", action, title: clip(title, 120), detail: detail?.trim() ? clip(detail.trim(), 240) : null });
}

export function planCard(
  action: PlanCard["action"],
  date: string,
  items: { title: string; start_time: string | null; duration_minutes: number | null }[],
  notes: string[] = [],
): ActionCard | null {
  return sanitizeCard({
    v: 1,
    kind: "plan",
    action,
    date,
    items: [...items]
      .sort((a, b) => (a.start_time ?? "99:99").localeCompare(b.start_time ?? "99:99"))
      .slice(0, 30)
      .map((i) => ({ title: clip(i.title, 200), start: hhmm(i.start_time), durationMinutes: i.duration_minutes || null })),
    notes: notes.filter((n) => n.trim()).slice(0, 5).map((n) => clip(n.trim(), 300)),
  });
}
