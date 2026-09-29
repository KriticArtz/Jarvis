"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { logTaskProgress, removeTaskProgress } from "@/lib/data/task-progress";
import { localDate } from "@/lib/time";
import { checkInSchema, fieldErrors, memorySchema, taskSchema, uuid } from "@/lib/validation/schemas";
import { GENERIC_ERROR, NOT_SIGNED_IN, type ActionResult } from "./result";

async function userToday(session: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>) {
  const { data } = await session.supabase.from("profiles").select("timezone").eq("id", session.userId).single();
  return localDate(data?.timezone || "UTC");
}

export async function addTask(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  const parsed = taskSchema.safeParse({
    title: formData.get("title"),
    goal_id: formData.get("goal_id"),
    scheduled_start: formData.get("scheduled_start"),
    duration_minutes: formData.get("duration_minutes"),
    is_priority: formData.get("is_priority"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error), error: parsed.error.issues[0].message };
  const today = await userToday(session);
  const { error } = await session.supabase.from("tasks").insert({ ...parsed.data, user_id: session.userId, task_date: today });
  if (error) return GENERIC_ERROR;
  revalidatePath("/", "layout");
  return { ok: true, message: "Task added." };
}

export async function setTaskStatus(taskId: string, status: "pending" | "done" | "skipped"): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (!uuid.safeParse(taskId).success || !["pending", "done", "skipped"].includes(status)) return GENERIC_ERROR;
  const { data: task, error } = await session.supabase
    .from("tasks")
    .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
    .eq("id", taskId)
    .eq("user_id", session.userId)
    .select("id, goal_id, duration_minutes, task_date")
    .single();
  if (error || !task) return GENERIC_ERROR;
  if (status === "done") await logTaskProgress(session.supabase, session.userId, task);
  else await removeTaskProgress(session.supabase, session.userId, task.id);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (!uuid.safeParse(taskId).success) return GENERIC_ERROR;
  await removeTaskProgress(session.supabase, session.userId, taskId);
  const { error } = await session.supabase.from("tasks").delete().eq("id", taskId).eq("user_id", session.userId);
  if (error) return GENERIC_ERROR;
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveCheckIn(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  const parsed = checkInSchema.safeParse({
    kind: formData.get("kind"),
    rating: formData.get("rating"),
    content: formData.get("content"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!parsed.data.content && !parsed.data.rating) return { ok: false, error: "Add a rating or a few words." };
  const today = await userToday(session);
  const { error } = await session.supabase
    .from("daily_check_ins")
    .upsert({ ...parsed.data, user_id: session.userId, check_in_date: today, channel: "app" }, { onConflict: "user_id,check_in_date,kind" });
  if (error) return GENERIC_ERROR;
  revalidatePath("/", "layout");
  return { ok: true, message: "Check-in saved." };
}

export async function addMemory(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  const parsed = memorySchema.safeParse({ content: formData.get("content") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { error } = await session.supabase.from("user_memories").insert({ user_id: session.userId, content: parsed.data.content, kind: "note", source: "user" });
  if (error) return GENERIC_ERROR;
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

export async function deleteMemory(id: string): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (!uuid.safeParse(id).success) return GENERIC_ERROR;
  const { error } = await session.supabase.from("user_memories").delete().eq("id", id).eq("user_id", session.userId);
  if (error) return GENERIC_ERROR;
  revalidatePath("/", "layout");
  return { ok: true };
}
