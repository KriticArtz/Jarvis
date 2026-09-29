import type { Goal, PlanItem, Task } from "@/lib/types/domain";
import type { GoalProgressSummary } from "@/lib/progress";
import { minutesToTime } from "@/lib/time";
import type { Block } from "./availability";

const BUFFER = 10;
const PRIORITY_WEIGHT = { high: 0, medium: 1, low: 2 } as const;

function defaultDuration(goal: Goal, summary: GoalProgressSummary | undefined): number {
  const unit = (goal.target_unit ?? "").toLowerCase();
  const remaining = summary?.target != null ? Math.max(0, summary.target - summary.current) : null;
  if (unit === "minutes" && remaining) return Math.max(15, Math.min(60, Math.round(remaining / 5) * 5));
  if (unit === "hours" && remaining) return Math.max(30, Math.min(90, Math.round((remaining * 60) / 15) * 15));
  return 45;
}

/**
 * Deterministic fallback planner used when AI is unavailable. It schedules
 * unscheduled pending tasks first, then goals that still need progress in
 * their current period, ordered by the user's ranking. It deliberately fills
 * at most ~70% of free time to keep the plan realistic.
 */
export function rulePlan(
  goals: Goal[],
  summaries: Map<string, GoalProgressSummary>,
  pendingTasks: Pick<Task, "id" | "title" | "goal_id" | "duration_minutes" | "scheduled_start" | "is_priority">[],
  windows: Block[],
): PlanItem[] {
  const free = windows.map((w) => ({ ...w }));
  const budget = Math.floor(free.reduce((s, w) => s + (w.end - w.start), 0) * 0.7);
  let used = 0;
  const items: PlanItem[] = [];

  const place = (duration: number): string | null => {
    for (const w of free) {
      if (w.end - w.start >= duration) {
        const start = w.start;
        w.start = start + duration + BUFFER;
        return minutesToTime(start);
      }
    }
    return null;
  };

  const candidates: Omit<PlanItem, "start_time">[] = [];
  for (const t of pendingTasks.filter((t) => !t.scheduled_start)) {
    candidates.push({
      task_id: t.id,
      title: t.title,
      goal_id: t.goal_id,
      duration_minutes: t.duration_minutes ?? 30,
      is_priority: t.is_priority,
      rationale: "Already on your list for today.",
    });
  }

  const needsWork = goals
    .filter((g) => g.status === "active" && g.goal_type === "recurring")
    .filter((g) => {
      const s = summaries.get(g.id);
      return !s || s.pace !== "done";
    })
    .filter((g) => !pendingTasks.some((t) => t.goal_id === g.id))
    .sort((a, b) => a.rank - b.rank || PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]);

  for (const g of needsWork) {
    const s = summaries.get(g.id);
    candidates.push({
      task_id: null,
      title: g.title,
      goal_id: g.id,
      duration_minutes: defaultDuration(g, s),
      is_priority: g.priority === "high",
      rationale: s && s.target != null ? `You're at ${s.label}.` : "Keeps this goal moving.",
    });
  }

  for (const c of candidates.slice(0, 5)) {
    if (used + c.duration_minutes > budget) continue;
    const start = place(c.duration_minutes);
    if (!start) continue;
    used += c.duration_minutes;
    items.push({ ...c, start_time: start });
  }

  return items.map((item, i) => ({ ...item, is_priority: item.is_priority || i < 3 }));
}
