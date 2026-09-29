"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { brand } from "@/config/brand";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/spinner";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "I only have two hours tonight. What should I do?",
  "Help me plan the rest of my day.",
  "Break my top goal into next steps.",
  "How am I doing this week?",
];

export function Chat({
  conversationId: initialId,
  initialMessages,
  name,
  aiConfigured,
}: {
  conversationId: string | null;
  initialMessages: ChatMessage[];
  name: string | null;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState(initialId);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || streaming) return;
    setError(null);
    setInput("");
    setStreaming(true);
    const userMsg: ChatMessage = { id: `u-${messages.length}`, role: "user", content: message };
    const assistantId = `a-${messages.length}`;
    setMessages((m) => [...m, userMsg, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Something went wrong. Please try again.");
      }
      const newId = res.headers.get("X-Conversation-Id");
      if (newId && newId !== conversationId) {
        setConversationId(newId);
        window.history.replaceState(null, "", `/assistant?c=${newId}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => m.map((msg) => (msg.id === assistantId ? { ...msg, content: acc } : msg)));
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setMessages((m) => m.filter((msg) => msg.id !== assistantId || msg.content));
      setInput(message);
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-15rem)] flex-col md:min-h-[calc(100dvh-12rem)]">
      <div className="flex-1" aria-live="polite">
        {messages.length === 0 ? (
          <div className="animate-fade-in py-6">
            <h2 className="text-xl font-semibold tracking-tight">{name ? `Hi ${name}, what's on your mind?` : "What's on your mind?"}</h2>
            <p className="mt-1 text-muted">I know your goals, schedule and today&apos;s plan. Ask me to plan, prioritize or reflect.</p>
            {!aiConfigured ? (
              <p className="mt-4 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
                Demo mode: no OpenAI API key is configured, so replies only summarize your data.
              </p>
            ) : null}
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm transition-colors hover:border-accent hover:bg-accent-soft">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="flex flex-col gap-4 pb-4">
            {messages.map((m) => (
              <li key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed",
                    m.role === "user" ? "rounded-br-md bg-accent text-accent-foreground" : "rounded-bl-md border border-border bg-surface",
                  )}
                >
                  {m.role === "assistant" && !m.content ? (
                    <span className="inline-flex items-center gap-2 text-muted">
                      <Spinner /> Thinking…
                    </span>
                  ) : (
                    m.content
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-20 z-10 bg-background pb-2 pt-2 md:bottom-0 md:pb-4">
        {error ? (
          <p role="alert" className="mb-2 rounded-xl bg-danger-soft px-3.5 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-sm focus-within:border-accent focus-within:ring-4 focus-within:ring-ring"
        >
          <label htmlFor="chat-input" className="sr-only">
            Message {brand.assistantName}
          </label>
          <textarea
            id="chat-input"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder={`Message ${brand.assistantName}…`}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] focus:outline-none"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-opacity disabled:opacity-40"
            aria-label="Send message"
          >
            {streaming ? <Spinner /> : <ArrowUp className="size-5" />}
          </button>
        </form>
      </div>
    </div>
  );
}
