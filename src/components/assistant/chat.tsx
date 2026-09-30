"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/spinner";
import { applyActionEvent, parseStreamChunk, type ChatAction } from "@/lib/assistant/stream-protocol";
import { ActionChips } from "./action-chips";
import { usePersonalization } from "@/components/app/personalization";
import { AssistantAvatar } from "@/components/app/assistant-avatar";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: ChatAction[];
}

const SUGGESTIONS = [
  "I only have two hours tonight. What should I do?",
  "Help me plan the rest of my day.",
  "I finished my workout.",
  "How am I doing this week?",
];

/** Marks the chat composer as focused so the mobile tab bar steps aside for the keyboard. */
function setComposerFocus(focused: boolean) {
  if (focused) document.documentElement.dataset.composerFocus = "true";
  else delete document.documentElement.dataset.composerFocus;
}

export function Chat({
  conversationId: initialId,
  initialMessages,
  name,
  aiConfigured,
  initialPrompt,
}: {
  conversationId: string | null;
  initialMessages: ChatMessage[];
  name: string | null;
  aiConfigured: boolean;
  /** A message typed elsewhere (e.g. the Today screen) to send right away. */
  initialPrompt?: string | null;
}) {
  const router = useRouter();
  const { assistantName } = usePersonalization();
  const [conversationId, setConversationId] = useState(initialId);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const sentInitial = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => () => setComposerFocus(false), []);

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
      let actions: ChatAction[] = [];
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const parsed = parseStreamChunk(buffer + decoder.decode(value, { stream: true }));
        buffer = parsed.rest;
        for (const event of parsed.events) {
          if (event.t === "text") acc += event.v;
          else actions = applyActionEvent(actions, event);
        }
        const snapshot = { content: acc, actions };
        setMessages((m) => m.map((msg) => (msg.id === assistantId ? { ...msg, ...snapshot } : msg)));
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

  useEffect(() => {
    if (!initialPrompt || sentInitial.current) return;
    sentInitial.current = true;
    // Drop ?q= so a reload doesn't send it again.
    window.history.replaceState(null, "", "/assistant");
    void send(initialPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- send once, on mount
  }, []);

  return (
    <div className="flex min-h-[calc(100dvh-15rem)] flex-col md:min-h-[calc(100dvh-12rem)]">
      <div className="flex-1" aria-live="polite">
        {messages.length === 0 ? (
          <div className="animate-fade-in py-6">
            <AssistantAvatar name={assistantName} className="size-12 text-[20px]" />
            <h2 className="mt-4 text-[26px] font-bold leading-tight">{name ? `Hi ${name}, what's on your mind?` : "What's on your mind?"}</h2>
            <p className="mt-2 text-[16px] leading-relaxed text-muted">
              I&apos;m {assistantName}. I know your goals, your schedule and today&apos;s plan — ask me to plan, prioritize or reflect, or just tell me what you got done and I&apos;ll update things for you.
            </p>
            {!aiConfigured ? (
              <p className="mt-4 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">
                Demo mode: no OpenAI API key is configured, so replies only summarize your data.
              </p>
            ) : null}
            <div className="mt-7 grid gap-2.5 sm:grid-cols-2">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  style={{ animationDelay: `${i * 60}ms` }}
                  className="animate-rise rounded-[20px] bg-surface px-4 py-3.5 text-left text-[15px] shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.98]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="flex flex-col gap-3 pb-4">
            {messages.map((m) => (
              <li key={m.id} className={cn("flex animate-fade-in", m.role === "user" ? "justify-end" : "flex-col items-start")}>
                {m.role === "assistant" && m.actions?.length ? <ActionChips actions={m.actions} /> : null}
                {m.role === "assistant" && !m.content && m.actions?.length ? null : (
                  <div
                    className={cn(
                      "max-w-[86%] whitespace-pre-wrap rounded-[22px] px-4 py-2.5 text-[16px] leading-[1.5]",
                      m.role === "user" ? "rounded-br-[8px] bg-accent text-accent-foreground" : "rounded-bl-[8px] bg-surface shadow-card",
                    )}
                  >
                    {m.role === "assistant" && !m.content ? (
                      <span className="inline-flex items-center gap-2 text-muted">
                        <Spinner /> {assistantName} is thinking…
                      </span>
                    ) : (
                      m.content
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        <div ref={endRef} />
      </div>

      <div className="chat-composer sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-10 bg-gradient-to-t from-background from-70% to-transparent pb-2 pt-4 md:bottom-0 md:pb-5">
        {error ? (
          <p role="alert" className="mb-2 rounded-2xl bg-danger-soft px-4 py-2.5 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex items-end gap-2 rounded-[26px] bg-surface p-1.5 pl-3 shadow-lift transition-shadow focus-within:ring-4 focus-within:ring-ring"
        >
          <label htmlFor="chat-input" className="sr-only">
            Message {assistantName}
          </label>
          <textarea
            id="chat-input"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setComposerFocus(true)}
            onBlur={() => setComposerFocus(false)}
            enterKeyHint="send"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder={`Message ${assistantName}…`}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-[16px] focus:outline-none"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition-all active:scale-90 disabled:opacity-30"
            aria-label="Send message"
          >
            {streaming ? <Spinner /> : <ArrowUp className="size-5" />}
          </button>
        </form>
      </div>
    </div>
  );
}
