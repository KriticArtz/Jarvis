"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { planDay, type PlanResult } from "@/lib/ai/planner";
import { localDate } from "@/lib/time";
import { planAcceptSchema, planRequestSchema, uuid } from "@/lib/validation/schemas";
import type { PlanItem } from "@/lib/types/domain";
import { GENERIC_ERROR, NOT_SIGNED_IN, type ActionResult } from "./result";
import { DEMO_LIMITS } from "@/lib/demo/seed";
import { brand } from "@/config/brand";
import { applyPlan } from "@/lib/planning/apply";
import { errorInfo, logError } from "@/lib/observability/log";

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
    if ((count ?? 0) >= DEMO_LIMITS.plans) return { ok: false, error: `You've reached the demo's planning limit. Create your own ${brand.name} to keep going.` };
  }
  try {
    const result = await planDay(session.supabase, session.userId, parsed.data);
    revalidatePath("/plan");
    return { ok: true, result };
  } catch (err) {
    logError("plan", "generate failed", errorInfo(err));
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

  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", userId).single();
  const result = await applyPlan(supabase, userId, {
    planId: parsed.data.planId,
    items: parsed.data.items,
    today: localDate(profile?.timezone || "UTC"),
  });
  if (!result.ok) {
    if (result.reason === "wrong_day") return { ok: false, error: "This plan was for a different day." };
    if (result.reason === "server_error") return GENERIC_ERROR;
    return { ok: false, error: "This plan is no longer available. Generate a new one." };
  }
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
