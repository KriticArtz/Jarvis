import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logWarn } from "@/lib/observability/log";
import { estimateCostUsd, type TokenUsage } from "./pricing";

/** What a model call was for. Stored with every usage event. */
export type AIFeature = "chat" | "sms_reply" | "plan" | "insight" | "weekly_review" | "conversation_summary";

export interface AICallMeta {
  /** Owner of the request; null only for calls not tied to a user. */
  userId: string | null;
  feature: AIFeature;
}

export interface UsageEvent extends AICallMeta {
  model: string;
  status: "ok" | "empty" | "error";
  usage: TokenUsage;
  latencyMs: number;
  requestId?: string | null;
  errorCode?: string | null;
}

let warnedMissingKey = false;

/**
 * Record one OpenAI request in ai_usage_events (server-only table, written
 * with the service role). Never throws: tracking must not break a request.
 */
export async function recordUsage(event: UsageEvent): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin) {
      if (!warnedMissingKey) {
        warnedMissingKey = true;
        logWarn("ai-usage", "usage tracking disabled: SUPABASE_SERVICE_ROLE_KEY is not configured");
      }
      return;
    }
    const { error } = await admin.from("ai_usage_events").insert({
      user_id: event.userId,
      feature: event.feature,
      model: event.model,
      status: event.status,
      input_tokens: event.usage.inputTokens,
      cached_input_tokens: event.usage.cachedInputTokens,
      output_tokens: event.usage.outputTokens,
      reasoning_tokens: event.usage.reasoningTokens,
      total_tokens: event.usage.totalTokens,
      estimated_cost_usd: estimateCostUsd(event.model, event.usage),
      latency_ms: Math.round(event.latencyMs),
      openai_request_id: event.requestId ?? null,
      error_code: event.errorCode ?? null,
    });
    if (error) logWarn("ai-usage", "could not record usage", { code: error.code, message: error.message });
  } catch (err) {
    logWarn("ai-usage", "could not record usage", { message: (err as Error).message });
  }
}
