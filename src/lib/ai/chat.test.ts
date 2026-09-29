import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const recordUsage = vi.fn();
vi.mock("./client", () => ({
  getAI: () => ({ client: { responses: { create } }, model: "gpt-5-mini" }),
  logAIError: vi.fn(),
}));
vi.mock("./usage", () => ({ recordUsage: (e: unknown) => recordUsage(e) }));

const { completeReply, completeJSON, streamReply } = await import("./chat");

const USAGE = { input_tokens: 900, input_tokens_details: { cached_tokens: 100 }, output_tokens: 200, output_tokens_details: { reasoning_tokens: 50 }, total_tokens: 1100 };
const meta = { userId: "user-1", feature: "insight" as const };

beforeEach(() => {
  create.mockReset();
  recordUsage.mockReset();
});

describe("AI usage tracking", () => {
  it("records a successful reply with tokens, model and feature", async () => {
    create.mockResolvedValue({ id: "resp_1", status: "completed", output_text: "Do the workout first.", usage: USAGE });
    expect(await completeReply([{ role: "user", content: "hi" }], meta)).toBe("Do the workout first.");
    expect(recordUsage).toHaveBeenCalledOnce();
    expect(recordUsage.mock.calls[0][0]).toMatchObject({
      userId: "user-1",
      feature: "insight",
      model: "gpt-5-mini",
      status: "ok",
      requestId: "resp_1",
      usage: { inputTokens: 900, cachedInputTokens: 100, outputTokens: 200, reasoningTokens: 50, totalTokens: 1100 },
    });
    expect(create.mock.calls[0][0]).toMatchObject({ store: false });
  });

  it("records empty replies and failures", async () => {
    create.mockResolvedValueOnce({ id: "resp_2", status: "incomplete", output_text: "", usage: USAGE });
    expect(await completeReply([], meta)).toBeNull();
    expect(recordUsage.mock.calls[0][0]).toMatchObject({ status: "empty" });

    create.mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429, requestID: "req_9" }));
    expect(await completeReply([], meta)).toBeNull();
    expect(recordUsage.mock.calls[1][0]).toMatchObject({ status: "error", errorCode: "429", requestId: "req_9" });
  });

  it("records structured (plan) calls", async () => {
    create.mockResolvedValue({ id: "resp_3", status: "completed", output_text: '{"items":[]}', usage: USAGE });
    expect(await completeJSON([], "daily_plan", {}, { userId: "u", feature: "plan" })).toEqual({ items: [] });
    expect(recordUsage.mock.calls[0][0]).toMatchObject({ feature: "plan", status: "ok" });
  });

  it("records streamed chat after the stream completes", async () => {
    async function* events() {
      yield { type: "response.output_text.delta", delta: "Hel" };
      yield { type: "response.output_text.delta", delta: "lo" };
      yield { type: "response.completed", response: { id: "resp_4", usage: USAGE } };
    }
    create.mockResolvedValue(events());
    let text = "";
    for await (const d of streamReply([], { userId: "u", feature: "chat" })) text += d;
    expect(text).toBe("Hello");
    expect(recordUsage).toHaveBeenCalledOnce();
    expect(recordUsage.mock.calls[0][0]).toMatchObject({ feature: "chat", status: "ok", requestId: "resp_4", usage: { totalTokens: 1100 } });
  });

  it("records a failed stream and rethrows", async () => {
    async function* events() {
      yield { type: "response.output_text.delta", delta: "Hi" };
      yield { type: "error", message: "server error", code: "server_error" };
    }
    create.mockResolvedValue(events());
    const run = async () => {
      for await (const d of streamReply([], { userId: "u", feature: "chat" })) void d;
    };
    await expect(run()).rejects.toThrow("server error");
    expect(recordUsage.mock.calls[0][0]).toMatchObject({ status: "error", errorCode: "server_error" });
  });
});
