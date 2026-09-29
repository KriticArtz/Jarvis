import type { AccountabilityStyle, ConversationMessage } from "@/lib/types/domain";
import { renderContext } from "./context-format";
import type { AssistantContext } from "./context-types";
import { assistantSystemPrompt, type AssistantChannel } from "./prompts";

export const HISTORY_WINDOW = 12;
const HISTORY_CHAR_BUDGET = 8000;

export interface ChatMessageParam {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Assemble the model input: system prompt + structured context + rolling
 * summary of older messages + a bounded window of recent messages. The full
 * history is never sent.
 */
export function buildChatMessages(opts: {
  context: AssistantContext;
  style: AccountabilityStyle;
  channel: AssistantChannel;
  conversationSummary: string | null;
  history: Pick<ConversationMessage, "role" | "content">[];
}): ChatMessageParam[] {
  const messages: ChatMessageParam[] = [
    { role: "system", content: assistantSystemPrompt(opts.style, opts.channel) },
    { role: "system", content: `# User context (from the app's database, current as of now)\n\n${renderContext(opts.context)}` },
  ];
  if (opts.conversationSummary) {
    messages.push({ role: "system", content: `# Summary of earlier messages in this conversation\n${opts.conversationSummary}` });
  }

  const window = opts.history.slice(-HISTORY_WINDOW);
  // Trim from the oldest side if the window is too long in characters.
  let total = 0;
  const kept: ChatMessageParam[] = [];
  for (let i = window.length - 1; i >= 0; i--) {
    total += window[i].content.length;
    if (total > HISTORY_CHAR_BUDGET && kept.length > 0) break;
    kept.unshift({ role: window[i].role, content: window[i].content });
  }
  return [...messages, ...kept];
}

/**
 * Reply used when OPENAI_API_KEY is not configured. It is explicit about
 * being in demo mode and only reflects stored data back to the user.
 */
export function demoReply(ctx: AssistantContext): string {
  const lines: string[] = [
    "AI replies are not configured yet (no OPENAI_API_KEY), so I can't give personalized advice. Here's what I currently know about you:",
  ];
  if (ctx.goals.length) {
    lines.push(`- Top goals: ${ctx.goals.slice(0, 3).map((g) => `${g.title} (${g.progress})`).join("; ")}`);
  } else {
    lines.push("- No active goals yet.");
  }
  const pending = ctx.today.tasks.filter((t) => t.status === "pending");
  lines.push(pending.length ? `- Open tasks today: ${pending.map((t) => t.title).join(", ")}` : "- No open tasks today.");
  if (ctx.schedule.freeMinutesRemainingToday != null) {
    lines.push(`- Free time left today: about ${ctx.schedule.freeMinutesRemainingToday} minutes.`);
  }
  lines.push("Add an OpenAI API key to enable real conversations.");
  return lines.join("\n");
}
