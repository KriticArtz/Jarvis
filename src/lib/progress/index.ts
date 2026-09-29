import type { Goal, GoalPeriod } from "@/lib/types/domain";
import { daysBetweenInclusive, monthEnd, monthStart, weekStart, addDays } from "@/lib/time";

export interface PeriodWindow {
  start: string;
  end: string;
}

/** The calendar window (in user-local dates) that `today` falls in. */
export function periodWindow(period: GoalPeriod, today: string): PeriodWindow {
  switch (period) {
    case "day":
      return { start: today, end: today };
    case "week": {
      const start = weekStart(today);
      return { start, end: addDays(start, 6) };
    }
    case "month":
      return { start: monthStart(today), end: monthEnd(today) };
  }
}

export const PERIOD_LABEL: Record<GoalPeriod, string> = {
  day: "today",
  week: "this week",
  month: "this month",
};

export interface GoalProgressSummary {
  goalId: string;
  current: number;
  target: number | null;
  unit: string | null;
  /** 0..1, null when there is no numeric target */
  ratio: number | null;
  /** Where the user "should" be by now given elapsed time in the period */
  pace: "ahead" | "on_track" | "behind" | "done" | "not_applicable";
  window: PeriodWindow | null;
  label: string;
}

interface ProgressEntryLike {
  goal_id: string;
  amount: number | string;
  logged_for: string;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatAmount(n: number, unit: string | null): string {
  const value = round(n);
  if (!unit) return String(value);
  if (unit === "dollars") return `$${value}`;
  if (unit === "times" && value === 1) return "1 time";
  return `${value} ${unit}`;
}

/**
 * Summarize a goal's progress from its log entries. Entries outside the
 * current period are ignored for recurring goals; one-time goals count all.
 */
export function summarizeGoalProgress(goal: Goal, entries: ProgressEntryLike[], today: string): GoalProgressSummary {
  const own = entries.filter((e) => e.goal_id === goal.id);
  const target = goal.target_value != null ? Number(goal.target_value) : null;

  let window: PeriodWindow | null = null;
  let relevant = own;
  if (goal.goal_type === "recurring" && goal.period) {
    window = periodWindow(goal.period, today);
    relevant = own.filter((e) => e.logged_for >= window!.start && e.logged_for <= window!.end);
  }
  const current = round(relevant.reduce((sum, e) => sum + Number(e.amount), 0));

  if (goal.status === "completed") {
    return { goalId: goal.id, current, target, unit: goal.target_unit, ratio: 1, pace: "done", window, label: "Completed" };
  }

  if (target == null) {
    const label =
      goal.goal_type === "recurring" && goal.period
        ? `${formatAmount(current, goal.target_unit ?? "times")} ${PERIOD_LABEL[goal.period]}`
        : current > 0
          ? `${formatAmount(current, goal.target_unit)} logged`
          : "No progress logged yet";
    return { goalId: goal.id, current, target, unit: goal.target_unit, ratio: null, pace: "not_applicable", window, label };
  }

  const ratio = Math.min(1, current / target);
  let pace: GoalProgressSummary["pace"] = "not_applicable";
  if (current >= target) {
    pace = "done";
  } else if (window) {
    const total = daysBetweenInclusive(window.start, window.end);
    // Today is still in progress, so only fully elapsed days set expectations.
    const elapsedBeforeToday = daysBetweenInclusive(window.start, today) - 1;
    const expected = (target * elapsedBeforeToday) / total;
    pace = current >= expected ? (current > expected * 1.25 ? "ahead" : "on_track") : "behind";
  }

  const periodText = goal.goal_type === "recurring" && goal.period ? ` ${PERIOD_LABEL[goal.period]}` : "";
  const label = `${round(current)}/${formatAmount(target, goal.target_unit)}${periodText}`;
  return { goalId: goal.id, current, target, unit: goal.target_unit, ratio, pace, window, label };
}

/**
 * How much progress completing a task should log toward its goal.
 * Time-based units use the task duration; count-based units log one
 * occurrence; other units (dollars, pages, ...) must be logged manually.
 */
export function autoProgressAmount(goal: Pick<Goal, "target_unit">, durationMinutes: number | null): number | null {
  const unit = (goal.target_unit ?? "times").toLowerCase();
  if (unit === "minutes") return durationMinutes && durationMinutes > 0 ? durationMinutes : null;
  if (unit === "hours") return durationMinutes && durationMinutes > 0 ? round(durationMinutes / 60) : null;
  if (unit === "times" || unit === "sessions" || unit === "workouts") return 1;
  return null;
}

/** Human description of a goal's target, e.g. "4 times per week". */
export function describeTarget(goal: Pick<Goal, "goal_type" | "target_value" | "target_unit" | "period" | "due_date">): string {
  const parts: string[] = [];
  if (goal.target_value != null) parts.push(formatAmount(Number(goal.target_value), goal.target_unit ?? "times"));
  if (goal.goal_type === "recurring" && goal.period) parts.push(`per ${goal.period}`);
  if (goal.goal_type === "one_time") {
    if (parts.length === 0) parts.push("One-time goal");
    if (goal.due_date) parts.push(`by ${goal.due_date}`);
  }
  return parts.join(" ");
}
