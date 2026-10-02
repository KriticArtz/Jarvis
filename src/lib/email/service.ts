import "server-only";
import { randomBytes } from "node:crypto";
import type { DB } from "@/lib/data/db";
import { appUrl, emailMode, resendConfig, type EmailMode } from "@/lib/env";
import { PERSONA_COLUMNS, personaFrom } from "@/lib/personalization";
import { appendMessage } from "@/lib/assistant/conversation";
import { logWarn } from "@/lib/observability/log";
import { ResendEmailProvider } from "./providers/resend-provider";
import { TestEmailProvider } from "./providers/test-provider";
import type { EmailProvider } from "./providers/types";
import { cleanSubject, fromWithName, renderEmail, replyAddress } from "./templates";
import { safeMessageId } from "./parse";

/**
 * Outbound email: the single path every Jarvis email goes through.
 *   eligibility (opted in, confirmed auth email, not a demo account, daily cap)
 *   -> record (unique dedupe key = no duplicate sends) -> send -> status.
 * The recipient is ALWAYS the account's own auth email, looked up here —
 * callers can't pass an address.
 */

export type EmailKind = "check_in" | "reply" | "test";

export interface EmailDeps {
  provider?: EmailProvider;
  mode?: EmailMode;
}

/** Hard cap on replies per day: protects against auto-responder loops. */
export const REPLY_DAILY_CAP = 30;
/** Placeholders used in test mode, never for real delivery. */
const TEST_FROM = "Jarvis <jarvis@example.invalid>";
const TEST_REPLY_DOMAIN = "reply.example.invalid";

const testProvider = new TestEmailProvider();

export function defaultEmailProvider(mode: EmailMode = emailMode()): EmailProvider {
  const cfg = resendConfig();
  return mode === "live" && cfg ? new ResendEmailProvider(cfg.apiKey) : testProvider;
}

export function newReplyToken(): string {
  return randomBytes(20).toString("hex");
}

export type Eligibility = { ok: true; email: string; dailyLimit: number } | { ok: false; reason: string };

/** Whether this user can receive email check-ins right now (server-side truth). */
export async function emailEligibility(admin: DB, userId: string): Promise<Eligibility> {
  const { data: prefs } = await admin.from("notification_preferences").select("email_enabled, email_daily_limit").eq("user_id", userId).maybeSingle();
  if (!prefs?.email_enabled) return { ok: false, reason: "Email check-ins are turned off." };
  const { data, error } = await admin.auth.admin.getUserById(userId);
  const user = data?.user;
  if (error || !user) return { ok: false, reason: "Account not found." };
  if (user.is_anonymous) return { ok: false, reason: "Email isn't available in the demo." };
  if (!user.email || !user.email_confirmed_at) return { ok: false, reason: "Confirm your email address first." };
  return { ok: true, email: user.email.toLowerCase(), dailyLimit: Number(prefs.email_daily_limit) || 6 };
}

export type SendEmailOutcome =
  | { status: "sent" | "test"; id: string }
  | { status: "failed"; id: string; error: string }
  | { status: "skipped"; reason: string }
  | { status: "duplicate" };

export interface SendEmailInput {
  userId: string;
  kind: EmailKind;
  subject: string;
  body: string;
  conversationId: string | null;
  /** Unique per user: the same key never sends twice. */
  dedupeKey: string;
  /** Message-ID of the email being answered (threads the reply in the user's inbox). */
  inReplyTo?: string | null;
  /** Append the email to its conversation once it went out (check-ins). Replies are stored by the caller. */
  recordInConversation?: boolean;
}

async function sentInLastDay(admin: DB, userId: string, kinds: EmailKind[]): Promise<number> {
  const { count } = await admin
    .from("email_outbound")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("kind", kinds)
    .in("status", ["queued", "sent", "test"])
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  return count ?? 0;
}

export async function sendEmail(admin: DB, input: SendEmailInput, deps: EmailDeps = {}): Promise<SendEmailOutcome> {
  const mode = deps.mode ?? emailMode();
  if (mode === "disabled") return { status: "skipped", reason: "Email is disabled on this server." };
  const eligible = await emailEligibility(admin, input.userId);
  if (!eligible.ok) return { status: "skipped", reason: eligible.reason };

  const proactive = input.kind !== "reply";
  const used = await sentInLastDay(admin, input.userId, proactive ? ["check_in", "test"] : ["reply"]);
  if (used >= (proactive ? eligible.dailyLimit : REPLY_DAILY_CAP)) {
    return { status: "skipped", reason: proactive ? "Daily email limit reached — try again tomorrow." : "Daily reply limit reached." };
  }

  const { data: profile } = await admin.from("profiles").select(PERSONA_COLUMNS).eq("id", input.userId).maybeSingle();
  const persona = personaFrom(profile);
  const cfg = resendConfig();
  const provider = deps.provider ?? defaultEmailProvider(mode);
  const token = newReplyToken();
  const subject = cleanSubject(input.subject);
  const body = input.body.trim().slice(0, 6000);

  const { data: row, error } = await admin
    .from("email_outbound")
    .insert({
      user_id: input.userId,
      conversation_id: input.conversationId,
      kind: input.kind,
      to_email: eligible.email,
      subject,
      body,
      reply_token: token,
      dedupe_key: input.dedupeKey.slice(0, 200),
      provider: provider.name,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { status: "duplicate" };
    throw new Error(`email record failed: ${error.message}`);
  }

  const unsubscribeUrl = `${appUrl() ?? "http://localhost:3000"}/api/email/unsubscribe?t=${token}`;
  const rendered = renderEmail({ assistantName: persona.name, body, unsubscribeUrl });
  const headers: Record<string, string> = {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    // RFC 3834: tells auto-responders not to answer (prevents mail loops).
    "Auto-Submitted": "auto-generated",
  };
  const parent = safeMessageId(input.inReplyTo);
  if (parent) {
    headers["In-Reply-To"] = parent;
    headers.References = parent;
  }

  const result = await provider.send({
    from: fromWithName(cfg?.from ?? TEST_FROM, persona.name),
    to: eligible.email,
    replyTo: replyAddress(token, cfg?.replyDomain ?? TEST_REPLY_DOMAIN),
    subject,
    text: rendered.text,
    html: rendered.html,
    headers,
    idempotencyKey: row.id as string,
  });

  if (!result.ok) {
    await admin.from("email_outbound").update({ status: "failed", error: result.error.slice(0, 500) }).eq("id", row.id);
    logWarn("email", "send failed", { kind: input.kind, error: result.error });
    return { status: "failed", id: row.id as string, error: result.error };
  }
  const status = provider.delivers ? "sent" : "test";
  await admin
    .from("email_outbound")
    .update({ status, provider_message_id: result.providerMessageId, sent_at: provider.delivers ? new Date().toISOString() : null })
    .eq("id", row.id);
  if (input.recordInConversation && input.conversationId) {
    await appendMessage(admin, input.userId, input.conversationId, "assistant", body, "email");
  }
  return { status, id: row.id as string };
}
