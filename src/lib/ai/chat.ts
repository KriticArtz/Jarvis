import "server-only";
import type { ChatMessageParam } from "./chat-messages";
import { getAI, logAIError } from "./client";
import { responseParams } from "./model-params";
import { extractUsage, type TokenUsage } from "./pricing";
import { recordUsage, type AICallMeta } from "./usage";

/**
 * Thin wrapper over the OpenAI Responses API. Everything else in the app
 * (context building, prompts, persistence) is provider-agnostic and goes
 * through these three functions. `store: false` keeps conversations out of
 * OpenAI's response storage — history lives in our database.
 * Every call is recorded in ai_usage_events (see ./usage).
 */

const MAX_REPLY_TOKENS = 2000;
const NO_USAGE: TokenUsage = { inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null };

function errorCode(err: unknown): string {
  const e = err as { code?: unknown; status?: unknown; name?: string };
  return String(e?.code ?? e?.status ?? e?.name ?? "error").slice(0, 60);
}

function requestIdOf(err: unknown): string | null {
  return (err as { requestID?: string })?.requestID ?? null;
}

/** Stream assistant text. Throws if AI is not configured or the request fails. */
export async function* streamReply(messages: ChatMessageParam[], meta: AICallMeta): AsyncGenerator<string> {
  const ai = getAI();
  if (!ai) throw new Error("AI not configured");
  const started = Date.now();
  let usage = NO_USAGE;
  let requestId: string | null = null;
  let produced = false;
  try {
    const stream = await ai.client.responses.create({
      model: ai.model,
      input: messages,
      store: false,
      stream: true,
      ...responseParams(ai.model, MAX_REPLY_TOKENS),
    });
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        produced = true;
        yield event.delta;
      } else if (event.type === "response.completed" || event.type === "response.incomplete") {
        usage = extractUsage(event.response.usage);
        requestId = event.response.id ?? null;
        if (event.type === "response.incomplete") {
          logAIError("streamReply", { message: `incomplete: ${event.response.incomplete_details?.reason ?? "unknown"}` });
        }
      } else if (event.type === "response.failed") {
        usage = extractUsage(event.response.usage);
        throw Object.assign(new Error(event.response.error?.message ?? "response failed"), { code: event.response.error?.code });
      } else if (event.type === "error") {
        throw Object.assign(new Error(event.message), { code: event.code });
      }
    }
    void recordUsage({ ...meta, model: ai.model, status: produced ? "ok" : "empty", usage, latencyMs: Date.now() - started, requestId });
  } catch (err) {
    void recordUsage({ ...meta, model: ai.model, status: "error", usage, latencyMs: Date.now() - started, requestId: requestId ?? requestIdOf(err), errorCode: errorCode(err) });
    throw err;
  }
}

/** Non-streaming reply (SMS replies, insights, summaries). */
export async function completeReply(messages: ChatMessageParam[], meta: AICallMeta, maxTokens = MAX_REPLY_TOKENS): Promise<string | null> {
  const ai = getAI();
  if (!ai) return null;
  const started = Date.now();
  try {
    const res = await ai.client.responses.create({
      model: ai.model,
      input: messages,
      store: false,
      ...responseParams(ai.model, maxTokens),
    });
    const text = res.output_text?.trim();
    if (!text) logAIError("completeReply", { message: `empty reply (status=${res.status}, reason=${res.incomplete_details?.reason ?? "none"})` });
    void recordUsage({ ...meta, model: ai.model, status: text ? "ok" : "empty", usage: extractUsage(res.usage), latencyMs: Date.now() - started, requestId: res.id });
    return text || null;
  } catch (err) {
    logAIError("completeReply", err);
    void recordUsage({ ...meta, model: ai.model, status: "error", usage: NO_USAGE, latencyMs: Date.now() - started, requestId: requestIdOf(err), errorCode: errorCode(err) });
    return null;
  }
}

/** Structured JSON output validated against a strict JSON schema. */
export async function completeJSON<T>(
  messages: ChatMessageParam[],
  schemaName: string,
  schema: Record<string, unknown>,
  meta: AICallMeta,
  maxTokens = 3000,
): Promise<T | null> {
  const ai = getAI();
  if (!ai) return null;
  const started = Date.now();
  try {
    const res = await ai.client.responses.create({
      model: ai.model,
      input: messages,
      store: false,
      ...responseParams(ai.model, maxTokens),
      text: { format: { type: "json_schema", name: schemaName, schema, strict: true } },
    });
    const text = res.output_text;
    void recordUsage({ ...meta, model: ai.model, status: text ? "ok" : "empty", usage: extractUsage(res.usage), latencyMs: Date.now() - started, requestId: res.id });
    if (!text) {
      logAIError(`completeJSON:${schemaName}`, { message: `empty reply (status=${res.status}, reason=${res.incomplete_details?.reason ?? "none"})` });
      return null;
    }
    return JSON.parse(text) as T;
  } catch (err) {
    logAIError(`completeJSON:${schemaName}`, err);
    void recordUsage({ ...meta, model: ai.model, status: "error", usage: NO_USAGE, latencyMs: Date.now() - started, requestId: requestIdOf(err), errorCode: errorCode(err) });
    return null;
  }
}
