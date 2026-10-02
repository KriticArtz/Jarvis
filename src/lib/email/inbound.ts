import "server-only";
import type { DB } from "@/lib/data/db";
import { resendConfig } from "@/lib/env";
import { appendMessage, generateReply, getOrCreateEmailConversation } from "@/lib/assistant/conversation";
import { maybeSummarizeConversation } from "@/lib/ai/memory";
import { logWarn } from "@/lib/observability/log";
import type { Conversation } from "@/lib/types/domain";
import { defaultEmailProvider, sendEmail, type EmailDeps } from "./service";
import { extractReplyToken, htmlToText, isStopRequest, parseAddress, stripQuotedReply } from "./parse";
import { replySubject, withConfirmationHint } from "./templates";

/** Metadata from the (signature-verified) webhook. Bodies may be absent — then they're fetched from the provider. */
export interface InboundEmail {
  provider: string;
  emailId: string;
  from: string | null;
  to: string[];
  cc: string[];
  subject: string | null;
  messageId: string | null;
  text?: string | null;
  html?: string | null;
  headers?: Record<string, string>;
}

export interface InboundDeps extends EmailDeps {
  /** Injection point for tests; defaults to the regular tool-enabled assistant reply. */
  reply?: typeof generateReply;
}

export type InboundOutcome = { handled: boolean; reason?: string };

/** Replies to emails older than this aren't accepted (stale or leaked thread). */
export const THREAD_MAX_AGE_DAYS = 30;

function isAutoReply(headers: Record<string, string>): boolean {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]));
  return (
    (h["auto-submitted"] !== undefined && h["auto-submitted"] !== "no") ||
    "x-autoreply" in h ||
    "x-autorespond" in h ||
    ["auto_reply", "bulk", "junk", "list"].includes(h["precedence"] ?? "")
  );
}

/**
 * Two-way email pipeline (called only after the webhook signature is verified):
 *   log delivery (duplicate -> stop) -> reply token -> outbound email (server-side)
 *   -> sender must be that account's auth email -> opted in -> strip quotes
 *   -> same conversation -> assistant turn (tools + confirmations) -> email reply.
 * Nothing in the email body is trusted to say who the user is or which
 * conversation it belongs to.
 */
