import "server-only";
import type { ChatMessageParam } from "./chat-messages";
import { getAI, logAIError } from "./client";
import { responseParams } from "./model-params";

/**
 * Thin wrapper over the OpenAI Responses API. Everything else in the app
 * (context building, prompts, persistence) is provider-agnostic and goes
 * through these three functions. `store: false` keeps conversations out of
 * OpenAI's response storage — history lives in our database.
 */

const MAX_REPLY_TOKENS = 2000;

/** Stream assistant text. Throws if AI is not configured or the request fails. */
export async function* streamReply(messages: ChatMessageParam[]): AsyncGenerator<string> {
  const ai = getAI();
  if (!ai) throw new Error("AI not configured");
  const stream = await ai.client.responses.create({
    model: ai.model,
    input: messages,
    store: false,
    stream: true,
    ...responseParams(ai.model, MAX_REPLY_TOKENS),
  });
  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      yield event.delta;
    } else if (event.type === "response.incomplete") {
      logAIError("streamReply", { message: `incomplete: ${event.response.incomplete_details?.reason ?? "unknown"}` });
    } else if (event.type === "response.failed") {
      throw Object.assign(new Error(event.response.error?.message ?? "response failed"), { code: event.response.error?.code });
    } else if (event.type === "error") {
      throw Object.assign(new Error(event.message), { code: event.code });
    }
  }
}

/** Non-streaming reply (SMS replies, insights, summaries). */
export async function completeReply(messages: ChatMessageParam[], maxTokens = MAX_REPLY_TOKENS): Promise<string | null> {
  const ai = getAI();
  if (!ai) return null;
  try {
    const res = await ai.client.responses.create({
      model: ai.model,
      input: messages,
      store: false,
      ...responseParams(ai.model, maxTokens),
    });
    const text = res.output_text?.trim();
    if (!text) logAIError("completeReply", { message: `empty reply (status=${res.status}, reason=${res.incomplete_details?.reason ?? "none"})` });
    return text || null;
  } catch (err) {
    logAIError("completeReply", err);
    return null;
  }
}

/** Structured JSON output validated against a strict JSON schema. */
export async function completeJSON<T>(
  messages: ChatMessageParam[],
  schemaName: string,
  schema: Record<string, unknown>,
  maxTokens = 3000,
): Promise<T | null> {
  const ai = getAI();
  if (!ai) return null;
  try {
    const res = await ai.client.responses.create({
      model: ai.model,
      input: messages,
      store: false,
      ...responseParams(ai.model, maxTokens),
      text: { format: { type: "json_schema", name: schemaName, schema, strict: true } },
    });
    const text = res.output_text;
    if (!text) {
      logAIError(`completeJSON:${schemaName}`, { message: `empty reply (status=${res.status}, reason=${res.incomplete_details?.reason ?? "none"})` });
      return null;
    }
    return JSON.parse(text) as T;
  } catch (err) {
    logAIError(`completeJSON:${schemaName}`, err);
    return null;
  }
}
