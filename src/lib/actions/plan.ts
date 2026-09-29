"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { planDay, type PlanResult } from "@/lib/ai/planner";
import { localDate } from "@/lib/time";
import { planAcceptSchema, planRequestSchema, uuid } from "@/lib/validation/schemas";
import type { PlanItem } from "@/lib/types/domain";
import { GENERIC_ERROR, NOT_SIGNED_IN, type ActionResult } from "./result";
import { DEMO_LIMITS } from "@/lib/demo/seed";

export type PlanActionResult = ActionResult & { result?: PlanResult };

export async function generatePlan(_prev: PlanActionResult, formData: FormData): Promise<PlanActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  const parsed = planRequestSchema.safeParse({
    availableStart: formData.get("availableStart"),
    availableEnd: formData.get("availableEnd"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (parsed.data.availableStart && parsed.data.availableEnd && parsed.data.availableEnd <= parsed.data.availableStart) {
    return { ok: false, error: "The end of your free time must be after the start." };
  }
  if (session.isDemo) {
    const { count } = await session.supabase.from("daily_plans").select("id", { count: "exact", head: true }).eq("user_id", session.userId);
    if ((count ?? 0) >= DEMO_LIMITS.plans) return { ok: false, error: "You've reached the demo's planning limit. Create your own LifePilot to keep going." };
  }
  try {
    const result = await planDay(session.supabase, session.userId, parsed.data);
    revalidatePath("/plan");
    return { ok: true, result };
  } catch (err) {
    console.error("[plan] generate failed", (err as Error).message);
    return { ok: false, error: "I couldn't build a plan right now. Please try again." };
  }
}

/**
 * Accept a (possibly edited) plan: existing tasks get their times updated,
 * new items become tasks for today.
 */
export async function acceptPlan(input: { planId: string; items: PlanItem[] }): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  const parsed = planAcceptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { supabase, userId } = session;

  const { data: plan } = await supabase
    .from("daily_plans")
    .select("id, plan_date, status")
    .eq("id", parsed.data.planId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!plan || plan.status !== "draft") return { ok: false, error: "This plan is no longer available. Generate a new one." };

  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", userId).single();
  if (plan.plan_date !== localDate(profile?.timezone || "UTC")) return { ok: false, error: "This plan was for a different day." };

  const { data: goals } = await supabase.from("goals").select("id").eq("user_id", userId);
  const goalIds = new Set((goals ?? []).map((g) => g.id as string));

  for (const [i, item] of parsed.data.items.entries()) {
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
      const { error } = await supabase.from("tasks").update(fields).eq("id", item.task_id).eq("user_id", userId);
      if (error) return GENERIC_ERROR;
    } else {
      const { error } = await supabase.from("tasks").insert({ ...fields, user_id: userId, task_date: plan.plan_date });
      if (error) return GENERIC_ERROR;
    }
  }

  await supabase.from("daily_plans").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", plan.id).eq("user_id", userId);
  // Today's insight should reflect the new plan.
  await supabase.from("daily_insights").delete().eq("user_id", userId).eq("insight_date", plan.plan_date);
  revalidatePath("/", "layout");
  return { ok: true, message: "Plan saved to today." };
}

export async function discardPlan(planId: string): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (!uuid.safeParse(planId).success) return GENERIC_ERROR;
  await session.supabase.from("daily_plans").update({ status: "discarded" }).eq("id", planId).eq("user_id", session.userId).eq("status", "draft");
  revalidatePath("/plan");
  return { ok: true };
}
