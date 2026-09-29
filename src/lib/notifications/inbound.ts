import "server-only";
import type { DB } from "@/lib/data/db";
import { appendMessage, generateReply, getOrCreateSmsConversation } from "@/lib/assistant/conversation";
import { maybeSummarizeConversation } from "@/lib/ai/memory";
import { localDate } from "@/lib/time";
import { detectKeyword } from "./keywords";
import { deliverNotification } from "./service";

export interface InboundSms {
  provider: string;
  providerMessageId: string;
  from: string;
  body: string;
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

  const { data: matches } = await admin.from("profiles").select("id, timezone").eq("phone", msg.from).limit(2);
  if (!matches || matches.length !== 1) {
    await finish({ error: matches?.length ? "ambiguous phone" : "unknown phone" });
    return { handled: false, reason: "unidentified sender" };
  }
  const userId = matches[0].id as string;
  const tz = (matches[0].timezone as string) || "UTC";
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
  await appendMessage(admin, userId, conversation.id, "user", body, "sms");
  const reply = await generateReply(admin, userId, conversation, "sms");
  await appendMessage(admin, userId, conversation.id, "assistant", reply, "sms");
  await deliverNotification(admin, { userId, kind: "assistant_reply", body: reply, dedupeKey: `reply:${msg.providerMessageId}` });
  await maybeSummarizeConversation(admin, userId, conversation);
  await finish({});
  return { handled: true };
}
