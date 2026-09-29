/**
 * Reasoning models (gpt-5*, o-series) spend hidden reasoning tokens out of
 * `max_completion_tokens`. Without headroom a small budget can be used up
 * entirely by reasoning, returning an empty reply. For those models we request
 * low reasoning effort and add headroom; other models get the budget as-is
 * (they reject `reasoning_effort`).
 */
const REASONING_HEADROOM = 4000;

export function isReasoningModel(model: string): boolean {
  const m = model.toLowerCase();
  if (m.includes("chat-latest")) return false;
  return /^(gpt-5|o\d)/.test(m);
}

export function completionParams(
  model: string,
  visibleTokens: number,
): { max_completion_tokens: number; reasoning_effort?: "low" } {
  if (isReasoningModel(model)) {
    return { max_completion_tokens: visibleTokens + REASONING_HEADROOM, reasoning_effort: "low" };
  }
  return { max_completion_tokens: visibleTokens };
}
