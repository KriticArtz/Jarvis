import "server-only";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { isMutating, openAITools, pendingProposals, runningLabel, runTool } from "@/lib/assistant/actions/registry";
import type { ToolContext, ToolResult } from "@/lib/assistant/actions/types";
import type { ChatMessageParam } from "./chat-messages";
import { getAI, logAIError } from "./client";
import { isReasoningModel, responseParams } from "./model-params";
import { extractUsage } from "./pricing";
import { recordUsage, type AICallMeta } from "./usage";
import { claimsSuccess, FAILED_ACTION_NOTE, toolOutputForModel } from "./agent-rules";

/**
 * The tool-enabled assistant turn: model → (tool calls → server-side tools →
 * results) × N → final reply. The model only ever sees the explicit tools in
 * the registry; the user id comes from `ctx`, never from the model.
 */

export const MAX_ROUNDS = 5;
export const MAX_TOOL_CALLS = 8;

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "action"; callId: string; tool: string; status: "running" | ToolResult["status"]; label: string };

export interface AgentAction {
  tool: string;
  status: ToolResult["status"];
  message: string;
}

export interface AgentOutcome {
  text: string;
  actions: AgentAction[];
}

interface FunctionCallItem {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
}

function minutesAgo(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return m === 0 ? "just now" : `${m} min ago`;
}

export async function runAssistantTurn(opts: {
  messages: ChatMessageParam[];
  ctx: ToolContext;
  meta: AICallMeta;
  stream: boolean;
  maxOutputTokens: number;
  onEvent?: (event: AgentEvent) => void;
  /** Injection point for tests. */
  runToolFn?: typeof runTool;
}): Promise<AgentOutcome> {
  const ai = getAI();
  if (!ai) throw new Error("AI not configured");
  const exec = opts.runToolFn ?? runTool;
  const emit = opts.onEvent ?? (() => {});

  const input: unknown[] = [...opts.messages];
  const pending = await pendingProposals(opts.ctx);
  if (pending.length) {
    input.push({
      role: "system",
      content: `## Pending changes awaiting the user's OK (proposed earlier in this conversation)\n${pending
        .map((p) => `- confirmation id ${p.id}: ${p.summary} (proposed ${minutesAgo(p.created_at)})`)
        .join("\n")}\nIf the user's latest message approves one of these, call confirm_action with its id; if they decline, call decline_action.`,
    });
  }

  const tools = openAITools();
  const actions: AgentAction[] = [];
  let text = "";
  let toolCalls = 0;

  const appendText = (delta: string, roundStarted: { v: boolean }) => {
    if (!delta) return;
    if (!roundStarted.v && text) {
      text += "\n\n";
      emit({ type: "text", delta: "\n\n" });
    }
    roundStarted.v = true;
    text += delta;
    emit({ type: "text", delta });
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const lastRound = round === MAX_ROUNDS - 1 || toolCalls >= MAX_TOOL_CALLS;
    const params = {
      model: ai.model,
      input: input as ResponseInputItem[],
      tools,
      tool_choice: lastRound ? ("none" as const) : ("auto" as const),
      parallel_tool_calls: false,
      store: false,
      ...(isReasoningModel(ai.model) ? { include: ["reasoning.encrypted_content" as const] } : {}),
      ...responseParams(ai.model, opts.maxOutputTokens),
    };
    const started = Date.now();
    const roundText = { v: false };
    let output: unknown[] = [];
    try {
      if (opts.stream) {
        const stream = await ai.client.responses.create({ ...params, stream: true });
        for await (const event of stream) {
          if (event.type === "response.output_text.delta") appendText(event.delta, roundText);
          else if (event.type === "response.completed" || event.type === "response.incomplete") {
            output = event.response.output ?? [];
            void recordUsage({ ...opts.meta, model: ai.model, status: "ok", usage: extractUsage(event.response.usage), latencyMs: Date.now() - started, requestId: event.response.id });
          } else if (event.type === "response.failed") {
            throw Object.assign(new Error(event.response.error?.message ?? "response failed"), { code: event.response.error?.code });
          } else if (event.type === "error") {
            throw Object.assign(new Error(event.message), { code: event.code });
          }
        }
      } else {
        const res = await ai.client.responses.create(params);
        output = res.output ?? [];
        appendText(res.output_text ?? "", roundText);
        void recordUsage({ ...opts.meta, model: ai.model, status: "ok", usage: extractUsage(res.usage), latencyMs: Date.now() - started, requestId: res.id });
      }
    } catch (err) {
      void recordUsage({
        ...opts.meta,
        model: ai.model,
        status: "error",
        usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null },
        latencyMs: Date.now() - started,
        requestId: (err as { requestID?: string })?.requestID ?? null,
        errorCode: String((err as { code?: unknown; status?: unknown })?.code ?? (err as { status?: unknown })?.status ?? "error").slice(0, 60),
      });
      throw err;
    }

    const calls = output.filter((i): i is FunctionCallItem => (i as { type?: string })?.type === "function_call");
    if (!calls.length || lastRound) break;

    // Stateless (store: false) tool use: send the model's output items back
    // followed by one function_call_output per call.
    input.push(...output);
    for (const call of calls) {
      let result: ToolResult;
      if (toolCalls >= MAX_TOOL_CALLS) {
        result = { status: "failed", error: "limit", message: "That's a lot of changes at once — let's take them one at a time." };
      } else {
        toolCalls++;
        emit({ type: "action", callId: call.call_id, tool: call.name, status: "running", label: runningLabel(call.name, call.arguments) });
        try {
          result = await exec(opts.ctx, call.name, call.arguments);
        } catch (err) {
          logAIError(`tool ${call.name}`, err);
          result = { status: "failed", error: "server_error", message: "Something went wrong on my side, so I didn't make that change." };
        }
        if (result.status !== "info") {
          emit({ type: "action", callId: call.call_id, tool: call.name, status: result.status, label: result.message });
        } else {
          emit({ type: "action", callId: call.call_id, tool: call.name, status: "info", label: "" });
        }
      }
      actions.push({ tool: call.name, status: result.status, message: result.message });
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(toolOutputForModel(result)) });
    }
  }

  // Server-side honesty guard: if every attempted change failed, the reply
  // must not read as a success.
  const changes = actions.filter((a) => isMutating(a.tool));
  const anySucceeded = changes.some((a) => a.status === "succeeded" || a.status === "needs_confirmation");
  if (changes.length && !anySucceeded && claimsSuccess(text)) {
    text += FAILED_ACTION_NOTE;
    emit({ type: "text", delta: FAILED_ACTION_NOTE });
  }
  if (!text.trim()) {
    const fallback = actions.length ? actions.map((a) => a.message).join(" ") : "Sorry — I couldn't reply just now. Please try again.";
    text = fallback;
    emit({ type: "text", delta: fallback });
  }
  return { text, actions };
}
