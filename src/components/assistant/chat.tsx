"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { applyActionEvent, asResolution, findProposal, parseStreamChunk, withoutProposals, type ChatAction } from "@/lib/assistant/stream-protocol";
import { answerProposal } from "@/lib/actions/assistant";
import { assistantHref } from "@/lib/assistant/active";
import { usePersonalization } from "@/components/app/personalization";
import { Presence, type PresenceState } from "@/components/ui/presence";
import { Button, buttonClass } from "@/components/ui/button";
import { ActionChips } from "./action-chips";
import { Composer, setComposerFocus } from "./composer";
import { HistorySheet, type ConversationSummary } from "./history-sheet";
import { MessageText } from "./message-text";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: ChatAction[];
}

interface ChatError {
  message: string;
  /** The message to send again, when retrying makes sense. */
  retry: string | null;
}

/** Human wording for anything that went wrong; the server's raw error is never shown. */
function humanError(status: number | null, serverMessage: string | null): string {
  if (status === null) return "I couldn't reach you just now — check your connection and try again.";
  if (status === 429 && serverMessage) return serverMessage; // rate limit / demo limit: already written for people
  if (status === 401) return "Your session ended. Log in again to keep talking.";
  if (status === 404) return "That conversation isn't available anymore. Start a new one.";
  return "I couldn't get that response right now. Nothing was changed.";
}

/**
 * The Assistant: a conversation with something that knows your day. Header
 * with the Presence (its state follows the conversation: listening while you
 * write, thinking, acting while a change runs, then settling), an opening
 * built from real context, editorial replies, quiet action lines, and a
 * command-bar composer. Streaming, actions and confirmations use the same
 * endpoints and rules as before.
 */
