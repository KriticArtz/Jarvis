import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { brand } from "@/config/brand";
import { requireOnboardedUser } from "@/lib/auth";
import { isAIConfigured } from "@/lib/ai/client";
import { getConversation, getConversations, getRecentMessages } from "@/lib/data/queries";
import { uuid } from "@/lib/validation/schemas";
import { attachActions, type StoredAction } from "@/lib/assistant/history";
import { buttonClass } from "@/components/ui/button";
import { Chat } from "@/components/assistant/chat";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Assistant" };

export default async function AssistantPage({ searchParams }: PageProps<"/assistant">) {
  const { supabase, userId, profile } = await requireOnboardedUser();
  const params = await searchParams;
  const requested = typeof params.c === "string" && uuid.safeParse(params.c).success ? params.c : null;

  const [conversations, current] = await Promise.all([
    getConversations(supabase, userId, 15),
    requested ? getConversation(supabase, userId, requested) : Promise.resolve(null),
  ]);
  const messages = current ? await getRecentMessages(supabase, userId, current.id, 100) : [];
  const { data: loggedActions } = current
    ? await supabase
        .from("assistant_actions")
        .select("id, status, summary, created_at, resolved_at")
        .eq("user_id", userId)
        .eq("conversation_id", current.id)
        .order("created_at")
        .limit(200)
    : { data: [] };
  const actionsByMessage = attachActions(messages, (loggedActions ?? []) as StoredAction[]);

  return (
    <div className="flex flex-col">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[32px] font-bold leading-tight">{brand.assistantName}</h1>
          {current?.title ? <p className="truncate text-sm text-muted">{current.channel === "sms" ? "Text message thread" : current.title}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {conversations.length ? (
            <details className="relative">
              <summary className={cn(buttonClass("secondary", "sm"), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>History</summary>
              <ul className="absolute right-0 z-20 mt-2 max-h-80 w-72 animate-fade-in overflow-auto rounded-2xl bg-surface p-1 shadow-lift">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <Link href={`/assistant?c=${c.id}`} className={cn("block truncate rounded-xl px-3.5 py-2.5 text-sm hover:bg-surface-2", c.id === current?.id && "font-semibold text-accent")}>
                      {c.channel === "sms" ? "📱 Text messages" : c.title || "Conversation"}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <Link href="/assistant" className={buttonClass("secondary", "sm")} aria-label="New conversation">
            <Plus className="size-4" /> New
          </Link>
        </div>
      </header>
      <Chat
        key={current?.id ?? "new"}
        conversationId={current?.id ?? null}
        initialMessages={messages.map((m) => ({ id: m.id, role: m.role, content: m.content, actions: actionsByMessage.get(m.id) }))}
        name={profile.display_name}
        aiConfigured={isAIConfigured()}
      />
    </div>
  );
}
