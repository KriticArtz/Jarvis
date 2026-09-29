import "server-only";
import { autoProgressAmount } from "@/lib/progress";
import type { DB } from "./db";

/**
 * When a task tied to a goal is completed, log progress toward that goal
 * (idempotent: at most one entry per task). Undoing the task removes it.
 */
export async function logTaskProgress(
  db: DB,
  userId: string,
  task: { id: string; goal_id: string | null; duration_minutes: number | null; task_date: string },
) {
  if (!task.goal_id) return;
  const { data: goal } = await db.from("goals").select("target_unit").eq("id", task.goal_id).eq("user_id", userId).maybeSingle();
  if (!goal) return;
  const amount = autoProgressAmount(goal, task.duration_minutes);
  if (!amount) return;
  await db
    .from("goal_progress")
    .upsert(
      { user_id: userId, goal_id: task.goal_id, task_id: task.id, amount, logged_for: task.task_date, source: "task" },
      { onConflict: "task_id", ignoreDuplicates: true },
    );
}

export async function removeTaskProgress(db: DB, userId: string, taskId: string) {
  await db.from("goal_progress").delete().eq("user_id", userId).eq("task_id", taskId).eq("source", "task");
}