export async function handleInboundEmail(admin: DB, msg: InboundEmail, deps: InboundDeps = {}): Promise<InboundOutcome> {
  const from = parseAddress(msg.from);
  const { data: logRow, error: logError } = await admin
    .from("email_inbound")
    .insert({ provider: msg.provider, provider_email_id: msg.emailId, from_email: from, subject: msg.subject?.slice(0, 200) ?? null })
    .select("id")
    .single();
  if (logError) {
    if (logError.code === "23505") return { handled: false, reason: "duplicate" };
    throw new Error(`inbound email log failed: ${logError.message}`);
  }
  const finish = async (status: "processed" | "ignored" | "failed", patch: Record<string, unknown> = {}) => {
    await admin
      .from("email_inbound")
      .update({ status, processed_at: new Date().toISOString(), ...patch })
      .eq("id", logRow.id);
  };
  const ignore = async (reason: string): Promise<InboundOutcome> => {
    logWarn("email", `inbound email ignored: ${reason}`, { emailId: msg.emailId });
    await finish("ignored", { error: reason });
    return { handled: false, reason };
  };

  // 1. Which email is this a reply to? Only the opaque token, looked up server-side.
  const token = extractReplyToken([...msg.to, ...msg.cc], resendConfig()?.replyDomain);
  if (!token) return ignore("no reply token");
  const { data: outbound } = await admin
    .from("email_outbound")
    .select("id, user_id, conversation_id, subject, created_at")
    .eq("reply_token", token)
    .maybeSingle();
  if (!outbound) return ignore("unknown thread");
  if (Date.parse(outbound.created_at as string) < Date.now() - THREAD_MAX_AGE_DAYS * 86_400_000) return ignore("thread expired");
  const userId = outbound.user_id as string;

  // 2. The sender must be the account's own (current, confirmed) email address.
  const { data: auth } = await admin.auth.admin.getUserById(userId);
  const accountEmail = auth?.user?.email?.toLowerCase();
  if (!from || !accountEmail || from !== accountEmail || !auth.user?.email_confirmed_at) return ignore("unknown sender");
  await admin.from("email_inbound").update({ user_id: userId, outbound_id: outbound.id }).eq("id", logRow.id);

  // 3. Body: from the signed payload, else fetched from the provider.
  let text = msg.text ?? null;
  let html = msg.html ?? null;
  let headers = msg.headers ?? {};
  if (text == null && html == null) {
    const received = await (deps.provider ?? defaultEmailProvider(deps.mode)).getReceived(msg.emailId);
    if (!received) {
      await finish("failed", { error: "could not fetch email body" });
      return { handled: false, reason: "body unavailable" };
    }
    ({ text, html } = received);
    headers = { ...received.headers, ...headers };
  }
  if (isAutoReply(headers)) return ignore("auto-reply");
  const body = stripQuotedReply(text ?? htmlToText(html ?? ""));
  if (!body) return ignore("empty reply");

  // 4. "STOP" turns email check-ins off; nothing is sent back.
  if (isStopRequest(body)) {
    await admin.from("notification_preferences").update({ email_enabled: false }).eq("user_id", userId);
    await finish("processed", { body });
    return { handled: true, reason: "opted out" };
  }
  const { data: prefs } = await admin.from("notification_preferences").select("email_enabled").eq("user_id", userId).maybeSingle();
  if (!prefs?.email_enabled) return ignore("email not enabled");

  // 5. Continue the same conversation the email belongs to (verified to be this user's).
  let conversation: Conversation | null = null;
  if (outbound.conversation_id) {
    const { data } = await admin
      .from("conversations")
      .select("*")
      .eq("id", outbound.conversation_id)
      .eq("user_id", userId)
      .eq("channel", "email")
      .maybeSingle();
    conversation = data as Conversation | null;
  }
  conversation ??= await getOrCreateEmailConversation(admin, userId);
  await admin.from("email_inbound").update({ conversation_id: conversation.id, body }).eq("id", logRow.id);

  try {
    const stored = await appendMessage(admin, userId, conversation.id, "user", body, "email");
    const reply = await (deps.reply ?? generateReply)(admin, userId, conversation, "email", stored.created_at);
    // A change proposed in this turn waits for the user's OK: say how to give it by email.
    const { count: proposed } = await admin
      .from("assistant_actions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("conversation_id", conversation.id)
      .eq("status", "pending_confirmation")
      .gte("created_at", stored.created_at);
    const finalReply = withConfirmationHint(reply, (proposed ?? 0) > 0);
    await appendMessage(admin, userId, conversation.id, "assistant", finalReply, "email");

    const sent = await sendEmail(
      admin,
      {
        userId,
        kind: "reply",
        subject: replySubject(msg.subject ?? (outbound.subject as string)),
        body: finalReply,
        conversationId: conversation.id,
        dedupeKey: `reply:${logRow.id}`,
        inReplyTo: msg.messageId,
      },
      deps,
    );
    await maybeSummarizeConversation(admin, userId, conversation);
    if (sent.status === "sent" || sent.status === "test" || sent.status === "duplicate") {
      await finish("processed");
      return { handled: true };
    }
    const reason = "error" in sent ? sent.error : "reason" in sent ? sent.reason : sent.status;
    await finish("failed", { error: `reply not delivered: ${reason}`.slice(0, 500) });
    return { handled: false, reason: "reply not delivered" };
  } catch (err) {
    await finish("failed", { error: String((err as Error).message ?? err).slice(0, 500) });
    throw err;
  }
}
