import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import { isAIConfigured } from "@/lib/ai/client";
import { loadAssistantContext } from "@/lib/ai/context";
import { getConversation, getConversations, getRecentMessages } from "@/lib/data/queries";
import { uuid } from "@/lib/validation/schemas";
import { attachActions, STORED_ACTION_COLUMNS, type StoredAction } from "@/lib/assistant/history";
import { buildOpening } from "@/lib/assistant/opening";
import { activeConversationToday } from "@/lib/assistant/active";
import { localDate, zonedParts } from "@/lib/time";
import { Chat } from "@/components/assistant/chat";
import type { ConversationSummary } from "@/components/assistant/history-sheet";
import { PERSONALITY_OPTIONS, resolvePersonalization } from "@/lib/personalization";

export const metadata: Metadata = { title: "Assistant" };

function when(iso: string, tz: string): string {
  const d = new Date(iso);
  const today = localDate(tz);
  const p = zonedParts(d, tz);
  const day = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  const time = d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  if (day === today) return `Today, ${time}`;
  return d.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" });
}

export default async function AssistantPage({ searchParams }: PageProps<"/assistant">) {
  const { supabase, userId, profile, isDemo } = await requireOnboardedUser();
  const params = await searchParams;
  const requested = typeof params.c === "string" && uuid.safeParse(params.c).success ? params.c : null;
  /** "New conversation" — the only way to start fresh while today's conversation exists. */
  const fresh = params.new === "1";
  // A question from Today (Ask / Move it) is sent into the conversation it opens.
  const prompt = typeof params.q === "string" ? params.q.trim().slice(0, 4000) || null : null;
  const focusTaskId = typeof params.task === "string" && uuid.safeParse(params.task).success ? params.task : null;
  const { personality } = resolvePersonalization(profile);
  const personalityTitle = PERSONALITY_OPTIONS.find((p) => p.value === personality)?.title ?? "";
  const tz = profile.timezone || "UTC";

  // Opening the Assistant resumes today's conversation (see activeConversationToday).
  if (!requested && !fresh) {
    const active = await activeConversationToday(supabase, userId, tz);
    if (active) {
      const next = new URLSearchParams({ c: active.id });
      if (prompt) next.set("q", prompt);
      if (focusTaskId) next.set("task", focusTaskId);
      redirect(`/assistant?${next.toString()}`);
    }
  }

  const [conversations, current] = await Promise.all([
    getConversations(supabase, userId, 30),
    requested ? getConversation(supabase, userId, requested) : Promise.resolve(null),
  ]);
  const messages = current ? await getRecentMessages(supabase, userId, current.id, 100) : [];
  const { data: loggedActions } = current
    ? await supabase
        .from("assistant_actions")
        .select(STORED_ACTION_COLUMNS)
        .eq("user_id", userId)
        .eq("conversation_id", current.id)
        .order("created_at")
        .limit(200)
    : { data: [] };
  const actionsByMessage = attachActions(messages, (loggedActions ?? []) as StoredAction[]);

  // A new conversation opens on the user's real day — the same context the assistant reasons over.
  const opening = current || prompt ? null : buildOpening((await loadAssistantContext(supabase, userId)).context);

  const summaries: ConversationSummary[] = conversations.map((c) => ({
    id: c.id,
    title: c.channel === "sms" ? "Text messages" : c.channel === "email" ? "Email check-ins" : c.title || "Conversation",
    channel: c.channel,
    when: when(c.updated_at, tz),
  }));
  const subtitle = current ? (summaries.find((s) => s.id === current.id)?.title ?? "Conversation") : `${personalityTitle} · your accountability partner`;

  return (
    <Chat
      key={current?.id ?? (fresh ? "fresh" : "new")}
      conversationId={current?.id ?? null}
      initialMessages={messages.map((m) => ({ id: m.id, role: m.role, content: m.content, actions: actionsByMessage.get(m.id) }))}
      firstName={profile.display_name?.trim().split(/\s+/)[0] ?? null}
      aiConfigured={isAIConfigured()}
      initialPrompt={prompt}
      focusTaskId={prompt ? focusTaskId : null}
      opening={opening}
      subtitle={subtitle}
      conversations={summaries}
      today={localDate(tz)}
      belowBanner={isDemo}
    />
  );
}
