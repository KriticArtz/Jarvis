"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { smsMode } from "@/lib/env";
import { SMS_CONSENT_TEXT } from "@/lib/notifications/consent";
import { deliverNotification } from "@/lib/notifications/service";
import { consentConfirmationMessage } from "@/lib/notifications/templates";
import { createAdminClient } from "@/lib/supabase/admin";
import { fieldErrors, notificationPrefsSchema, phoneSchema } from "@/lib/validation/schemas";
import { GENERIC_ERROR, NOT_SIGNED_IN, type ActionResult } from "./result";

/**
 * Save phone number and (optionally) explicit SMS consent. Consent requires a
 * checked box whose exact text is stored alongside a timestamp.
 */
export async function savePhoneAndConsent(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  const consent = formData.get("sms_consent") === "on";
  const rawPhone = String(formData.get("phone") ?? "").trim();

  if (!rawPhone) {
    if (consent) return { ok: false, fieldErrors: { phone: "Enter a phone number to receive texts." }, error: "Enter a phone number to receive texts." };
    // Clearing the number also turns SMS off.
    await session.supabase.from("profiles").update({ phone: null }).eq("id", session.userId);
    await session.supabase.from("notification_preferences").update({ sms_enabled: false }).eq("user_id", session.userId);
    revalidatePath("/", "layout");
    return { ok: true, message: "Phone number removed." };
  }

  const phone = phoneSchema.safeParse(rawPhone);
  if (!phone.success) return { ok: false, fieldErrors: fieldErrors(phone.error), error: phone.error.issues[0].message };

  const { data: current } = await session.supabase.from("profiles").select("phone").eq("id", session.userId).single();
  const { data: prefs } = await session.supabase
    .from("notification_preferences")
    .select("sms_consent_at, sms_enabled")
    .eq("user_id", session.userId)
    .single();
  const phoneChanged = current?.phone !== phone.data;

  const { error } = await session.supabase.from("profiles").update({ phone: phone.data }).eq("id", session.userId);
  if (error) return GENERIC_ERROR;

  const newlyConsented = consent && (!prefs?.sms_consent_at || !prefs.sms_enabled || phoneChanged);
  if (consent) {
    await session.supabase
      .from("notification_preferences")
      .update({
        sms_enabled: true,
        sms_opted_out_at: null,
        ...(newlyConsented ? { sms_consent_at: new Date().toISOString(), sms_consent_text: SMS_CONSENT_TEXT } : {}),
      })
      .eq("user_id", session.userId);
  } else {
    await session.supabase.from("notification_preferences").update({ sms_enabled: false }).eq("user_id", session.userId);
  }

  let message = consent ? "Text check-ins are on." : "Phone number saved. Text check-ins are off.";
  if (newlyConsented) {
    const admin = createAdminClient();
    if (admin) {
      const outcome = await deliverNotification(admin, { userId: session.userId, kind: "system", body: consentConfirmationMessage() });
      if (outcome.status === "test") message += " (Test mode: no real text was sent.)";
      if (outcome.status === "failed") message += " We couldn't send the confirmation text — check the number.";
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, message };
}

export async function revokeSmsConsent(): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  const { error } = await session.supabase
    .from("notification_preferences")
    .update({ sms_enabled: false, sms_consent_at: null, sms_consent_text: null })
    .eq("user_id", session.userId);
  if (error) return GENERIC_ERROR;
  revalidatePath("/", "layout");
  return { ok: true, message: "Text messages turned off." };
}

export async function saveNotificationPreferences(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  const parsed = notificationPrefsSchema.safeParse({
    morning_checkin_enabled: formData.get("morning_checkin_enabled") === "on",
    morning_checkin_time: formData.get("morning_checkin_time"),
    evening_checkin_enabled: formData.get("evening_checkin_enabled") === "on",
    evening_checkin_time: formData.get("evening_checkin_time"),
    task_reminders_enabled: formData.get("task_reminders_enabled") === "on",
    quiet_hours_start: formData.get("quiet_hours_start"),
    quiet_hours_end: formData.get("quiet_hours_end"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error), error: "Please fix the highlighted fields." };
  const { error } = await session.supabase.from("notification_preferences").update(parsed.data).eq("user_id", session.userId);
  if (error) return GENERIC_ERROR;
  revalidatePath("/", "layout");
  return { ok: true, message: "Notification settings saved." };
}

export async function sendTestMessage(): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (smsMode() === "disabled") return { ok: false, error: "SMS is disabled on this server (SMS_MODE=disabled)." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "The server isn't configured for notifications yet (missing SUPABASE_SERVICE_ROLE_KEY)." };
  const outcome = await deliverNotification(admin, {
    userId: session.userId,
    kind: "test",
    body: "This is a test message from your accountability assistant. Reply STOP to opt out.",
  });
  revalidatePath("/settings");
  switch (outcome.status) {
    case "sent":
      return { ok: true, message: "Test text sent." };
    case "test":
      return { ok: true, message: "Recorded in test mode — no real text was sent. See the log below." };
    case "failed":
      return { ok: false, error: "Sending failed. Check the phone number and Twilio settings." };
    case "skipped":
      return { ok: false, error: outcome.reason };
    default:
      return { ok: false, error: "Already sent." };
  }
}