export function Chat({
  conversationId: initialId,
  initialMessages,
  firstName,
  aiConfigured,
  initialPrompt,
  focusTaskId = null,
  opening,
  subtitle,
  conversations,
  today,
  belowBanner = false,
}: {
  conversationId: string | null;
  initialMessages: ChatMessage[];
  firstName: string | null;
  aiConfigured: boolean;
  /** A message typed elsewhere (e.g. the Today screen) to send right away. */
  initialPrompt?: string | null;
  /** The task the user was acting on in Today ("Move it"), sent with the initial prompt. */
  focusTaskId?: string | null;
  /** Opening line and suggestions from the user's real context (new conversations only). */
  opening: { line: string | null; suggestions: string[] } | null;
  subtitle: string;
  conversations: ConversationSummary[];
  /** The user's local date (YYYY-MM-DD), for "Today" / "Tomorrow" in results. */
  today: string;
  /** The demo banner is pinned above; keep the header below it. */
  belowBanner?: boolean;
}) {
  const router = useRouter();
  const { assistantName } = usePersonalization();
  const [conversationId, setConversationId] = useState(initialId);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [answering, setAnswering] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [settling, setSettling] = useState(false);
  /** "Adjust" on a proposed plan: the next message is about changing it. */
  const [adjusting, setAdjusting] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sentInitial = useRef(false);
  const mounted = useRef(false);

  // Open at the latest message instantly; glide for new ones.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: mounted.current ? "smooth" : "instant", block: "end" });
    mounted.current = true;
  }, [messages, error]);

  useEffect(() => () => setComposerFocus(false), []);

  const last = messages[messages.length - 1];
  const runningAction = streaming ? last?.actions?.find((a) => a.status === "running") : undefined;
  const presence: PresenceState = runningAction || answering ? "acting" : streaming ? "thinking" : settling ? "complete" : composing && input.trim() ? "listening" : "idle";

  const settle = () => {
    setSettling(true);
    window.setTimeout(() => setSettling(false), 1100);
  };

  async function send(text: string, focus: string | null = null) {
    const message = text.trim();
    if (!message || streaming) return;
    setError(null);
    setInput("");
    setAdjusting(false);
    setStreaming(true);
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: message };
    const assistantId = `a-${Date.now()}`;
    setMessages((m) => [...m, userMsg, { id: assistantId, role: "assistant", content: "" }]);

    let status: number | null = null;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message, ...(focus ? { focusTaskId: focus } : {}) }),
      }).catch(() => null);
      if (!res) throw Object.assign(new Error("network"), { status: null, server: null });
      status = res.status;
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw Object.assign(new Error("response"), { status: res.status, server: typeof data.error === "string" ? data.error : null });
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
      // Proposals answered in words ("yes" / "no") during this reply.
      const answered = new Set<string>();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const parsed = parseStreamChunk(buffer + decoder.decode(value, { stream: true }));
        buffer = parsed.rest;
        for (const event of parsed.events) {
          if (event.t === "text") {
            acc += event.v;
            continue;
          }
          actions = applyActionEvent(actions, event);
          const resolution = event.status === "succeeded" ? asResolution(event.resolves) : undefined;
          if (resolution) {
            // Same outcome as answering with the buttons: the proposal leaves its message; a "no" reads as declined here.
            answered.add(resolution.confirmationId);
            const proposal = findProposal(messages, resolution.confirmationId);
            if (resolution.decision === "decline") {
              // As on reload: a declined proposal shows only when it has a card to name what stayed put.
              actions = proposal?.card
                ? actions.map((a) => (a.id === event.id ? { id: a.id, status: "declined", label: a.label, card: proposal.card } : a))
                : actions.filter((a) => a.id !== event.id);
            }
          }
        }
        const snapshot = { content: acc, actions };
        setMessages((m) => m.map((msg) => (msg.id === assistantId ? { ...msg, ...snapshot } : withoutProposals(msg, answered))));
      }
      // The connection closed without a reply (e.g. the server timed out): say so, offer a retry.
      if (!acc.trim() && !actions.length) throw Object.assign(new Error("empty"), { status: 502, server: null });
      settle();
      // No router.refresh() here: re-rendering the page would remount the chat (its key follows the
      // conversation id) and drop anything typed meanwhile. Other screens load fresh data on their own.
    } catch (err) {
      const e = err as { status?: number | null; server?: string | null };
      const code = e.status === undefined ? status : e.status;
      const retryable = code === null || code >= 500 || code === 429;
      setError({ message: humanError(code, e.server ?? null), retry: retryable ? message : null });
      // Keep what the user wrote visible; drop the empty reply.
      setMessages((m) => m.filter((msg) => msg.id !== assistantId || msg.content));
      if (!retryable) setInput(message);
    } finally {
      setStreaming(false);
    }
  }

  function retry() {
    if (!error?.retry) return;
    const text = error.retry;
    // Remove the unanswered message; send() adds it again.
    setMessages((m) => (m[m.length - 1]?.role === "user" && m[m.length - 1].content === text ? m.slice(0, -1) : m));
    void send(text);
  }

  /**
   * Confirm or decline a pending change (same server-side confirmation as
   * replying "yes"). The proposal resolves into the reply that follows it —
   * the result, the failure, or "not now" — exactly where a reload puts it.
   */
  async function answer(action: ChatAction, decision: "confirm" | "decline") {
    if (!conversationId || !action.confirmationId || answering || streaming) return;
    setError(null);
    setAdjusting(false);
    setAnswering(action.confirmationId);
    try {
      const res = await answerProposal({ conversationId, confirmationId: action.confirmationId, decision });
      const outcome: ChatAction =
        decision === "decline" && res.ok
          ? { id: action.id, status: "declined", label: res.message, ...(action.card ? { card: action.card } : {}) }
          : { id: action.id, status: res.status, label: res.message, ...(res.card ? { card: res.card } : {}), ...(res.error ? { error: res.error } : {}) };
      setMessages((m) => [
        ...m.map((msg) => (msg.actions?.some((a) => a.id === action.id) ? { ...msg, actions: msg.actions.filter((a) => a.id !== action.id) } : msg)),
        { id: `u-${Date.now()}`, role: "user", content: decision === "confirm" ? "Yes, go ahead." : "No, cancel that." },
        // As on reload, a declined proposal without a card leaves just the reply.
        { id: `a-${Date.now()}`, role: "assistant", content: res.message, actions: outcome.status === "declined" && !outcome.card ? [] : [outcome] },
      ]);
      settle();
      // Today and the other screens read fresh data; refresh this one's server state too.
      router.refresh();
    } catch {
      setError({ message: "I couldn't make that change right now. Nothing was changed.", retry: null });
    } finally {
      setAnswering(null);
    }
  }

  /** "Adjust" on a proposed plan: hand the conversation back. The proposal stays open; nothing is applied. */
  function adjustPlan() {
    setAdjusting(true);
    inputRef.current?.focus();
  }

  useEffect(() => {
    if (!initialPrompt || sentInitial.current) return;
    sentInitial.current = true;
    // Drop ?q= (and ?task=) so a reload doesn't send it again; stay on this conversation.
    window.history.replaceState(null, "", conversationId ? `/assistant?c=${conversationId}` : "/assistant");
    void send(initialPrompt, focusTaskId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- send once, on mount
  }, []);

  const empty = messages.length === 0;

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col md:min-h-[calc(100dvh-7rem)]">
      <header
        className={cn(
          "sticky z-20 -mx-4 flex items-center gap-3 border-b border-hairline bg-background px-4 py-2 sm:-mx-6 sm:px-6 md:-mx-10 md:px-10",
          belowBanner ? "top-10" : "top-0",
        )}
      >
        <Presence size={36} state={presence} label={`${assistantName}, ${presence === "idle" ? "ready" : presence}`} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-semibold leading-tight">{assistantName}</h1>
          <p className="truncate text-[13px] text-muted">{subtitle}</p>
        </div>
        <HistorySheet conversations={conversations} currentId={conversationId} />
        {empty ? null : (
          <Link href={assistantHref({ fresh: true })} className={buttonClass("secondary", "md", "px-4")} aria-label="New conversation">
            <Plus className="size-4" aria-hidden /> New
          </Link>
        )}
      </header>

      <div className="flex-1">
        {empty ? (
          <Opening firstName={firstName} opening={opening} aiConfigured={aiConfigured} onPick={(s) => void send(s)} disabled={streaming} />
        ) : (
          <ol className="flex flex-col gap-9 pb-6 pt-6" role="log" aria-live="polite" aria-label="Conversation">
            {messages.map((m, i) => {
              const isLast = i === messages.length - 1;
              if (m.role === "user") {
                return (
                  <li key={m.id} className="flex animate-fade-in justify-end">
                    <p className="max-w-[82%] whitespace-pre-wrap rounded-tile rounded-br-chip bg-surface-2 px-4 py-2.5 text-[16px] leading-[1.5] shadow-[inset_0_0_0_1px_var(--hairline)]">
                      {m.content}
                    </p>
                  </li>
                );
              }
              const thinking = isLast && streaming && !m.content;
              // A reply that only restates its action's outcome lets the result speak for itself.
              const restates = Boolean(m.content.trim()) && m.actions?.some((a) => a.status !== "running" && a.status !== "declined" && a.label.trim() === m.content.trim());
              const latestReply = isLast || (i === messages.length - 2 && messages[messages.length - 1].role === "user" && Boolean(error));
              return (
                <li key={m.id} className="flex animate-fade-in flex-col gap-4">
                  {thinking ? <Thinking label={runningAction?.label ?? null} /> : null}
                  {m.content && !restates ? <MessageText text={m.content} /> : null}
                  {m.actions?.length ? (
                    <ActionChips
                      actions={m.actions}
                      today={today}
                      onAnswer={answer}
                      busyId={answering}
                      disabled={streaming}
                      onRetry={latestReply && !streaming ? () => void send("Please try that again.") : undefined}
                      onAdjust={adjustPlan}
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
        {error ? (
          <div role="alert" className="mb-4 flex animate-fade-in flex-wrap items-center gap-x-4 gap-y-2 rounded-tile border border-danger/25 bg-danger-soft px-4 py-3">
            <p className="min-w-0 flex-1 text-[15px] text-foreground">{error.message}</p>
            {error.retry ? (
              <Button variant="secondary" onClick={retry}>
                <RotateCcw className="size-4" aria-hidden /> Try again
              </Button>
            ) : null}
          </div>
        ) : null}
        {/* Scrolling lands the latest message above the docked composer (and the tab bar on phones). */}
        <div ref={endRef} className="scroll-mb-[150px] md:scroll-mb-[110px]" />
      </div>

      <Composer
        ref={inputRef}
        value={input}
        onChange={setInput}
        onSend={() => void send(input)}
        busy={streaming}
        onFocusChange={setComposing}
        label={`Message ${assistantName}`}
        placeholder={adjusting ? "What should change about this plan?" : empty ? "Ask me anything…" : `Reply to ${assistantName}…`}
      />
    </div>
  );
}

/** How long before "thinking" admits it's taking a while. */
const SLOW_MS = 15_000;

function Thinking({ label }: { label: string | null }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => window.clearTimeout(t);
  }, []);
  const text = label ?? (slow ? "Still working on it — this is taking longer than usual…" : "Thinking about your day…");
  return (
    <p role="status" className="flex items-center gap-3 text-[15px] text-muted">
      <Presence size={18} state={label ? "acting" : "thinking"} />
      <span className="animate-fade-in" key={text}>
        {text}
      </span>
    </p>
  );
}

/** No conversation yet: a real question, one line from the user's actual day, and a few fitting suggestions. */
function Opening({
  firstName,
  opening,
  aiConfigured,
  onPick,
  disabled,
}: {
  firstName: string | null;
  opening: { line: string | null; suggestions: string[] } | null;
  aiConfigured: boolean;
  onPick: (s: string) => void;
  disabled: boolean;
}) {
  return (
    <section aria-labelledby="opening-title" className="pb-8 pt-10 sm:pt-16">
      <h2 id="opening-title" className="type-display max-w-[16ch] animate-fade-in text-[40px] leading-[1.04] sm:text-[52px]">
        {firstName ? `${firstName}, what` : "What"} can I help you move forward today?
      </h2>
      {opening?.line ? <p className="mt-4 max-w-[44ch] animate-fade-in text-[18px] leading-snug text-muted [animation-delay:80ms]">{opening.line}</p> : null}
      {!aiConfigured ? (
        <p className="mt-5 max-w-[52ch] text-[14px] leading-relaxed text-muted">
          AI replies aren&apos;t set up on this server yet, so answers will summarize what&apos;s in your plan rather than reason about it.
        </p>
      ) : null}
      {opening?.suggestions.length ? (
        <ul className="mt-9 flex flex-col border-t border-hairline" aria-label="Suggestions">
          {opening.suggestions.map((s, i) => (
            <li key={s} className="animate-fade-in border-b border-hairline" style={{ animationDelay: `${140 + i * 60}ms` }}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(s)}
                className={cn(
                  "group flex min-h-14 w-full items-center justify-between gap-4 px-1 text-left text-[16px] font-medium transition-colors duration-(--dur-2)",
                  "hover:text-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50",
                )}
              >
                {s}
                <ArrowUpRight className="size-4 shrink-0 text-subtle transition-transform duration-(--dur-2) ease-soft group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
