import type { AssistantContext } from "@/lib/ai/context-types";
import { windowPhrase } from "@/lib/dashboard/day";
import { timeToMinutes } from "@/lib/time";

/**
 * The Assistant's opening state (pure; unit-tested): one line about the
 * user's day — only when real data supports it — and a few suggestions that
 * fit their actual situation. Nothing generic, nothing invented.
 */
export interface Opening {
  line: string | null;
  suggestions: string[];
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const things = (n: number) => `${WORDS[n] ?? n} thing${n === 1 ? "" : "s"}`;
const LATE_GRACE = 30;

function partOfDay(minutes: number, now: number): string {
  if (minutes <= now + 15) return "right now";
  if (minutes < 12 * 60) return "this morning";
  if (minutes < 17 * 60) return "this afternoon";
  return "this evening";
}

export function buildOpening(ctx: Pick<AssistantContext, "now" | "today" | "schedule" | "goals" | "calendar">): Opening {
  const now = timeToMinutes(ctx.now.time);
  const tasks = ctx.today.tasks;
  const pending = tasks.filter((t) => t.status === "pending");
  const events = (ctx.calendar?.days[0]?.events ?? []).filter((e) => !e.allDay && e.start && timeToMinutes(e.start) > now && e.busy);
  const remaining = pending.length + events.length;
  const slipped = pending.some((t) => t.start && timeToMinutes(t.start) < now - LATE_GRACE);
  const behind = ctx.goals.find((g) => g.pace === "behind");
  const window = (ctx.schedule.freeWindowsToday ?? [])
    .map((w) => ({ start: timeToMinutes(w.start), length: timeToMinutes(w.end) - timeToMinutes(w.start) }))
    .filter((w) => w.length >= 45)
    .sort((a, b) => b.length - a.length)[0];
  const allDone = tasks.length > 0 && tasks.every((t) => t.status !== "pending") && events.length === 0;

  let line: string | null = null;
  if (allDone) line = "Everything on today's plan is done.";
  else if (remaining > 0 && window) line = `You have ${things(remaining)} planned today and a free ${windowPhrase(window.length)} window ${partOfDay(window.start, now)}.`;
  else if (remaining > 0) line = `You have ${things(remaining)} left today.`;
  else if (behind) line = `Nothing's planned yet today, and “${behind.title}” is behind pace.`;
  else if (window) line = `Your day is open — a free ${windowPhrase(window.length)} window ${partOfDay(window.start, now)}.`;

  const s: string[] = [];
  if (remaining > 0) s.push("What should I do right now?");
  if (now < 21 * 60) s.push(remaining > 0 ? "Help me plan the rest of today" : "Help me plan today");
  if (slipped || behind) s.push("I'm falling behind");
  if (remaining >= 5) s.push("I'm overwhelmed");
  if (events.length && ctx.calendar?.writable) s.push("Move something on my calendar");
  else if (pending.length) s.push("Move a task to tomorrow");
  if (!ctx.goals.length) s.push("Help me set a goal");
  if (allDone) s.unshift("What went well today?");

  return { line, suggestions: [...new Set(s)].slice(0, 4) };
}
