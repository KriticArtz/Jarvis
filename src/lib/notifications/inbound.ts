import "server-only";
import type { DB } from "@/lib/data/db";
import { appendMessage, generateReply, getOrCreateSmsConversation } from "@/lib/assistant/conversation";
import { maybeSummarizeConversation } from "@/lib/ai/memory";
import { localDate } from "@/lib/time";
import { detectKeyword } from "./keywords";
import { deliverNotification } from "./service";
import { logWarn } from "@/lib/observability/log";
import { requirePhoneVerification } from "@/lib/env";

export interface InboundSms {
  provider: string;
  providerMessageId: string;
  from: string;
  body: string;
}

/**
 * Find the account a text belongs to. Phone numbers aren't verified yet, so
 * several accounts could list the same number: prefer accounts that have
 * explicitly consented to SMS, and among those the most recent consent.
 * A STOP/START keyword may come from a number with no active consent, so
 * fall back to a unique plain match for those.
 */
async function identifySender(admin: DB, phone: string): Promise<{ id: string; timezone: string } | null> {
  let query = admin.from("profiles").select("id, timezone").eq("phone", phone);
  // When verification is required, only a verified number identifies a sender.
  if (requirePhoneVerification()) query = query.not("phone_verified_at", "is", null);
  const { data: profiles } = await query.limit(20);
  if (!profiles?.length) return null;
  const { data: prefs } = await admin
    .from("notification_preferences")
    .select("user_id, sms_enabled, sms_consent_at, sms_opted_out_at")
    .in("user_id", profiles.map((p) => p.id as string));
  const consented = (prefs ?? [])
    .filter((p) => p.sms_consent_at)
    .sort((a, b) => String(b.sms_consent_at).localeCompare(String(a.sms_consent_at)));
  const chosen = consented[0]?.user_id ?? (profiles.length === 1 ? profiles[0].id : null);
  const profile = profiles.find((p) => p.id === chosen);
  return profile ? { id: profile.id as string, timezone: profile.timezone as string } : null;
}

/**
 * Two-way SMS pipeline (called only after the webhook signature is verified):
 *   inbound SMS -> identify user by phone -> keyword handling (STOP/START)
 *   -> store message -> build user context -> AI reply -> send SMS.
 * Replies to a recent morning/evening check-in are also saved as check-ins.
 */
export async function handleInboundSms(admin: DB, msg: InboundSms): Promise<{ handled: boolean; reason?: string }> {
  const body = msg.body.trim().slice(0, 1600);

  const { data: logRow, error: logError } = await admin
    .from("inbound_messages")
    .insert({ provider: msg.provider, provider_message_id: msg.providerMessageId, from_number: msg.from, body })
    .select("id")
    .single();
  if (logError) {
    if (logError.code === "23505") return { handled: false, reason: "duplicate" };
    throw new Error(`inbound log failed: ${logError.message}`);
  }
  const finish = (patch: Record<string, unknown>) =>
    admin.from("inbound_messages").update({ processed_at: new Date().toISOString(), ...patch }).eq("id", logRow.id);

  const match = await identifySender(admin, msg.from);
  if (!match) {
    logWarn("sms", "inbound text from a number that isn't linked to an account with SMS enabled", { sid: msg.providerMessageId });
    await finish({ error: "unknown phone" });
    return { handled: false, reason: "unidentified sender" };
  }
  const userId = match.id;
  const tz = match.timezone || "UTC";
  await admin.from("inbound_messages").update({ user_id: userId }).eq("id", logRow.id);

  const keyword = detectKeyword(body);
  if (keyword === "stop") {
    await admin.from("notification_preferences").update({ sms_enabled: false, sms_opted_out_at: new Date().toISOString() }).eq("user_id", userId);
    await finish({});
    return { handled: true, reason: "opted out" }; // Twilio sends the carrier-required confirmation.
  }
  if (keyword === "start") {
    await admin
      .from("notification_preferences")
      .update({ sms_opted_out_at: null, sms_enabled: true })
      .eq("user_id", userId)
      .not("sms_consent_at", "is", null);
    await finish({});
    return { handled: true, reason: "opted in" };
  }
  if (keyword === "help") {
    await finish({});
    return { handled: true, reason: "help" }; // Twilio's HELP auto-response applies.
  }

  const { data: prefs } = await admin
    .from("notification_preferences")
    .select("sms_enabled, sms_consent_at, sms_opted_out_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!prefs?.sms_enabled || !prefs.sms_consent_at || prefs.sms_opted_out_at) {
    logWarn("sms", "inbound text ignored: the account hasn't enabled text check-ins", { sid: msg.providerMessageId });
    await finish({ error: "sms not enabled for user" });
    return { handled: false, reason: "not consented" };
  }

  // Replies within 3 hours of a check-in prompt are recorded as check-ins.
  const since = new Date(Date.now() - 3 * 3600_000).toISOString();
  const { data: lastPrompt } = await admin
    .from("notifications")
    .select("kind")
    .eq("user_id", userId)
    .in("kind", ["morning_checkin", "evening_checkin"])
    .in("status", ["sent", "test"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastPrompt) {
    await admin.from("daily_check_ins").upsert(
      {
        user_id: userId,
        check_in_date: localDate(tz),
        kind: lastPrompt.kind === "morning_checkin" ? "morning" : "evening",
        content: body.slice(0, 2000),
        channel: "sms",
      },
      { onConflict: "user_id,check_in_date,kind" },
    );
  }

  const conversation = await getOrCreateSmsConversation(admin, userId);
  const stored = await appendMessage(admin, userId, conversation.id, "user", body, "sms");
  const reply = await generateReply(admin, userId, conversation, "sms", stored.created_at);
  await appendMessage(admin, userId, conversation.id, "assistant", reply, "sms");
  await deliverNotification(admin, { userId, kind: "assistant_reply", body: reply, dedupeKey: `reply:${msg.providerMessageId}` });
  await maybeSummarizeConversation(admin, userId, conversation);
  await finish({});
  return { handled: true };
}
