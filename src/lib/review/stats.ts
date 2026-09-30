import type { Goal, Task } from "@/lib/types/domain";
import { addDays, timeToMinutes } from "@/lib/time";

interface ProgressLike {
  goal_id: string;
  amount: number | string;
  logged_for: string;
}

export interface GoalWeekStats {
  goalId: string;
  title: string;
  category: string;
  period: Goal["period"];
  unit: string | null;
  /** Total progress logged this week */
  amount: number;
  /** Target scaled to this week (null if no target or monthly/one-time) */
  weeklyTarget: number | null;
  /** Distinct days with progress logged */
  activeDays: number;
  /** For daily goals: days hit target / days elapsed. Otherwise amount/target. */
  consistency: number | null;
  tasksPlanned: number;
  tasksCompleted: number;
}

export interface TimeOfDayStats {
  planned: number;
  completed: number;
}

export interface WeeklyStats {
  weekStart: string;
  weekEnd: string;
  /** Last day counted (today if the week is still in progress) */
  throughDate: string;
  daysElapsed: number;
  tasks: {
    planned: number;
    completed: number;
    skipped: number;
    missed: number;
    open: number;
  };
  priorities: { planned: number; completed: number };
  goals: GoalWeekStats[];
  timeOfDay: { morning: TimeOfDayStats; afternoon: TimeOfDayStats; evening: TimeOfDayStats };
  checkIns: number;
  hasData: boolean;
  /** From a connected calendar (read-only): events that week and hours they blocked. */
  calendar?: { events: number; busyHours: number };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function bucket(time: string | null): "morning" | "afternoon" | "evening" | null {
  if (!time) return null;
  const m = timeToMinutes(time);
  if (m < 12 * 60) return "morning";
  if (m < 17 * 60) return "afternoon";
  return "evening";
}

/**
 * Compute weekly statistics strictly from stored rows. `today` bounds the
 * week so future days are never counted as missed.
 */
export function computeWeeklyStats(input: {
  weekStart: string;
  today: string;
  tasks: Pick<Task, "goal_id" | "task_date" | "status" | "is_priority" | "scheduled_start">[];
  goals: Goal[];
  progress: ProgressLike[];
  checkInCount: number;
}): WeeklyStats {
  const weekEnd = addDays(input.weekStart, 6);
  const throughDate = input.today < weekEnd ? input.today : weekEnd;
  const daysElapsed = input.today < input.weekStart ? 0 : Math.min(7, Math.round((Date.parse(throughDate) - Date.parse(input.weekStart)) / 86_400_000) + 1);

  const inWeek = input.tasks.filter((t) => t.task_date >= input.weekStart && t.task_date <= weekEnd);
  const tasks = { planned: inWeek.length, completed: 0, skipped: 0, missed: 0, open: 0 };
  const priorities = { planned: 0, completed: 0 };
  const timeOfDay = {
    morning: { planned: 0, completed: 0 },
    afternoon: { planned: 0, completed: 0 },
    evening: { planned: 0, completed: 0 },
  };

  for (const t of inWeek) {
    if (t.status === "done") tasks.completed++;
    else if (t.status === "skipped") tasks.skipped++;
    else if (t.task_date < input.today) tasks.missed++;
    else tasks.open++;

    if (t.is_priority) {
      priorities.planned++;
      if (t.status === "done") priorities.completed++;
    }

    const b = bucket(t.scheduled_start);
    // Only count time-of-day for tasks whose outcome is known.
    if (b && (t.status !== "pending" || t.task_date < input.today)) {
      timeOfDay[b].planned++;
      if (t.status === "done") timeOfDay[b].completed++;
    }
  }

  const progressInWeek = input.progress.filter((p) => p.logged_for >= input.weekStart && p.logged_for <= weekEnd);

  const goals: GoalWeekStats[] = input.goals
    .filter((g) => g.status === "active" || progressInWeek.some((p) => p.goal_id === g.id))
    .map((g) => {
      const entries = progressInWeek.filter((p) => p.goal_id === g.id);
      const amount = round(entries.reduce((s, p) => s + Number(p.amount), 0));
      const byDay = new Map<string, number>();
      for (const e of entries) byDay.set(e.logged_for, (byDay.get(e.logged_for) ?? 0) + Number(e.amount));
      const target = g.target_value != null ? Number(g.target_value) : null;

      let weeklyTarget: number | null = null;
      let consistency: number | null = null;
      if (g.goal_type === "recurring" && target != null) {
        if (g.period === "week") {
          weeklyTarget = target;
          consistency = target > 0 ? Math.min(1, amount / target) : null;
        } else if (g.period === "day") {
          weeklyTarget = round(target * 7);
          const hitDays = [...byDay.values()].filter((v) => v >= target).length;
          consistency = daysElapsed > 0 ? round(hitDays / daysElapsed) : null;
        }
      } else if (g.goal_type === "recurring" && g.period === "day" && daysElapsed > 0) {
        consistency = round(byDay.size / daysElapsed);
      }

      const goalTasks = inWeek.filter((t) => t.goal_id === g.id);
      return {
        goalId: g.id,
        title: g.title,
        category: g.category,
        period: g.period,
        unit: g.target_unit,
        amount,
        weeklyTarget,
        activeDays: byDay.size,
        consistency: consistency != null ? round(consistency) : null,
        tasksPlanned: goalTasks.length,
        tasksCompleted: goalTasks.filter((t) => t.status === "done").length,
      };
    });

  return {
    weekStart: input.weekStart,
    weekEnd,
    throughDate,
    daysElapsed,
    tasks,
    priorities,
    goals,
    timeOfDay,
    checkIns: input.checkInCount,
    hasData: inWeek.length > 0 || progressInWeek.length > 0 || input.checkInCount > 0,
  };
}

/**
 * Plain-language summary built only from the numbers (no AI). Used when AI is
 * not configured and as a factual fallback.
 */
export function ruleBasedSummary(stats: WeeklyStats): string {
  if (!stats.hasData) {
    return "There's no activity recorded for this week yet. Plan a few tasks or log progress on a goal, and your review will fill in from real data.";
  }
  const lines: string[] = [];
  const decided = stats.tasks.completed + stats.tasks.skipped + stats.tasks.missed;
  if (stats.tasks.planned > 0) {
    lines.push(`You completed ${stats.tasks.completed} of ${stats.tasks.planned} planned tasks${stats.tasks.open ? ` (${stats.tasks.open} still open)` : ""}.`);
  }
  if (stats.priorities.planned > 0) {
    lines.push(`Priorities: ${stats.priorities.completed} of ${stats.priorities.planned} done.`);
  }
  const ranked = stats.goals.filter((g) => g.consistency != null).sort((a, b) => (b.consistency ?? 0) - (a.consistency ?? 0));
  if (ranked.length > 1 && (ranked[0].consistency ?? 0) > (ranked[ranked.length - 1].consistency ?? 0)) {
    lines.push(`You were most consistent with ${ranked[0].title}, and least with ${ranked[ranked.length - 1].title}.`);
  } else if (ranked.length === 1) {
    lines.push(`${ranked[0].title}: ${Math.round((ranked[0].consistency ?? 0) * 100)}% of target.`);
  }
  const tod = (Object.entries(stats.timeOfDay) as [string, TimeOfDayStats][]).filter(([, v]) => v.planned >= 2);
  if (tod.length > 1) {
    const rate = ([, v]: [string, TimeOfDayStats]) => v.completed / v.planned;
    const best = tod.reduce((a, b) => (rate(b) > rate(a) ? b : a));
    const worst = tod.reduce((a, b) => (rate(b) < rate(a) ? b : a));
    if (rate(best) - rate(worst) >= 0.25) {
      lines.push(`Your ${best[0]} tasks got done more reliably than your ${worst[0]} ones — consider moving important work to the ${best[0]}.`);
    }
  }
  if (stats.tasks.missed > 0 && decided > 0 && stats.tasks.missed / decided > 0.4) {
    lines.push("A lot of planned tasks went unfinished. Next week, try planning fewer, smaller tasks.");
  }
  return lines.join("\n\n");
}
