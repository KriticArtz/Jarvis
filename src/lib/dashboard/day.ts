import type { GoalProgressSummary } from "@/lib/progress";
import { formatTime12, minutesToTime, timeToMinutes } from "@/lib/time";
import { assistantHref } from "@/lib/assistant/active";

/**
 * Pure rules for the Today briefing (unit-tested): the merged timeline of
 * the day, the one-line read of the day, and what to do first. Everything
 * is derived from the user's own data — nothing is invented. When there
 * isn't enough to say something specific, the copy stays calm and general.
 */

export interface DayTask {
  id: string;
  title: string;
  start: string | null; // "HH:MM"
  durationMinutes: number | null;
  status: "pending" | "done" | "skipped";
  isPriority: boolean;
  goalTitle: string | null;
  sortOrder: number;
}

export interface DayEvent {
  id?: string;
  title: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  busy: boolean;
  tentative: boolean;
  location: string | null;
}

export type Phase = "past" | "now" | "upcoming";

export type TimelineEntry =
  | { kind: "event"; key: string; title: string; start: string; end: string | null; phase: Phase; event: DayEvent }
  | { kind: "task"; key: string; title: string; start: string; end: string | null; phase: Phase; task: DayTask };

/** Minutes a timed task may run late before it counts as slipped. */
export const LATE_GRACE = 30;
const DEFAULT_TASK_MINUTES = 30;

const toMin = (t: string) => timeToMinutes(t);

function taskEnd(t: DayTask): string | null {
  return t.start ? minutesToTime(Math.min(toMin(t.start) + (t.durationMinutes ?? DEFAULT_TASK_MINUTES), 24 * 60 - 1)) : null;
}

function phaseOf(start: string, end: string | null, now: number): Phase {
  const s = toMin(start);
  const e = end ? toMin(end) : s;
  if (e <= now && s < now) return "past";
  if (s <= now && now < e) return "now";
  return "upcoming";
}

export interface DayTimeline {
  /** Timed events and tasks in one chronological line. */
  entries: TimelineEntry[];
  /** Where the "now" marker sits: entries before this index have started. */
  nowIndex: number;
  allDay: DayEvent[];
  /** Untimed tasks, shown quietly after the day. */
  later: DayTask[];
}

export function buildTimeline(input: { tasks: DayTask[]; events: DayEvent[]; nowMinutes: number }): DayTimeline {
  const entries: TimelineEntry[] = [];
  for (const e of input.events) {
    if (e.allDay || !e.start) continue;
    entries.push({ kind: "event", key: `e:${e.id ?? `${e.title}-${e.start}`}`, title: e.title, start: e.start, end: e.end, phase: phaseOf(e.start, e.end, input.nowMinutes), event: e });
  }
  for (const t of input.tasks) {
    if (!t.start) continue;
    const end = taskEnd(t);
    entries.push({ kind: "task", key: `t:${t.id}`, title: t.title, start: t.start, end, phase: phaseOf(t.start, end, input.nowMinutes), task: t });
  }
  entries.sort((a, b) => toMin(a.start) - toMin(b.start) || (a.kind === b.kind ? 0 : a.kind === "event" ? -1 : 1));
  const nowIndex = entries.findIndex((e) => toMin(e.start) > input.nowMinutes);
  const later = input.tasks
    .filter((t) => !t.start)
    .sort((a, b) => Number(b.isPriority) - Number(a.isPriority) || a.sortOrder - b.sortOrder);
  return { entries, nowIndex: nowIndex === -1 ? entries.length : nowIndex, allDay: input.events.filter((e) => e.allDay), later };
}

/* ------------------------------------------------------------------ health */

export interface SleepNight {
  date: string;
  sleepHours: number | null;
}

/**
 * Last night's sleep compared with the user's own recent nights. Only says
 * something when it's clearly short (needs at least three earlier nights).
 */
export function sleepSignal(days: SleepNight[], today: string): "short" | null {
  const last = days.find((d) => d.date === today)?.sleepHours;
  const earlier = days.filter((d) => d.date < today && d.sleepHours != null).map((d) => d.sleepHours as number);
  if (last == null || earlier.length < 3) return null;
  const avg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
  return last < 7 && last <= avg * 0.85 ? "short" : null;
}

/* ------------------------------------------------------------------ the day in one line */

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const count = (n: number) => WORDS[n] ?? String(n);

