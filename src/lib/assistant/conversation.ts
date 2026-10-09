import "server-only";
import type { DB } from "@/lib/data/db";
import { getRecentMessages } from "@/lib/data/queries";
import { buildChatMessages, demoReply, HISTORY_WINDOW } from "@/lib/ai/chat-messages";
import { getAI, logAIError } from "@/lib/ai/client";
import { runAssistantTurn } from "@/lib/ai/agent";
import type { AssistantContext } from "@/lib/ai/context-types";
import type { ToolContext } from "@/lib/assistant/actions/types";
import { loadAssistantContext } from "@/lib/ai/context";
import type { AssistantChannel } from "@/lib/ai/prompts";
import type { Conversation } from "@/lib/types/domain";

export async function createConversation(db: DB, userId: string, channel: AssistantChannel, title: string | null): Promise<Conversation> {
  const { data, error } = await db
    .from("conversations")
    .insert({ user_id: userId, channel, title: title?.slice(0, 120) ?? null })
    .select("*")
    .single();
  if (error || !data) throw new Error("Could not create conversation");
  return data as Conversation;
}

async function latestConversation(db: DB, userId: string, channel: AssistantChannel): Promise<Conversation | null> {
  const { data } = await db
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .eq("channel", channel)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as Conversation | null;
}

/** The ongoing SMS thread for a user (SMS has no explicit "new chat"). */
export async function getOrCreateSmsConversation(db: DB, userId: string): Promise<Conversation> {
  return (await latestConversation(db, userId, "sms")) ?? createConversation(db, userId, "sms", "Text messages");
}

/** The ongoing email thread for a user: check-ins and replies continue one conversation. */
export async function getOrCreateEmailConversation(db: DB, userId: string): Promise<Conversation> {
  return (await latestConversation(db, userId, "email")) ?? createConversation(db, userId, "email", "Email");
}

export async function appendMessage(
  db: DB,
  userId: string,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  channel: AssistantChannel,
): Promise<{ id: string; created_at: string }> {
  const { data, error } = await db
    .from("conversation_messages")
    .insert({ user_id: userId, conversation_id: conversationId, role, content: content.slice(0, 8000), channel })
    .select("id, created_at")
    .single();
  if (error || !data) throw new Error("Could not save message");
  // Bump updated_at for ordering.
  await db.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).eq("user_id", userId);
  return data as { id: string; created_at: string };
}

/**
 * Prepare model input for a conversation whose latest user message is
 * already stored.
 */
export async function prepareReply(db: DB, userId: string, conversation: Conversation, channel: AssistantChannel, opts: { focusTaskId?: string | null } = {}) {
  const app = channel === "app";
  const [{ context }, history, focus] = await Promise.all([
    // In the app, a new conversation also knows what was changed earlier today, and the money summary.
    loadAssistantContext(db, userId, { excludeConversationId: conversation.id, includeChangesToday: app, includeMoney: app }),
    getRecentMessages(db, userId, conversation.id, HISTORY_WINDOW),
    app && opts.focusTaskId ? focusNote(db, userId, opts.focusTaskId) : Promise.resolve(null),
  ]);
  const messages = buildChatMessages({
    context,
    channel,
    conversationSummary: conversation.summary,
    history,
    tools: Boolean(getAI()),
  });
  // Placed just before the user's latest message, so it reads as "about this".
  if (focus) messages.splice(Math.max(messages.length - 1, 0), 0, { role: "system", content: focus });
  return { messages, context };
}

/**
 * The task the user acted on in Today ("Move it"), so the assistant knows
 * exactly which item they mean. Only the user's own task is ever described.
 */
async function focusNote(db: DB, userId: string, taskId: string): Promise<string | null> {
  const { data: t } = await db
    .from("tasks")
    .select("id, title, task_date, scheduled_start, duration_minutes, status")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!t) return null;
  const when = `${t.task_date}${t.scheduled_start ? ` at ${String(t.scheduled_start).slice(0, 5)}` : ""}`;
  return `# What the user is acting on\nThey came from the Today screen about this task: “${t.title}” (task id: ${t.id}; ${when}; ${t.duration_minutes ? `${t.duration_minutes} min; ` : ""}status: ${t.status}). Their message below is about this task.`;
}

/**
 * Server-side context for assistant actions. `userId` is the authenticated
 * user (app) or the verified SMS sender — never a value from the model.
 */
export function buildToolContext(
  db: DB,
  userId: string,
  conversation: Conversation,
  channel: AssistantChannel,
  context: AssistantContext,
  turnStartedAt: string,
): ToolContext {
  return { db, userId, timezone: context.now.timezone, today: context.now.date, channel, conversationId: conversation.id, turnStartedAt };
}

/**
 * Non-streaming reply (SMS, email), with the same actions as in-app chat. Falls back
 * to an honest demo reply without AI.
 */
export async function generateReply(
  db: DB,
  userId: string,
  conversation: Conversation,
  channel: AssistantChannel,
  turnStartedAt: string,
): Promise<string> {
  const { messages, context } = await prepareReply(db, userId, conversation, channel);
  if (!getAI()) return demoReply(context);
  try {
    const outcome = await runAssistantTurn({
      messages,
      ctx: buildToolContext(db, userId, conversation, channel, context, turnStartedAt),
      meta: { userId, feature: channel === "sms" ? "sms_reply" : channel === "email" ? "email_reply" : "chat" },
      stream: false,
      maxOutputTokens: channel === "sms" ? 400 : channel === "email" ? 1000 : 2000,
    });
    return outcome.text;
  } catch (err) {
    logAIError("generateReply", err);
    return "Sorry — I couldn't generate a reply just now. Please try again in a minute.";
  }
}
