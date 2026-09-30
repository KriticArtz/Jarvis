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
import { createAdminClient } from "@/lib/supabase/admin";
import { createCalendarEvent, WRITE_ERROR_MESSAGE, type CalendarWriteError } from "@/lib/integrations/calendar/mutations";
import { timedTimes } from "@/lib/integrations/calendar/times";

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
 * new items become tasks for today. Timed items the user ticked "Add to
 * calendar" on (an explicit, per-item choice — nothing is added otherwise)
 * are also created in their Google Calendar, idempotently per plan item.
 */
export async function acceptPlan(input: { planId: string; items: PlanItem[]; calendarItems?: number[] }): Promise<ActionResult & { calendarWarning?: string }> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  const parsed = planAcceptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { supabase, userId } = session;

  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", userId).single();
  const tz = profile?.timezone || "UTC";
  const today = localDate(tz);
  const result = await applyPlan(supabase, userId, {
    planId: parsed.data.planId,
    items: parsed.data.items,
    today,
  });
  if (!result.ok) {
    if (result.reason === "wrong_day") return { ok: false, error: "This plan was for a different day." };
    if (result.reason === "server_error") return GENERIC_ERROR;
    return { ok: false, error: "This plan is no longer available. Generate a new one." };
  }
  const wanted = [...new Set(parsed.data.calendarItems ?? [])].filter((i) => parsed.data.items[i]?.start_time);
  let message = "Plan saved to today.";
  let calendarWarning: string | undefined;
  if (wanted.length && !session.isDemo) {
    const added = await addPlanItemsToCalendar(userId, parsed.data.planId, parsed.data.items, wanted, today, tz);
    if (added.error) {
      calendarWarning = `Your plan is saved, but ${added.count ? `only ${added.count} of ${wanted.length} blocks were added to your calendar` : "nothing was added to your calendar"}. ${WRITE_ERROR_MESSAGE[added.error]}`;
    } else message = `Plan saved to today and ${added.count} block${added.count === 1 ? "" : "s"} added to your calendar.`;
  }
  revalidatePath("/", "layout");
  return { ok: true, message, calendarWarning };
}

async function addPlanItemsToCalendar(
  userId: string,
  planId: string,
  items: PlanItem[],
  indexes: number[],
  today: string,
  tz: string,
): Promise<{ count: number; error: CalendarWriteError | null }> {
  const admin = createAdminClient();
  if (!admin) return { count: 0, error: "not_configured" };
  let count = 0;
  for (const i of indexes) {
    const item = items[i];
    try {
      const res = await createCalendarEvent(
        admin,
        userId,
        { title: item.title, times: timedTimes(today, item.start_time!, item.duration_minutes, tz), description: `Planned with ${brand.name}.` },
        // One event per plan item, even if accepting is retried.
        { idempotencyKey: `plan:${planId}:${i}` },
      );
      if (!res.ok) return { count, error: res.reason };
      count++;
    } catch (err) {
      logError("plan", "add to calendar failed", { userId, ...errorInfo(err) });
      return { count, error: "error" };
    }
  }
  return { count, error: null };
}

export async function discardPlan(planId: string): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (!uuid.safeParse(planId).success) return GENERIC_ERROR;
  await session.supabase.from("daily_plans").update({ status: "discarded" }).eq("id", planId).eq("user_id", session.userId).eq("status", "draft");
  revalidatePath("/plan");
  return { ok: true };
}