export function interpretDay(input: {
  timeline: DayTimeline;
  nowMinutes: number;
  dayPart: "morning" | "afternoon" | "evening";
  sleep: "short" | null;
}): string {
  const { timeline, nowMinutes, dayPart } = input;
  if (input.sleep === "short") return "Sleep was shorter than usual last night — worth keeping today light.";

  const tasks = [...timeline.entries.flatMap((e) => (e.kind === "task" ? [e.task] : [])), ...timeline.later];
  const remaining = timeline.entries.filter((e) => e.phase !== "past" && (e.kind === "event" || e.task.status === "pending"));
  const pendingLater = timeline.later.filter((t) => t.status === "pending");
  const counted = tasks.filter((t) => t.status !== "skipped");

  if (!timeline.entries.length && !timeline.later.length) {
    return dayPart === "morning" ? "Nothing planned yet. Let's shape the day." : dayPart === "afternoon" ? "Nothing planned for the rest of today." : "A quiet evening — nothing else planned.";
  }
  if (counted.length > 0 && counted.every((t) => t.status === "done") && !remaining.some((e) => e.kind === "event")) {
    return "Everything you planned is done.";
  }

  const firstFixed = remaining.find((e) => e.kind === "event" || e.task.start);
  if (dayPart === "morning" && firstFixed && toMin(firstFixed.start) - nowMinutes >= 120) {
    return `Your morning is open until ${formatTime12(firstFixed.start)}. Let's use it well.`;
  }

  const matters =
    remaining.filter((e) => e.kind === "event" || e.task.isPriority).length + pendingLater.filter((t) => t.isPriority).length || remaining.length + pendingLater.length;
  const busy = remaining.length + pendingLater.length >= 5;
  if (matters === 0) return dayPart === "evening" ? "The day's winding down." : "A light day so far.";
  if (matters === 1) return busy ? "Busy day. One thing matters most." : "One thing matters today.";
  return `${busy ? "Busy day. " : ""}${count(matters)} things matter${busy ? "" : " today"}.`;
}

/* ------------------------------------------------------------------ what to do first */

export type Recommendation =
  | { kind: "confirm"; key: string; eyebrow: string; title: string; reason: string; href: string }
  | { kind: "task"; key: string; eyebrow: string; title: string; reason: string; taskId: string; askHref: string }
  | { kind: "goal"; key: string; eyebrow: string; title: string; reason: string; goalId: string }
  | { kind: "intention"; key: string; eyebrow: string; title: string; reason: string }
  | { kind: "done"; key: string; eyebrow: string; title: string; reason: string }
  | { kind: "empty"; key: string; eyebrow: string; title: string; reason: string };

/** "90-minute window", "2-hour window" — rounded so it reads naturally. */
export function windowPhrase(minutes: number): string {
  if (minutes < 150) return `${Math.max(5, Math.round(minutes / 5) * 5)}-minute`;
  return `${Math.floor(minutes / 60)}-hour`;
}

/** Today's Ask / Move it continue today's conversation (the Assistant resumes it). */
const ask = (text: string, taskId?: string) => assistantHref({ prompt: text, taskId });

/**
 * Candidates for "what to do first", best first. The page shows the first;
 * "Not now" moves to the next. Always ends with a useful fallback.
 */
