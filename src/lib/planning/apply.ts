import "server-only";
import type { DB } from "@/lib/data/db";
import type { PlanItem } from "@/lib/types/domain";

export type ApplyPlanResult =
  /** `failed`: titles of plan items that couldn't be saved (the rest were applied). */
  | { ok: true; created: number; updated: number; unscheduled: string[]; failed: string[] }
  | { ok: false; reason: "not_found" | "not_draft" | "wrong_day" | "server_error" };

/**
 * Accept a draft plan: items for existing tasks update those tasks, new items
 * become tasks for the plan's day. With `unscheduleOthers`, today's pending
 * timed tasks that aren't in the plan lose their time (they're kept, just no
 * longer scheduled) — used when the whole day is re-flowed.
 * An item that can't be saved doesn't stop the others: it is reported in
 * `failed`. If no item could be saved, nothing else is touched and the plan
 * stays a draft (server_error).
 * Shared by the "Plan my day" screen and the assistant's replan action.
 */
export async function applyPlan(
  db: DB,
  userId: string,
  input: { planId: string; items: PlanItem[] | null; today: string; unscheduleOthers?: boolean },
): Promise<ApplyPlanResult> {
  const { data: plan } = await db
    .from("daily_plans")
    .select("id, plan_date, status, proposal")
    .eq("id", input.planId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!plan) return { ok: false, reason: "not_found" };
  if (plan.status !== "draft") return { ok: false, reason: "not_draft" };
  if (plan.plan_date !== input.today) return { ok: false, reason: "wrong_day" };

  const items: PlanItem[] = input.items ?? ((plan.proposal as { items?: PlanItem[] })?.items ?? []);
  const { data: goals } = await db.from("goals").select("id").eq("user_id", userId);
  const goalIds = new Set((goals ?? []).map((g) => g.id as string));
  let created = 0;
  let updated = 0;
  const failed: string[] = [];
  // Every task the plan schedules (existing and newly created) keeps its time below.
  const planned = new Set<string>();

  for (const [i, item] of items.entries()) {
    const fields = {
      title: item.title,
      goal_id: item.goal_id && goalIds.has(item.goal_id) ? item.goal_id : null,
      scheduled_start: item.start_time,
      duration_minutes: item.duration_minutes,
      is_priority: item.is_priority,
      sort_order: i,
      daily_plan_id: plan.id,
    };
    if (item.task_id) {
      // A task that couldn't be moved keeps its current time (it stays "planned").
      planned.add(item.task_id);
      const { error } = await db.from("tasks").update(fields).eq("id", item.task_id).eq("user_id", userId);
      if (error) failed.push(item.title);
      else updated++;
    } else {
      const { data: inserted, error } = await db.from("tasks").insert({ ...fields, user_id: userId, task_date: plan.plan_date }).select("id").single();
      if (error || !inserted) failed.push(item.title);
      else {
        planned.add(inserted.id as string);
        created++;
      }
    }
  }
  if (items.length && created + updated === 0) return { ok: false, reason: "server_error" };

  const unscheduled: string[] = [];
  if (input.unscheduleOthers) {
    const { data: timed } = await db
      .from("tasks")
      .select("id, title")
      .eq("user_id", userId)
      .eq("task_date", plan.plan_date)
      .eq("status", "pending")
      .not("scheduled_start", "is", null);
    for (const t of timed ?? []) {
      if (planned.has(t.id as string)) continue;
      await db.from("tasks").update({ scheduled_start: null }).eq("id", t.id).eq("user_id", userId);
      unscheduled.push(String(t.title));
    }
  }

  await db.from("daily_plans").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", plan.id).eq("user_id", userId);
  // Today's insight should reflect the new plan.
  await db.from("daily_insights").delete().eq("user_id", userId).eq("insight_date", plan.plan_date);
  return { ok: true, created, updated, unscheduled, failed };
}
