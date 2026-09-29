import "server-only";
import type { DB } from "@/lib/data/db";
import type { Conversation } from "@/lib/types/domain";
import { HISTORY_WINDOW } from "./chat-messages";
import { completeReply } from "./chat";

const SUMMARIZE_AFTER = 8; // unsummarized messages outside the window

/**
 * Rolling conversation memory: once enough messages have scrolled out of the
 * context window, fold them into `conversations.summary`. Future versions can
 * extend this to extract durable facts into `user_memories`.
 */
export async function maybeSummarizeConversation(db: DB, userId: string, conversation: Conversation): Promise<void> {
  const { data, error } = await db
    .from("conversation_messages")
    .select("role, content, created_at")
    .eq("user_id", userId)
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true });
  if (error || !data) return;

  const outside = data.slice(0, Math.max(0, data.length - HISTORY_WINDOW));
  const unsummarized = conversation.summarized_through
    ? outside.filter((m) => m.created_at > conversation.summarized_through!)
    : outside;
  if (unsummarized.length < SUMMARIZE_AFTER) return;

  const transcript = unsummarized.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n").slice(0, 12000);
  const summary = await completeReply(
    [
      {
        role: "system",
        content:
          "Summarize this conversation between a user and their accountability assistant in at most 5 short bullet points. Keep decisions, commitments the user made, plans, obstacles and preferences. Do not add anything that isn't in the text.",
      },
      {
        role: "user",
        content: `${conversation.summary ? `Existing summary:\n${conversation.summary}\n\n` : ""}New messages:\n${transcript}`,
      },
    ],
    600,
  );
  if (!summary) return;

  await db
    .from("conversations")
    .update({ summary: summary.slice(0, 2000), summarized_through: unsummarized[unsummarized.length - 1].created_at })
    .eq("id", conversation.id)
    .eq("user_id", userId);
}
