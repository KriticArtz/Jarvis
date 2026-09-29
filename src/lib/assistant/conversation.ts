import "server-only";
import type { DB } from "@/lib/data/db";
import { getRecentMessages } from "@/lib/data/queries";
import { buildChatMessages, demoReply, HISTORY_WINDOW } from "@/lib/ai/chat-messages";
import { completeReply } from "@/lib/ai/chat";
import { getAI } from "@/lib/ai/client";
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

/** The ongoing SMS thread for a user (SMS has no explicit "new chat"). */
export async function getOrCreateSmsConversation(db: DB, userId: string): Promise<Conversation> {
  const { data } = await db
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .eq("channel", "sms")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Conversation | null) ?? createConversation(db, userId, "sms", "Text messages");
}

export async function appendMessage(
  db: DB,
  userId: string,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  channel: AssistantChannel,
) {
  const { error } = await db
    .from("conversation_messages")
    .insert({ user_id: userId, conversation_id: conversationId, role, content: content.slice(0, 8000), channel });
  if (error) throw new Error("Could not save message");
  // Bump updated_at for ordering.
  await db.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).eq("user_id", userId);
}

/**
 * Prepare model input for a conversation whose latest user message is
 * already stored.
 */
export async function prepareReply(db: DB, userId: string, conversation: Conversation, channel: AssistantChannel) {
  const [{ context, profile }, history] = await Promise.all([
    loadAssistantContext(db, userId, { excludeConversationId: conversation.id }),
    getRecentMessages(db, userId, conversation.id, HISTORY_WINDOW),
  ]);
  const messages = buildChatMessages({
    context,
    style: profile.accountability_style,
    channel,
    conversationSummary: conversation.summary,
    history,
  });
  return { messages, context };
}

/** Non-streaming reply (SMS). Falls back to an honest demo reply without AI. */
export async function generateReply(db: DB, userId: string, conversation: Conversation, channel: AssistantChannel): Promise<string> {
  const { messages, context } = await prepareReply(db, userId, conversation, channel);
  if (!getAI()) return demoReply(context);
  return (
    (await completeReply(messages, channel === "sms" ? 400 : 2000)) ??
    "Sorry — I couldn't generate a reply just now. Please try again in a minute."
  );
}
