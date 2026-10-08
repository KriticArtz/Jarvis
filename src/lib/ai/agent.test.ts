import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext, ToolResult } from "@/lib/assistant/actions/types";

const create = vi.fn();
vi.mock("./client", () => ({ getAI: () => ({ client: { responses: { create } }, model: "gpt-5-mini" }), logAIError: vi.fn() }));
vi.mock("./usage", () => ({ recordUsage: vi.fn() }));
const pending = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/assistant/actions/registry", async (orig) => {
  const actual = await orig<typeof import("@/lib/assistant/actions/registry")>();
  return { ...actual, pendingProposals: (...a: unknown[]) => pending(...a) };
});

const { runAssistantTurn, MAX_TOOL_CALLS } = await import("./agent");
const { FAILED_ACTION_NOTE, PARTIAL_ACTION_NOTE } = await import("./agent-rules");

const ctx = { userId: "server-user", conversationId: "c1", today: "2026-09-29", timezone: "UTC", channel: "app", turnStartedAt: "2026-09-29T20:00:00Z", db: {} } as unknown as ToolContext;
const call = (name: string, args: object, id = "call_1") => ({ type: "function_call", call_id: id, name, arguments: JSON.stringify(args) });
const reply = (output: unknown[], text = "") => ({ id: "resp", output, output_text: text, usage: null });
const run = (runToolFn: (c: ToolContext, n: string, a: string) => Promise<ToolResult>, extra = {}) =>
  runAssistantTurn({ messages: [{ role: "user", content: "hi" }], ctx, meta: { userId: "server-user", feature: "chat" }, stream: false, maxOutputTokens: 500, runToolFn, ...extra });

beforeEach(() => {
  create.mockReset();
  pending.mockReset().mockResolvedValue([]);
});

