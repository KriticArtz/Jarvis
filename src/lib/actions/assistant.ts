"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { appendMessage } from "@/lib/assistant/conversation";
import { runTool } from "@/lib/assistant/actions/registry";
import type { ToolContext } from "@/lib/assistant/actions/types";
import { getConversation } from "@/lib/data/queries";
import { localDate } from "@/lib/time";
import { uuid } from "@/lib/validation/schemas";
import { errorInfo, logError } from "@/lib/observability/log";

const answerSchema = z.object({
  conversationId: uuid,
  confirmationId: uuid,
  decision: z.enum(["confirm", "decline"]),
});

export interface ProposalAnswer {
  ok: boolean;
  /** Outcome of the change (shown as the action chip and the assistant's reply). */
  status: "succeeded" | "failed";
  message: string;
}

/**
 * Answer a pending proposal with the Confirm / Cancel buttons in the chat.
 * This is the SAME confirmation path as replying "yes" to the assistant: it
 * runs the confirm_action / decline_action tool for the signed-in user, in
 * the proposal's conversation, as a new (later) turn — so the existing rules
 * still apply (same user, same conversation, not expired, runs once).
 */
export async function answerProposal(input: { conversationId: string; confirmationId: string; decision: "confirm" | "decline" }): Promise<ProposalAnswer> {
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, status: "failed", message: "I couldn't find that pending change." };
  const session = await getSessionUser();
  if (!session) return { ok: false, status: "failed", message: "Your session has expired. Please log in again." };
  const { supabase, userId } = session;
  const { conversationId, confirmationId, decision } = parsed.data;

  try {
    const conversation = await getConversation(supabase, userId, conversationId);
    if (!conversation) return { ok: false, status: "failed", message: "I couldn't find that conversation." };
    const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle();
    const timezone = (profile?.timezone as string | undefined) || "UTC";

    // The button press is the user's reply; storing it first makes this a later turn than the proposal.
    const userMessage = await appendMessage(supabase, userId, conversation.id, "user", decision === "confirm" ? "Yes, go ahead." : "No, cancel that.", "app");
    const ctx: ToolContext = {
      db: supabase,
      userId,
      timezone,
      today: localDate(timezone),
      channel: "app",
      conversationId: conversation.id,
      turnStartedAt: userMessage.created_at,
    };
    const result = await runTool(ctx, decision === "confirm" ? "confirm_action" : "decline_action", JSON.stringify({ confirmation_id: confirmationId }));
    const status = result.status === "succeeded" ? "succeeded" : "failed";
    await appendMessage(supabase, userId, conversation.id, "assistant", result.message, "app");
    revalidatePath("/", "layout");
    return { ok: status === "succeeded", status, message: result.message };
  } catch (err) {
    logError("assistant", "answer proposal failed", errorInfo(err));
    return { ok: false, status: "failed", message: "Something went wrong on my side, so I didn't make that change." };
  }
}
