import "server-only";
import type { DB } from "@/lib/data/db";
import { getRecentMessages } from "@/lib/data/queries";
import { loadAssistantContext } from "@/lib/ai/context";
import { buildChatMessages, HISTORY_WINDOW } from "@/lib/ai/chat-messages";
import type { AssistantContext } from "@/lib/ai/context-types";
import { completeJSON } from "@/lib/ai/chat";
import { getOrCreateEmailConversation } from "@/lib/assistant/conversation";
import type { Conversation } from "@/lib/types/domain";
import { emailEligibility, sendEmail, type EmailDeps, type SendEmailOutcome } from "./service";
import { fallbackCheckIn, type CheckInDraft } from "./templates";

/**
 * Proactive accountability check-in by email — the foundation future
 * scheduling builds on (cron, the user's preferred times, missed-plan
 * detection). Today it's only triggered manually ("Send me a test check-in").
 *
 *   verify opted in -> gather context (same brain as chat/SMS)
 *   -> draft a short check-in -> send -> record in the email conversation.
 */
export interface CheckInContext {
  /** Why we're checking in, e.g. "missed workout" — steers the draft. Server-provided only. */
  reason?: string;
  /** "test" for the Settings button; scheduled check-ins use "check_in". */
  kind?: "check_in" | "test";
  /** Unique per user; defaults to one per kind per minute (no double-sends). */
  dedupeKey?: string;
}

export interface CheckInDeps extends EmailDeps {
  /** Injection point for tests (skips the model). */
  draft?: (context: AssistantContext) => Promise<CheckInDraft>;
}

const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "body"],
  properties: {
    subject: { type: "string", description: "Short, conversational subject, under 50 characters. No emoji." },
    body: { type: "string", description: "The email body: plain text, at most 3 short paragraphs, under 90 words." },
  },
};

async function draftCheckIn(db: DB, userId: string, context: AssistantContext, conversation: Conversation, reason: string | undefined): Promise<CheckInDraft> {
  const history = await getRecentMessages(db, userId, conversation.id, HISTORY_WINDOW);
  const messages = buildChatMessages({ context, channel: "email", conversationSummary: conversation.summary, history, tools: false });
  messages.push({
    role: "system",
    content: `Write a proactive check-in email to the user now, in your own voice and personality. ${
      reason ? `Reason for checking in: ${reason.slice(0, 200)}.` : "Pick the most useful thing to check in about from their plan for today (e.g. the next open priority task) — or ask how the day is going if nothing is planned."
    } Be specific to their actual plan, warm and brief: a subject like "Still on for tonight?" and a body like "Hey — you planned to spend 30 minutes on your project tonight. Still happening? Just reply to this email. If the plan changed, that's okay — we'll figure out what works now." Invite them to just reply. Don't sign off (the email adds your name). Don't invent anything that isn't in the context.`,
  });
  const draft = await completeJSON<CheckInDraft>(messages, "email_check_in", DRAFT_SCHEMA, { userId, feature: "email_check_in" }, 800);
  if (draft?.subject?.trim() && draft.body?.trim()) return { subject: draft.subject.trim(), body: draft.body.trim() };
  return fallbackCheckIn(context.today.tasks, context.now.time);
}

export async function sendAccountabilityCheckIn(admin: DB, userId: string, context: CheckInContext = {}, deps: CheckInDeps = {}): Promise<SendEmailOutcome> {
  // Check before spending a model call.
  const eligible = await emailEligibility(admin, userId);
  if (!eligible.ok) return { status: "skipped", reason: eligible.reason };

  const kind = context.kind ?? "check_in";
  const conversation = await getOrCreateEmailConversation(admin, userId);
  const { context: assistantContext } = await loadAssistantContext(admin, userId, { excludeConversationId: conversation.id });
  const draft = deps.draft ? await deps.draft(assistantContext) : await draftCheckIn(admin, userId, assistantContext, conversation, context.reason);

  return sendEmail(
    admin,
    {
      userId,
      kind,
      subject: draft.subject,
      body: draft.body,
      conversationId: conversation.id,
      dedupeKey: context.dedupeKey ?? `${kind}:${new Date().toISOString().slice(0, 16)}`,
      recordInConversation: true,
    },
    deps,
  );
}
