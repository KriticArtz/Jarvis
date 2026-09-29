import "server-only";
import type { ChatMessageParam } from "./chat-messages";
import { getAI, logAIError } from "./client";
import { completionParams } from "./model-params";

const MAX_REPLY_TOKENS = 2000;

/** Stream assistant text. Throws if AI is not configured. */
export async function* streamReply(messages: ChatMessageParam[]): AsyncGenerator<string> {
  const ai = getAI();
  if (!ai) throw new Error("AI not configured");
  const stream = await ai.client.chat.completions.create({
    model: ai.model,
    messages,
    stream: true,
    ...completionParams(ai.model, MAX_REPLY_TOKENS),
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

/** Non-streaming completion (used for SMS replies and background jobs). */
export async function completeReply(messages: ChatMessageParam[], maxTokens = MAX_REPLY_TOKENS): Promise<string | null> {
  const ai = getAI();
  if (!ai) return null;
  try {
    const res = await ai.client.chat.completions.create({
      model: ai.model,
      messages,
      ...completionParams(ai.model, maxTokens),
    });
    const text = res.choices[0]?.message?.content?.trim();
    if (!text) logAIError("completeReply", { message: `empty reply (finish_reason=${res.choices[0]?.finish_reason})` });
    return text || null;
  } catch (err) {
    logAIError("completeReply", err);
    return null;
  }
}

/** Structured JSON output validated against a JSON schema. */
export async function completeJSON<T>(
  messages: ChatMessageParam[],
  schemaName: string,
  schema: Record<string, unknown>,
  maxTokens = 3000,
): Promise<T | null> {
  const ai = getAI();
  if (!ai) return null;
  try {
    const res = await ai.client.chat.completions.create({
      model: ai.model,
      messages,
      ...completionParams(ai.model, maxTokens),
      response_format: { type: "json_schema", json_schema: { name: schemaName, schema, strict: true } },
    });
    const text = res.choices[0]?.message?.content;
    if (!text) logAIError(`completeJSON:${schemaName}`, { message: `empty reply (finish_reason=${res.choices[0]?.finish_reason})` });
    return text ? (JSON.parse(text) as T) : null;
  } catch (err) {
    logAIError(`completeJSON:${schemaName}`, err);
    return null;
  }
}
