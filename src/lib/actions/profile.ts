"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  commitmentSchema,
  fieldErrors,
  nameSchema,
  scheduleSchema,
  timezoneSchema,
  uuid,
} from "@/lib/validation/schemas";
import { updatePersonalization } from "@/lib/data/personalization";
import { GENERIC_ERROR, NOT_SIGNED_IN, type ActionResult } from "./result";

const MAX_STEP = 6;

async function setStep(step: number) {
  const session = await getSessionUser();
  if (!session) return;
  // Only move forward; never un-complete onboarding.
  const { data } = await session.supabase.from("profiles").select("onboarding_step").eq("id", session.userId).single();
  if ((data?.onboarding_step ?? 1) < step) {
    await session.supabase.from("profiles").update({ onboarding_step: Math.min(step, MAX_STEP) }).eq("id", session.userId);
  }
}

export async function saveName(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  const tz = formData.get("timezone");
  const parsed = nameSchema.safeParse({
    display_name: formData.get("display_name"),
    timezone: typeof tz === "string" && tz ? tz : undefined,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error), error: parsed.error.issues[0].message };
  const update: Record<string, unknown> = { display_name: parsed.data.display_name };
  if (parsed.data.timezone) update.timezone = parsed.data.timezone;
  const { error } = await session.supabase.from("profiles").update(update).eq("id", session.userId);
  if (error) return GENERIC_ERROR;
  if (formData.get("onboarding")) await setStep(2);
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

export async function saveSchedule(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  const parsed = scheduleSchema.safeParse({
    wake_time: formData.get("wake_time"),
    sleep_time: formData.get("sleep_time"),
    work_start: formData.get("work_start"),
    work_end: formData.get("work_end"),
    work_days: formData.getAll("work_days"),
    work_label: formData.get("work_label"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error), error: "Please fix the highlighted fields." };
  const { error } = await session.supabase.from("profiles").update(parsed.data).eq("id", session.userId);
  if (error) return GENERIC_ERROR;
  if (formData.get("onboarding")) await setStep(4);
  revalidatePath("/", "layout");
  return { ok: true, message: "Schedule saved." };
}

export async function addCommitment(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  const parsed = commitmentSchema.safeParse({
    title: formData.get("title"),
    days_of_week: formData.getAll("days_of_week"),
    start_time: formData.get("start_time"),
    end_time: formData.get("end_time"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error), error: parsed.error.issues[0].message };
  const { error } = await session.supabase.from("recurring_commitments").insert({ ...parsed.data, user_id: session.userId });
  if (error) return GENERIC_ERROR;
  revalidatePath("/", "layout");
  return { ok: true, message: "Commitment added." };
}

export async function deleteCommitment(id: string): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (!uuid.safeParse(id).success) return GENERIC_ERROR;
  const { error } = await session.supabase.from("recurring_commitments").delete().eq("id", id).eq("user_id", session.userId);
  if (error) return GENERIC_ERROR;
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Save any of: assistant name, personality, theme, appearance mode. Only provided fields
 * change. In onboarding this is the "Your AI" step (step 5).
 */
export async function savePersonalization(
  input: { assistant_name?: string; assistant_personality?: string; theme?: string; appearance?: string },
  opts: { onboarding?: boolean } = {},
): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  const res = await updatePersonalization(session.supabase, session.userId, input);
  if (!res.ok) {
    if (res.reason === "invalid") return { ok: false, fieldErrors: res.fieldErrors, error: Object.values(res.fieldErrors)[0] };
    return GENERIC_ERROR;
  }
  if (opts.onboarding) await setStep(6);
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

export async function saveTimezone(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  const parsed = timezoneSchema.safeParse(formData.get("timezone"));
  if (!parsed.success) return { ok: false, error: "Choose a valid timezone." };
  const { error } = await session.supabase.from("profiles").update({ timezone: parsed.data }).eq("id", session.userId);
  if (error) return GENERIC_ERROR;
  revalidatePath("/", "layout");
  return { ok: true, message: "Timezone saved." };
}

/** Advance the onboarding step marker (used by steps that save via other actions). */
export async function advanceOnboarding(step: number): Promise<ActionResult> {
  if (!Number.isInteger(step) || step < 1 || step > MAX_STEP) return GENERIC_ERROR;
  await setStep(step);
  return { ok: true };
}

export async function completeOnboarding(): Promise<void> {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  const { count } = await session.supabase
    .from("goals")
    .select("id", { count: "exact", head: true })
    .eq("user_id", session.userId);
  if (!count) redirect("/onboarding?step=2");
  await session.supabase
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString(), onboarding_step: MAX_STEP })
    .eq("id", session.userId)
    .is("onboarding_completed_at", null);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