export function recommendations(input: {
  assistantName: string;
  timeline: DayTimeline;
  nowMinutes: number;
  intention: string | null;
  pendingConfirmations: { id: string; summary: string | null; conversationId: string | null }[];
  goals: { id: string; title: string; rank: number }[];
  summaries: Map<string, Pick<GoalProgressSummary, "pace" | "label">>;
}): Recommendation[] {
  const { timeline, nowMinutes, assistantName } = input;
  const out: Recommendation[] = [];

  for (const p of input.pendingConfirmations.slice(0, 1)) {
    out.push({
      kind: "confirm",
      key: `confirm:${p.id}`,
      eyebrow: "Waiting for your OK",
      title: p.summary || "A change is ready for your OK",
      reason: `${assistantName} proposed this and won't do it until you say so.`,
      href: p.conversationId ? `/assistant?c=${p.conversationId}` : "/assistant",
    });
  }

  const timed = timeline.entries;
  const nextFixedAfter = (minute: number) => timed.find((e) => toMin(e.start) > minute && (e.kind === "event" ? e.event.busy : e.task.status === "pending"));
  const taskRec = (t: DayTask, eyebrow: string, reason: string): Recommendation => ({
    kind: "task",
    key: `task:${t.id}`,
    eyebrow,
    title: t.title,
    reason,
    taskId: t.id,
    askHref: ask(`Move "${t.title}" to later today`, t.id),
  });
  const goalNote = (t: DayTask) => (t.goalTitle ? ` It moves “${t.goalTitle}” forward.` : "");

  // 1. Something planned for right now.
  const current = timed.find((e) => e.kind === "task" && e.phase === "now" && e.task.status === "pending");
  if (current?.kind === "task") {
    out.push(taskRec(current.task, "Right now", `It's planned for now${current.end ? `, until ${formatTime12(current.end)}` : ""}.${goalNote(current.task)}`));
  }

  // 2. A timed task that slipped.
  for (const e of timed) {
    if (e.kind !== "task" || e.task.status !== "pending" || e === current) continue;
    if (toMin(e.start) < nowMinutes - LATE_GRACE) {
      out.push(taskRec(e.task, "Still on?", `It was planned for ${formatTime12(e.start)}. Done — or should we move it?`));
      break;
    }
  }

  // 3. The best use of the time before the next commitment.
  const next = nextFixedAfter(nowMinutes);
  const gap = next ? toMin(next.start) - nowMinutes : null;
  const priority = timeline.later.find((t) => t.status === "pending" && t.isPriority);
  const nextTask = timed.find((e) => e.kind === "task" && e.task.status === "pending" && toMin(e.start) >= nowMinutes - LATE_GRACE && e !== current);
  if (nextTask?.kind === "task" && toMin(nextTask.start) - nowMinutes <= 60) {
    out.push(taskRec(nextTask.task, "Up next", `It's next on your plan, at ${formatTime12(nextTask.start)}.${goalNote(nextTask.task)}`));
  }
  if (input.intention?.trim()) {
    out.push({ kind: "intention", key: "intention", eyebrow: "Your one thing", title: input.intention.trim(), reason: "You said this is what today is about." });
  }
  if (priority) {
    const window =
      gap != null && gap >= 30 && next
        ? `You have a clear ${windowPhrase(gap)} window before ${next.kind === "event" ? next.title : `“${next.title}”`} at ${formatTime12(next.start)}.`
        : next
          ? `Fit it in before ${formatTime12(next.start)} if you can.`
          : "Nothing else is scheduled — a good time for it.";
    out.push(taskRec(priority, "Start with this", `${window}${goalNote(priority)}`));
  }
  if (nextTask?.kind === "task" && !out.some((r) => r.key === `task:${nextTask.task.id}`)) {
    out.push(taskRec(nextTask.task, "Up next", `It's next on your plan, at ${formatTime12(nextTask.start)}.${goalNote(nextTask.task)}`));
  }
  for (const t of timeline.later) {
    if (t.status === "pending" && !out.some((r) => r.key === `task:${t.id}`)) {
      out.push(taskRec(t, "Then", "Still open for today."));
      break;
    }
  }

  // 4. A goal falling behind, when nothing on the plan serves it.
  const behind = [...input.goals].sort((a, b) => a.rank - b.rank).find((g) => input.summaries.get(g.id)?.pace === "behind");
  if (behind) {
    out.push({
      kind: "goal",
      key: `goal:${behind.id}`,
      eyebrow: "Worth fitting in",
      title: behind.title,
      reason: `It's behind pace — ${input.summaries.get(behind.id)?.label}. Want to make room for it today?`,
      goalId: behind.id,
    });
  }

  // 5. Fallbacks.
  const allTasks = [...timed.flatMap((e) => (e.kind === "task" ? [e.task] : [])), ...timeline.later].filter((t) => t.status !== "skipped");
  if (allTasks.length && allTasks.every((t) => t.status === "done")) {
    out.push({ kind: "done", key: "done", eyebrow: "Nice work", title: "That's everything you planned.", reason: "Plan the rest of the day, or call it a day." });
  }
  out.push({
    kind: "empty",
    key: "empty",
    eyebrow: allTasks.length ? "Anything else?" : "Let's start",
    title: "Tell me what you're trying to get done today.",
    reason: input.goals.length ? "I'll build a plan around your schedule and goals." : "I'll help you turn it into a plan that fits your day.",
  });
  return out;
}
