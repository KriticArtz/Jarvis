import { describe, expect, it } from "vitest";
import { completionParams, isReasoningModel } from "./model-params";

describe("completionParams", () => {
  it("adds reasoning headroom for reasoning models", () => {
    expect(isReasoningModel("gpt-5-mini")).toBe(true);
    expect(isReasoningModel("o4-mini")).toBe(true);
    expect(completionParams("gpt-5-mini", 300)).toEqual({ max_completion_tokens: 4300, reasoning_effort: "low" });
  });

  it("leaves non-reasoning models unchanged", () => {
    expect(isReasoningModel("gpt-4.1-mini")).toBe(false);
    expect(isReasoningModel("gpt-5-chat-latest")).toBe(false);
    expect(completionParams("gpt-4o", 300)).toEqual({ max_completion_tokens: 300 });
  });
});