describe("assistant tool loop", () => {
  it("answers normally when no tool is needed", async () => {
    create.mockResolvedValueOnce(reply([{ type: "message" }], "Focus on your capstone first."));
    const tool = vi.fn();
    const out = await run(tool);
    expect(out).toEqual({ text: "Focus on your capstone first.", actions: [] });
    expect(tool).not.toHaveBeenCalled();
    const params = create.mock.calls[0][0];
    expect(params.store).toBe(false);
    expect(params.tools.map((t: { name: string }) => t.name)).toContain("complete_task");
  });

  it("runs the requested tool with the SERVER's user and feeds the result back", async () => {
    create
      .mockResolvedValueOnce(reply([call("complete_task", { task_id: "t1", user_id: "attacker" })]))
      .mockResolvedValueOnce(reply([{ type: "message" }], "Done — marked your workout complete."));
    const tool = vi.fn().mockResolvedValue({ status: "succeeded", message: "Marked “Workout” done." });
    const events: unknown[] = [];
    const out = await run(tool, { onEvent: (e: unknown) => events.push(e) });

    expect(tool).toHaveBeenCalledOnce();
    expect(tool.mock.calls[0][0].userId).toBe("server-user");
    expect(tool.mock.calls[0][1]).toBe("complete_task");
    const secondInput = create.mock.calls[1][0].input;
    const output = secondInput.find((i: { type?: string }) => i.type === "function_call_output");
    expect(output.call_id).toBe("call_1");
    expect(JSON.parse(output.output)).toMatchObject({ status: "succeeded", message: "Marked “Workout” done." });
    expect(out.text).toBe("Done — marked your workout complete.");
    expect(out.actions).toEqual([{ tool: "complete_task", status: "succeeded", message: "Marked “Workout” done." }]);
    expect(events).toContainEqual(expect.objectContaining({ type: "action", status: "running" }));
    expect(events).toContainEqual(expect.objectContaining({ type: "action", status: "succeeded", label: "Marked “Workout” done." }));
  });

  it("streams the tool's result card but never sends it to the model", async () => {
    const card = { v: 1, kind: "task", action: "moved", title: "Workout", when: { date: "2026-09-30", start: "17:30", end: null, allDay: false, lastDate: null }, durationMinutes: 45, previous: null };
    create
      .mockResolvedValueOnce(reply([call("reschedule_task", { task_id: "t1", date: "tomorrow", start_time: "17:30" })]))
      .mockResolvedValueOnce(reply([{ type: "message" }], "Moved it."));
    const events: { type: string; status?: string; card?: unknown }[] = [];
    await run(vi.fn().mockResolvedValue({ status: "succeeded", message: "Moved “Workout” to tomorrow at 5:30 PM.", card }), { onEvent: (e: { type: string }) => events.push(e) });
    expect(events.find((e) => e.status === "succeeded")?.card).toEqual(card);
    const fed = JSON.parse(create.mock.calls[1][0].input.find((i: { type?: string }) => i.type === "function_call_output").output);
    expect(fed).not.toHaveProperty("card");
  });

  it("never streams a result card with a failure, and drops cards outside the schema", async () => {
    const card = { v: 1, kind: "goal", action: "created", title: "Run", detail: null };
    create
      .mockResolvedValueOnce(reply([call("create_goal", {}, "c1"), call("create_goal", {}, "c2")]))
      .mockResolvedValueOnce(reply([{ type: "message" }], "Hmm."));
    const tool = vi
      .fn()
      .mockResolvedValueOnce({ status: "failed", error: "server_error", message: "I couldn't create that goal.", card })
      .mockResolvedValueOnce({ status: "succeeded", message: "Created.", card: { ...card, onclick: "x" } });
    const events: { type: string; status?: string; card?: unknown; error?: string }[] = [];
    await run(tool, { onEvent: (e: { type: string }) => events.push(e) });
    const failed = events.find((e) => e.status === "failed");
    expect(failed?.card).toBeUndefined();
    expect(failed?.error).toBe("server_error");
    expect(events.find((e) => e.status === "succeeded")?.card).toBeUndefined();
  });

  it("says which proposal a typed yes / no answered — only when it succeeded", async () => {
    const pid = "11111111-2222-4333-8444-555555555555";
    create
      .mockResolvedValueOnce(reply([call("confirm_action", { confirmation_id: pid }, "c1"), call("decline_action", { confirmation_id: pid }, "c2"), call("complete_task", { task_id: "t" }, "c3")]))
      .mockResolvedValueOnce(reply([{ type: "message" }], "Done."));
    const tool = vi
      .fn()
      .mockResolvedValueOnce({ status: "succeeded", message: "Moved it." })
      .mockResolvedValueOnce({ status: "failed", error: "not_found", message: "I couldn't find that pending change." })
      .mockResolvedValueOnce({ status: "succeeded", message: "Marked done." });
    const events: { type: string; callId?: string; status?: string; resolves?: unknown }[] = [];
    await run(tool, { onEvent: (e: { type: string }) => events.push(e) });
    const final = (id: string) => events.filter((e) => e.callId === id).pop();
    expect(final("c1")?.resolves).toEqual({ confirmationId: pid, decision: "confirm" });
    expect(final("c2")?.resolves).toBeUndefined(); // failed: the proposal wasn't answered
    expect(final("c3")?.resolves).toBeUndefined(); // not a confirmation
  });

  it("never lets a failed action read as a success", async () => {
    create
      .mockResolvedValueOnce(reply([call("reschedule_task", { task_id: "nope", date: "tomorrow", start_time: "keep" })]))
      .mockResolvedValueOnce(reply([{ type: "message" }], "Done! I've moved your workout to tomorrow."));
    const out = await run(vi.fn().mockResolvedValue({ status: "failed", error: "not_found", message: "I couldn't find that task." }));
    expect(out.text.endsWith(FAILED_ACTION_NOTE)).toBe(true);
    const fed = JSON.parse(create.mock.calls[1][0].input.find((i: { type?: string }) => i.type === "function_call_output").output);
    expect(fed.instruction).toMatch(/did NOT happen/);
  });

  it("a part-applied plan is never called a full success, nor 'nothing changed'", async () => {
    create
      .mockResolvedValueOnce(reply([call("confirm_action", { confirmation_id: "p1" })]))
      .mockResolvedValueOnce(reply([{ type: "message" }], "Done — your day is updated."));
    const out = await run(vi.fn().mockResolvedValue({ status: "failed", error: "partial_failure", message: "Some of the plan was applied, but one item couldn't be scheduled: “Walk”." }));
    expect(out.text.endsWith(PARTIAL_ACTION_NOTE)).toBe(true);
    expect(out.text).not.toContain(FAILED_ACTION_NOTE);
  });

  it("leaves an honest failure reply untouched", async () => {
    create
      .mockResolvedValueOnce(reply([call("complete_task", { task_id: "x" })]))
      .mockResolvedValueOnce(reply([{ type: "message" }], "I couldn't find that task. Want me to show today's list?"));
    const out = await run(vi.fn().mockResolvedValue({ status: "failed", error: "not_found", message: "I couldn't find that task." }));
    expect(out.text).toBe("I couldn't find that task. Want me to show today's list?");
  });

  it("turns a crashing tool into a safe failure", async () => {
    create.mockResolvedValueOnce(reply([call("save_memory", { content: "x" })])).mockResolvedValueOnce(reply([{ type: "message" }], "Saved!"));
    const out = await run(vi.fn().mockRejectedValue(new Error("db exploded: password=hunter2")));
    expect(out.actions[0]).toMatchObject({ status: "failed" });
    expect(out.actions[0].message).not.toMatch(/exploded|hunter2/);
    expect(out.text.endsWith(FAILED_ACTION_NOTE)).toBe(true);
  });

  it("passes proposals back with their confirmation id", async () => {
    create.mockResolvedValueOnce(reply([call("delete_goal", { goal_id: "g" })])).mockResolvedValueOnce(reply([{ type: "message" }], "Delete your business goal? Say yes to confirm."));
    const out = await run(vi.fn().mockResolvedValue({ status: "needs_confirmation", message: "Delete the goal “Business”", confirmationId: "p1" }));
    const fed = JSON.parse(create.mock.calls[1][0].input.find((i: { type?: string }) => i.type === "function_call_output").output);
    expect(fed).toMatchObject({ status: "needs_confirmation", confirmation_id: "p1" });
    expect(out.text).not.toContain(FAILED_ACTION_NOTE);
  });

  it("lists pending proposals so a later 'yes' can be confirmed", async () => {
    pending.mockResolvedValueOnce([{ id: "p1", summary: "Delete the goal “Business”", created_at: new Date().toISOString() }]);
    create.mockResolvedValueOnce(reply([{ type: "message" }], "ok"));
    await run(vi.fn());
    const system = create.mock.calls[0][0].input.find((i: { role?: string; content?: string }) => i.role === "system" && i.content?.includes("Pending changes"));
    expect(system.content).toContain("confirmation id p1");
  });

  it("caps tool calls per message and then forces a text answer", async () => {
    const many = Array.from({ length: MAX_TOOL_CALLS + 3 }, (_, i) => call("save_memory", { content: `m${i}` }, `c${i}`));
    create.mockResolvedValueOnce(reply(many)).mockResolvedValue(reply([{ type: "message" }], "Saved several."));
    const tool = vi.fn().mockResolvedValue({ status: "succeeded", message: "Saved." });
    const out = await run(tool);
    expect(tool).toHaveBeenCalledTimes(MAX_TOOL_CALLS);
    expect(out.actions.filter((a) => a.status === "failed")).toHaveLength(3);
    expect(create.mock.calls.at(-1)?.[0].tool_choice).toBe("none");
  });

  it("streams text and actions", async () => {
    async function* round1() {
      yield { type: "response.output_text.delta", delta: "One sec. " };
      yield { type: "response.completed", response: { id: "r1", output: [call("create_task", { title: "Call mom" })], usage: null } };
    }
    async function* round2() {
      yield { type: "response.output_text.delta", delta: "Added it." };
      yield { type: "response.completed", response: { id: "r2", output: [], usage: null } };
    }
    create.mockResolvedValueOnce(round1()).mockResolvedValueOnce(round2());
    const events: { type: string }[] = [];
    const out = await run(vi.fn().mockResolvedValue({ status: "succeeded", message: "Added “Call mom” for today." }), { stream: true, onEvent: (e: { type: string }) => events.push(e) });
    expect(out.text).toBe("One sec. \n\nAdded it.");
    expect(events.map((e) => e.type)).toEqual(["text", "action", "action", "text", "text"]);
  });
});
