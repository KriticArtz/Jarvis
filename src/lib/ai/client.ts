import "server-only";
import OpenAI from "openai";
import { openAIConfig } from "@/lib/env";

export interface AIHandle {
  client: OpenAI;
  model: string;
}

let cached: AIHandle | null | undefined;

/** Returns null when OPENAI_API_KEY is not set (the app runs in demo mode). */
export function getAI(): AIHandle | null {
  if (cached !== undefined) return cached;
  const cfg = openAIConfig();
  cached = cfg ? { client: new OpenAI({ apiKey: cfg.apiKey }), model: cfg.model } : null;
  return cached;
}

export function isAIConfigured(): boolean {
  return getAI() !== null;
}

/**
 * Log AI failures without user content or secrets. OpenAI error messages never
 * contain the API key; `requestID` helps when contacting OpenAI support.
 */
export function logAIError(where: string, err: unknown) {
  const e = err as { status?: number; code?: string; type?: string; requestID?: string; message?: string; name?: string };
  console.error(`[ai] ${where} failed`, {
    name: e?.name,
    status: e?.status,
    code: e?.code,
    type: e?.type,
    requestId: e?.requestID,
    message: e?.message?.replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***").slice(0, 300),
  });
}
