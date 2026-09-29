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

/** Log AI failures without user content. */
export function logAIError(where: string, err: unknown) {
  const e = err as { status?: number; code?: string; message?: string };
  console.error(`[ai] ${where} failed`, { status: e?.status, code: e?.code, message: e?.message?.slice(0, 200) });
}
