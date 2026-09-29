import { describe, expect, it } from "vitest";
import { estimateCostUsd, extractUsage, findPrice, priceTable } from "./pricing";

const usage = (input: number, output: number, cached = 0) => ({ inputTokens: input, cachedInputTokens: cached, outputTokens: output, reasoningTokens: null, totalTokens: input + output });

describe("pricing", () => {
  it("extracts Responses API usage, tolerating missing fields", () => {
    expect(
      extractUsage({ input_tokens: 1200, input_tokens_details: { cached_tokens: 200 }, output_tokens: 300, output_tokens_details: { reasoning_tokens: 120 }, total_tokens: 1500 }),
    ).toEqual({ inputTokens: 1200, cachedInputTokens: 200, outputTokens: 300, reasoningTokens: 120, totalTokens: 1500 });
    expect(extractUsage(undefined)).toEqual({ inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null });
  });

  it("estimates cost from the price table, with cached input discounted", () => {
    // gpt-5-mini reference: $0.25 / 1M input, $0.025 cached, $2.00 output
    expect(estimateCostUsd("gpt-5-mini", usage(1_000_000, 0))).toBe(0.25);
    expect(estimateCostUsd("gpt-5-mini", usage(1000, 500, 400))).toBeCloseTo((600 * 0.25 + 400 * 0.025 + 500 * 2) / 1e6, 9);
  });

  it("matches dated model snapshots by prefix and returns null for unknown models", () => {
    expect(findPrice("gpt-5-mini-2025-08-07")).toEqual(findPrice("gpt-5-mini"));
    expect(findPrice("gpt-5")).not.toEqual(findPrice("gpt-5-mini"));
    expect(estimateCostUsd("some-new-model", usage(10, 10))).toBeNull();
    expect(estimateCostUsd("gpt-5-mini", { ...usage(10, 10), outputTokens: null })).toBeNull();
  });

  it("accepts OPENAI_PRICING_JSON overrides and ignores malformed ones", () => {
    const table = priceTable('{"my-model":{"input":1,"output":4},"bad":{"input":"x"}}');
    expect(estimateCostUsd("my-model", usage(1_000_000, 1_000_000), table)).toBe(5);
    expect(table.bad).toBeUndefined();
    expect(priceTable("not json")["gpt-5-mini"]).toBeDefined();
  });
});
