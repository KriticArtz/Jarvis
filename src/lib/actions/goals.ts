"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { localDate } from "@/lib/time";
import { fieldErrors, goalSchema, goalStatusSchema, progressSchema, uuid } from "@/lib/validation/schemas";
import { GENERIC_ERROR, NOT_SIGNED_IN, type ActionResult } from "./result";

function goalFromForm(formData: FormData) {
  return goalSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category") || "other",
    goal_type: formData.get("goal_type") || "recurring",
    target_value: formData.get("target_value"),
    target_unit: formData.get("target_unit") === "__custom" ? formData.get("target_unit_custom") : formData.get("target_unit"),
    period: formData.get("period"),
    due_date: formData.get("due_date"),
    priority: formData.get("priority") || "medium",
  });
}

export async function createGoal(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  const parsed = goalFromForm(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error), error: "Please fix the highlighted fields." };

  const { supabase, userId } = session;
  // New goals go to the bottom of the ranking.
  const { data: last } = await supabase
    .from("goals")
    .select("rank")
    .eq("user_id", userId)
    .order("rank", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("goals").insert({ ...parsed.data, user_id: userId, rank: (last?.rank ?? -1) + 1 });
  if (error) return GENERIC_ERROR;
  revalidatePath("/", "layout");
  return { ok: true, message: "Goal added." };
}

export async function updateGoal(goalId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (!uuid.safeParse(goalId).success) return GENERIC_ERROR;
  const parsed = goalFromForm(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error), error: "Please fix the highlighted fields." };

  const { error } = await session.supabase.from("goals").update(parsed.data).eq("id", goalId).eq("user_id", session.userId);
  if (error) return GENERIC_ERROR;
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

export async function setGoalStatus(goalId: string, status: string): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  const s = goalStatusSchema.safeParse(status);
  if (!s.success || !uuid.safeParse(goalId).success) return GENERIC_ERROR;
  const { error } = await session.supabase
    .from("goals")
    .update({ status: s.data, completed_at: s.data === "completed" ? new Date().toISOString() : null })
    .eq("id", goalId)
    .eq("user_id", session.userId);
  if (error) return GENERIC_ERROR;
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteGoal(goalId: string): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (!uuid.safeParse(goalId).success) return GENERIC_ERROR;
  const { error } = await session.supabase.from("goals").delete().eq("id", goalId).eq("user_id", session.userId);
  if (error) return GENERIC_ERROR;
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Persist a new ordering: ids[0] is the most important goal. */
export async function saveGoalRanking(ids: string[]): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (!Array.isArray(ids) || ids.length > 100 || !ids.every((id) => uuid.safeParse(id).success)) return GENERIC_ERROR;
  const results = await Promise.all(
    ids.map((id, rank) => session.supabase.from("goals").update({ rank }).eq("id", id).eq("user_id", session.userId)),
  );
  if (results.some((r) => r.error)) return GENERIC_ERROR;
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function logProgress(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  const parsed = progressSchema.safeParse({
    goal_id: formData.get("goal_id"),
    amount: formData.get("amount"),
    note: formData.get("note"),
    logged_for: formData.get("logged_for"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error), error: parsed.error.issues[0].message };

  const { supabase, userId } = session;
  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", userId).single();
  const today = localDate(profile?.timezone || "UTC");
  const loggedFor = parsed.data.logged_for ?? today;
  if (loggedFor > today) return { ok: false, error: "You can't log progress for a future date." };

  const { error } = await supabase.from("goal_progress").insert({
    user_id: userId,
    goal_id: parsed.data.goal_id,
    amount: parsed.data.amount,
    note: parsed.data.note,
    logged_for: loggedFor,
    source: "manual",
  });
  if (error) return GENERIC_ERROR;
  revalidatePath("/", "layout");
  return { ok: true, message: "Progress logged." };
}

export async function deleteProgress(entryId: string): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (!uuid.safeParse(entryId).success) return GENERIC_ERROR;
  const { error } = await session.supabase.from("goal_progress").delete().eq("id", entryId).eq("user_id", session.userId);
  if (error) return GENERIC_ERROR;
  revalidatePath("/", "layout");
  return { ok: true };
}
