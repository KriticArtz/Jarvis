import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { brand } from "@/config/brand";
import { requireOnboardedUser } from "@/lib/auth";
import { isAIConfigured } from "@/lib/ai/client";
import { getConversation, getConversations, getRecentMessages } from "@/lib/data/queries";
import { uuid } from "@/lib/validation/schemas";
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

  return (
    <div className="flex flex-col">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{brand.assistantName}</h1>
          {current?.title ? <p className="truncate text-sm text-muted">{current.channel === "sms" ? "Text message thread" : current.title}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {conversations.length ? (
            <details className="relative">
              <summary className={cn(buttonClass("secondary", "sm"), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>History</summary>
              <ul className="absolute right-0 z-20 mt-2 max-h-80 w-72 overflow-auto rounded-xl border border-border bg-surface py-1 shadow-lg">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <Link href={`/assistant?c=${c.id}`} className={cn("block truncate px-4 py-2.5 text-sm hover:bg-surface-2", c.id === current?.id && "font-semibold text-accent")}>
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
        initialMessages={messages.map((m) => ({ id: m.id, role: m.role, content: m.content }))}
        name={profile.display_name}
        aiConfigured={isAIConfigured()}
      />
    </div>
  );
}
