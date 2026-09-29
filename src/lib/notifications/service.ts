import "server-only";
import { appUrl, smsMode, twilioConfig } from "@/lib/env";
import type { DB } from "@/lib/data/db";
import { appendMessage, getOrCreateSmsConversation } from "@/lib/assistant/conversation";
import type { NotificationKind, NotificationPreferences, Profile } from "@/lib/types/domain";
import { TestSmsProvider } from "./providers/test-provider";
import { TwilioSmsProvider } from "./providers/twilio-provider";
import type { SmsProvider } from "./providers/types";
import { canReceiveSms } from "./scheduler";

/**
 * The single entry point for sending a user a message.
 *
 * Mode (SMS_MODE):
 *   live — Twilio credentials present: real delivery
 *   test — default: recorded with status "test", never delivered
 *   disabled — nothing happens
 *
 * Consent is enforced here, so no caller can bypass it.
 */
export function getSmsProvider(): SmsProvider | null {
  const mode = smsMode();
  if (mode === "disabled") return null;
  if (mode === "live") {
    const cfg = twilioConfig();
    if (cfg) {
      const base = appUrl();
      return new TwilioSmsProvider(cfg, base ? `${base}/api/sms/status` : undefined);
    }
  }
  return new TestSmsProvider();
}

export interface DeliverInput {
  userId: string;
  kind: NotificationKind;
  body: string;
  dedupeKey?: string | null;
  relatedTaskId?: string | null;
  /** Bypass the "sms_enabled" toggle — only for the one-time consent confirmation. */
  requireEnabled?: boolean;
}

export type DeliverOutcome =
  | { status: "sent" | "test"; notificationId: string }
  | { status: "failed"; notificationId: string; error: string }
  | { status: "skipped"; reason: string }
  | { status: "duplicate" };

const PROACTIVE_KINDS = new Set<NotificationKind>(["morning_checkin", "task_reminder", "evening_checkin"]);

/** `admin` must be the service-role client: notification rows are server-written. */
export async function deliverNotification(admin: DB, input: DeliverInput): Promise<DeliverOutcome> {
  const provider = getSmsProvider();
  if (!provider) return { status: "skipped", reason: "SMS is disabled (SMS_MODE=disabled)" };

  const [{ data: profile }, { data: prefs }] = await Promise.all([
    admin.from("profiles").select("phone").eq("id", input.userId).maybeSingle(),
    admin.from("notification_preferences").select("*").eq("user_id", input.userId).maybeSingle(),
  ]);
  if (!profile) return { status: "skipped", reason: "No profile" };
  const eligible =
    input.requireEnabled === false
      ? Boolean(profile.phone && prefs?.sms_consent_at && !prefs?.sms_opted_out_at)
      : canReceiveSms(profile as Pick<Profile, "phone">, prefs as NotificationPreferences | null);
  if (!eligible) return { status: "skipped", reason: "User has not consented to SMS or has no phone number" };

  const body = input.body.slice(0, 1600);
  const { data: row, error: insertError } = await admin
    .from("notifications")
    .insert({
      user_id: input.userId,
      channel: "sms",
      kind: input.kind,
      body,
      status: "queued",
      provider: provider.name,
      dedupe_key: input.dedupeKey ?? null,
      related_task_id: input.relatedTaskId ?? null,
    })
    .select("id")
    .single();
  if (insertError) {
    if (insertError.code === "23505") return { status: "duplicate" };
    throw new Error(`Could not record notification: ${insertError.message}`);
  }

  const result = await provider.send({ to: profile.phone as string, body });
  const now = new Date().toISOString();
  if (result.ok) {
    const status = provider.delivers ? "sent" : "test";
    await admin
      .from("notifications")
      .update({ status, sent_at: now, provider_message_id: result.providerMessageId })
      .eq("id", row.id);
    if (PROACTIVE_KINDS.has(input.kind)) {
      // Put proactive texts in the SMS thread so the assistant knows what a reply
      // like "can't tonight" is answering.
      try {
        const conversation = await getOrCreateSmsConversation(admin, input.userId);
        await appendMessage(admin, input.userId, conversation.id, "assistant", body, "sms");
      } catch (err) {
        console.error("[sms] could not add outbound message to thread", { notificationId: row.id, message: (err as Error).message });
      }
    }
    return { status, notificationId: row.id };
  }
  await admin.from("notifications").update({ status: "failed", error: result.error.slice(0, 500) }).eq("id", row.id);
  console.error("[sms] delivery failed", { notificationId: row.id, error: result.error.slice(0, 200) });
  return { status: "failed", notificationId: row.id, error: result.error };
}
