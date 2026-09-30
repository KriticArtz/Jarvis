import { addDays, daysBetweenInclusive, formatShortDate, formatTime12, isoWeekday } from "@/lib/time";

const WEEKDAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Accepts "today" | "tomorrow" | "YYYY-MM-DD"; bounded to a sane window around today. */
export function resolveDate(input: string, today: string): { ok: true; date: string } | { ok: false; reason: string } {
  const value = input.trim().toLowerCase();
  const date = value === "today" ? today : value === "tomorrow" ? addDays(today, 1) : value === "yesterday" ? addDays(today, -1) : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return { ok: false, reason: "invalid date" };
  const offset = date >= today ? daysBetweenInclusive(today, date) - 1 : -(daysBetweenInclusive(date, today) - 1);
  if (offset < -60) return { ok: false, reason: "too far in the past" };
  if (offset > 365) return { ok: false, reason: "too far in the future" };
  return { ok: true, date };
}

/** "today", "tomorrow", or "Thu, Oct 1" */
export function describeDate(date: string, today: string): string {
  if (date === today) return "today";
  if (date === addDays(today, 1)) return "tomorrow";
  if (date === addDays(today, -1)) return "yesterday";
  return `${WEEKDAYS[isoWeekday(date)]}, ${formatShortDate(date)}`;
}

export function describeWhen(date: string, time: string | null, today: string): string {
  return `${describeDate(date, today)}${time ? ` at ${formatTime12(time)}` : ""}`;
}
