/**
 * Estimated OpenAI cost per request, in USD.
 *
 * Prices are USD per 1M tokens. The built-in table is a REFERENCE ONLY — verify
 * against https://openai.com/api/pricing and override with OPENAI_PRICING_JSON,
 * e.g. {"gpt-5-mini":{"input":0.25,"cached_input":0.025,"output":2}}.
 * Models without a known price get a null estimate (never a guess).
 * Reasoning tokens are billed as output tokens and are already included in
 * `output_tokens`.
 */
export interface ModelPrice {
  input: number;
  cached_input?: number;
  output: number;
}

export const REFERENCE_PRICES: Record<string, ModelPrice> = {
  "gpt-5": { input: 1.25, cached_input: 0.125, output: 10 },
  "gpt-5-mini": { input: 0.25, cached_input: 0.025, output: 2 },
  "gpt-5-nano": { input: 0.05, cached_input: 0.005, output: 0.4 },
  "gpt-4.1": { input: 2, cached_input: 0.5, output: 8 },
  "gpt-4.1-mini": { input: 0.4, cached_input: 0.1, output: 1.6 },
  "gpt-4o-mini": { input: 0.15, cached_input: 0.075, output: 0.6 },
};

export interface TokenUsage {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
}

function isPrice(v: unknown): v is ModelPrice {
  const p = v as ModelPrice;
  return Boolean(p) && typeof p.input === "number" && typeof p.output === "number" && (p.cached_input === undefined || typeof p.cached_input === "number");
}

/** Built-in table merged with OPENAI_PRICING_JSON (invalid JSON is ignored). */
export function priceTable(overrideJson: string | undefined = process.env.OPENAI_PRICING_JSON): Record<string, ModelPrice> {
  const table: Record<string, ModelPrice> = { ...REFERENCE_PRICES };
  if (!overrideJson?.trim()) return table;
  try {
    const parsed = JSON.parse(overrideJson) as Record<string, unknown>;
    for (const [model, price] of Object.entries(parsed)) if (isPrice(price)) table[model.toLowerCase()] = price;
  } catch {
    // Ignore malformed overrides; estimates fall back to the reference table.
  }
  return table;
}

/** Match exact model names first, then the longest known prefix (e.g. dated snapshots). */
export function findPrice(model: string, table = priceTable()): ModelPrice | null {
  const m = model.toLowerCase();
  if (table[m]) return table[m];
  const key = Object.keys(table)
    .filter((k) => m.startsWith(`${k}-`))
    .sort((a, b) => b.length - a.length)[0];
  return key ? table[key] : null;
}

export function estimateCostUsd(model: string, usage: TokenUsage, table = priceTable()): number | null {
  const price = findPrice(model, table);
  if (!price || usage.inputTokens == null || usage.outputTokens == null) return null;
  const cached = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens);
  const uncached = usage.inputTokens - cached;
  const cost = (uncached * price.input + cached * (price.cached_input ?? price.input) + usage.outputTokens * price.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** Normalize the Responses API `usage` object (fields may be missing). */
export function extractUsage(usage: unknown): TokenUsage {
  const u = (usage ?? {}) as {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  };
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    inputTokens: num(u.input_tokens),
    cachedInputTokens: num(u.input_tokens_details?.cached_tokens),
    outputTokens: num(u.output_tokens),
    reasoningTokens: num(u.output_tokens_details?.reasoning_tokens),
    totalTokens: num(u.total_tokens),
  };
}
