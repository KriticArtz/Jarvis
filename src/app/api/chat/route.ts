import { after, NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { appendMessage, buildToolContext, createConversation, prepareReply } from "@/lib/assistant/conversation";
import { demoReply } from "@/lib/ai/chat-messages";
import { runAssistantTurn } from "@/lib/ai/agent";
import { getAI, logAIError } from "@/lib/ai/client";
import { maybeSummarizeConversation } from "@/lib/ai/memory";
import { getConversation } from "@/lib/data/queries";
import { chatRequestSchema } from "@/lib/validation/schemas";
import { DEMO_LIMITS } from "@/lib/demo/seed";

export const maxDuration = 60;

const RATE_LIMIT_PER_MINUTE = 12;

/**
 * Send a message to the assistant. Streams newline-delimited JSON events —
 * {"t":"text","v":"…"} for reply text and {"t":"action",…} for actions the
 * assistant takes — and persists both messages. The conversation id is
 * returned in a header.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase, userId, isDemo } = session;

  const body = await request.json().catch(() => null);
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from("conversation_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", since);
  if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return NextResponse.json({ error: "You're sending messages quickly — give it a few seconds." }, { status: 429 });
  }

  if (isDemo) {
    const { count: total } = await supabase
      .from("conversation_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("role", "user");
    if ((total ?? 0) >= DEMO_LIMITS.chatMessages) {
      return NextResponse.json({ error: "You've reached the demo's message limit. Create your own LifePilot to keep chatting." }, { status: 429 });
    }
  }

  let conversation = parsed.data.conversationId ? await getConversation(supabase, userId, parsed.data.conversationId) : null;
  if (parsed.data.conversationId && !conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  if (!conversation) conversation = await createConversation(supabase, userId, "app", parsed.data.message.slice(0, 60));

  const userMessage = await appendMessage(supabase, userId, conversation.id, "user", parsed.data.message, "app");
  const { messages, context } = await prepareReply(supabase, userId, conversation, "app");
  const conv = conversation;
  const headers = {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Conversation-Id": conv.id,
    "X-AI-Mode": getAI() ? "live" : "demo",
  };

  const encoder = new TextEncoder();
  const line = (event: Record<string, unknown>) => encoder.encode(`${JSON.stringify(event)}\n`);

  if (!getAI()) {
    const text = demoReply(context);
    await appendMessage(supabase, userId, conv.id, "assistant", text, "app");
    return new Response(line({ t: "text", v: text }), { headers });
  }

  const ctx = buildToolContext(supabase, userId, conv, "app", context, userMessage.created_at);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      let streamed = "";
      try {
        const outcome = await runAssistantTurn({
          messages,
          ctx,
          meta: { userId, feature: "chat" },
          stream: true,
          maxOutputTokens: 2000,
          onEvent(event) {
            if (event.type === "text") {
              streamed += event.delta;
              controller.enqueue(line({ t: "text", v: event.delta }));
            }
            else controller.enqueue(line({ t: "action", id: event.callId, status: event.status, label: event.label }));
          },
        });
        full = outcome.text;
      } catch (err) {
        logAIError("chat turn", err);
        const note = "Sorry — I couldn't finish that just now. Please try again in a moment.";
        full = streamed ? `${streamed}\n\n${note}` : note;
        controller.enqueue(line({ t: "text", v: streamed ? `\n\n${note}` : note }));
      }
      try {
        await appendMessage(supabase, userId, conv.id, "assistant", full || "(no reply)", "app");
      } catch {
        // The user still saw the reply; failing to persist it is logged by the data layer.
      }
      controller.close();
    },
  });

  after(async () => {
    try {
      await maybeSummarizeConversation(supabase, userId, conv);
    } catch (err) {
      logAIError("summarize", err);
    }
  });

  return new Response(stream, { headers });
}
