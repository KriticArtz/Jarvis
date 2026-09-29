import type { PlanItem } from "@/lib/types/domain";
import { minutesToTime, timeToMinutes } from "@/lib/time";
import type { Block } from "./availability";

export interface ValidatedPlan {
  items: PlanItem[];
  warnings: string[];
}

/**
 * Enforce hard scheduling rules on a proposed plan regardless of where it
 * came from (AI or rules):
 *   - timed items must fit entirely inside a free window (never over a
 *     commitment, before wake-up, after bedtime, or in the past)
 *   - timed items must not overlap each other
 *   - goal ids must belong to the user
 *   - the total planned time must not exceed available time
 * Items that break a rule are dropped and a warning explains why.
 */
export function validatePlan(
  items: PlanItem[],
  windows: Block[],
  validGoalIds: Set<string>,
  validTaskIds: Set<string> = new Set(),
): ValidatedPlan {
  const warnings: string[] = [];
  const accepted: PlanItem[] = [];
  const placed: { start: number; end: number }[] = [];
  const available = windows.reduce((s, w) => s + (w.end - w.start), 0);
  let plannedMinutes = 0;
  const seenTasks = new Set<string>();

  const sorted = [...items].sort((a, b) => {
    if (a.start_time && b.start_time) return timeToMinutes(a.start_time) - timeToMinutes(b.start_time);
    if (a.start_time) return -1;
    if (b.start_time) return 1;
    return 0;
  });

  for (const raw of sorted) {
    const item: PlanItem = {
      ...raw,
      title: raw.title.trim().slice(0, 200),
      rationale: raw.rationale ? raw.rationale.slice(0, 300) : null,
      duration_minutes: Math.round(Math.max(5, Math.min(600, raw.duration_minutes))),
      goal_id: raw.goal_id && validGoalIds.has(raw.goal_id) ? raw.goal_id : null,
      task_id: raw.task_id && validTaskIds.has(raw.task_id) ? raw.task_id : null,
    };
    if (item.task_id) {
      if (seenTasks.has(item.task_id)) continue;
      seenTasks.add(item.task_id);
    }
    if (!item.title) continue;

    if (item.start_time) {
      if (!/^\d{2}:\d{2}$/.test(item.start_time)) {
        warnings.push(`Removed "${item.title}": invalid time.`);
        continue;
      }
      const start = timeToMinutes(item.start_time);
      const end = start + item.duration_minutes;
      const fits = windows.some((w) => start >= w.start && end <= w.end);
      if (!fits) {
        warnings.push(
          `Removed "${item.title}" at ${item.start_time}: it doesn't fit in your free time (it would overlap a commitment or fall outside your available hours).`,
        );
        continue;
      }
      if (placed.some((p) => start < p.end && end > p.start)) {
        warnings.push(`Removed "${item.title}" at ${item.start_time}: it overlaps another planned item.`);
        continue;
      }
      placed.push({ start, end });
      item.start_time = minutesToTime(start);
    }

    if (plannedMinutes + item.duration_minutes > available) {
      warnings.push(`Removed "${item.title}": not enough free time left today.`);
      continue;
    }
    plannedMinutes += item.duration_minutes;
    accepted.push(item);
  }

  return { items: accepted, warnings };
}
