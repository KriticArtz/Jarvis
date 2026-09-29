import { describe, expect, it } from "vitest";
import { isReasoningModel, responseParams } from "./model-params";

describe("responseParams", () => {
  it("adds reasoning headroom for reasoning models", () => {
    expect(isReasoningModel("gpt-5-mini")).toBe(true);
    expect(isReasoningModel("o4-mini")).toBe(true);
    expect(responseParams("gpt-5-mini", 300)).toEqual({ max_output_tokens: 4300, reasoning: { effort: "low" } });
  });

  it("leaves non-reasoning models unchanged", () => {
    expect(isReasoningModel("gpt-4.1-mini")).toBe(false);
    expect(isReasoningModel("gpt-5-chat-latest")).toBe(false);
    expect(responseParams("gpt-4o", 300)).toEqual({ max_output_tokens: 300 });
  });
});
