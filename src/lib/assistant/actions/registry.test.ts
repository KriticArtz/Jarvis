import { describe, expect, it, vi } from "vitest";
import { isMajorGoalChange } from "./goals";
import { ACTION_TOOLS, isMutating, openAITools, runTool, TOOL_NAMES } from "./registry";
import type { ToolContext } from "./types";

/** A db that fails the test if anything touches it. */
const untouchableDb = new Proxy({}, { get: () => { throw new Error("database must not be touched"); } });
const ctx: ToolContext = {
  db: untouchableDb as ToolContext["db"],
  userId: "11111111-1111-4111-8111-111111111111",
  timezone: "UTC",
  today: "2026-09-29",
  channel: "app",
  conversationId: "22222222-2222-4222-8222-222222222222",
  turnStartedAt: "2026-09-29T20:00:00Z",
};
const ID = "33333333-3333-4333-8333-333333333333";

type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean; anyOf?: Schema[] };

function assertStrict(schema: Schema, path: string) {
  expect(schema.type, path).toBe("object");
  expect(schema.additionalProperties, path).toBe(false);
  expect([...(schema.required ?? [])].sort(), path).toEqual(Object.keys(schema.properties ?? {}).sort());
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    expect(key.toLowerCase(), `${path}.${key}`).not.toMatch(/^user(_?id)?$/);
    for (const variant of prop.anyOf ?? [prop]) if (variant.type === "object") assertStrict(variant, `${path}.${key}`);
  }
}

describe("tool registry", () => {
  it("exposes exactly the intended tools", () => {
    expect(TOOL_NAMES.sort()).toEqual(
      [
        "cancel_task", "complete_task", "confirm_action", "create_goal", "create_task", "decline_action", "delete_goal",
        "delete_memory", "get_goal_progress", "list_tasks", "record_progress", "replan_today", "reschedule_task",
        "save_memory", "set_goal_status", "update_goal", "update_memory",
      ].sort(),
    );
    expect(new Set(TOOL_NAMES).size).toBe(TOOL_NAMES.length);
  });

  it("sends only strict schemas, and no tool accepts a user id", () => {
    for (const tool of openAITools()) {
      expect(tool.strict).toBe(true);
      assertStrict(tool.parameters as Schema, tool.name);
    }
  });

  it("classifies consequential tools as needing confirmation", () => {
    const risk = Object.fromEntries(ACTION_TOOLS.map((t) => [t.name, t.risk]));
    for (const name of ["cancel_task", "delete_goal", "delete_memory", "replan_today"]) expect(risk[name]).toBe("confirm");
    for (const name of ["create_task", "complete_task", "reschedule_task", "record_progress", "save_memory", "create_goal", "set_goal_status"]) {
      expect(risk[name]).toBe("direct");
    }
    expect(risk.list_tasks).toBe("read");
    expect(isMutating("list_tasks")).toBe(false);
    expect(isMutating("confirm_action")).toBe(true);
  });

  it("requires confirmation only for major goal changes", () => {
    const base = { goal_id: ID, title: null, description: null, category: null, priority: null, target_value: null, target_unit: null, period: null, due_date: null };
    expect(isMajorGoalChange({ ...base, title: "New name" })).toBe(false);
    expect(isMajorGoalChange({ ...base, priority: "high" })).toBe(false);
    expect(isMajorGoalChange({ ...base, target_value: 3 })).toBe(true);
    expect(isMajorGoalChange({ ...base, period: "month" })).toBe(true);
  });
});

describe("input validation (rejected before any database access)", () => {
  const invalid: [string, unknown][] = [
    ["create_task", { title: "", date: "today", start_time: null, duration_minutes: null, goal_id: null, is_priority: false }],
    ["create_task", { title: "Run", date: "someday", start_time: null, duration_minutes: null, goal_id: null, is_priority: false }],
    ["create_task", { title: "Run", date: "today", start_time: "25:00", duration_minutes: null, goal_id: null, is_priority: false }],
    ["create_task", { title: "Run", date: "today", start_time: null, duration_minutes: 99999, goal_id: null, is_priority: false }],
    ["create_task", { title: "Run", date: "today", start_time: null, duration_minutes: null, goal_id: "not-a-uuid", is_priority: false }],
    ["complete_task", { task_id: "1; drop table tasks" }],
    ["complete_task", {}],
    ["reschedule_task", { task_id: ID, date: "tomorrow", start_time: "evening" }],
    ["cancel_task", { task_id: ID, mode: "shred" }],
    ["create_goal", { title: "x", description: null, category: "fitness", goal_type: "forever", target_value: null, target_unit: null, period: null, due_date: null, priority: "high" }],
    ["create_goal", { title: "x", description: null, category: "fitness", goal_type: "recurring", target_value: -3, target_unit: null, period: "week", due_date: null, priority: "high" }],
    ["update_goal", { goal_id: ID, title: null, description: null, category: null, priority: null, target_value: null, target_unit: null, period: null, due_date: null }],
    ["set_goal_status", { goal_id: ID, status: "archived" }],
    ["record_progress", { goal_id: ID, amount: 0, note: null, date: null }],
    ["record_progress", { goal_id: ID, amount: 1e9, note: null, date: null }],
    ["save_memory", { content: "" }],
    ["save_memory", { content: "x".repeat(501) }],
    ["update_memory", { memory_id: ID, content: "" }],
    ["delete_memory", { memory_id: "abc" }],
    ["replan_today", { available_start: "21:00", available_end: "20:00", note: null }],
    ["confirm_action", { confirmation_id: "not-a-uuid" }],
    ["list_tasks", { from_date: "whenever", to_date: null, include_completed: false }],
  ];
  it.each(invalid)("%s rejects %j", async (name, args) => {
    const result = await runTool(ctx, name, JSON.stringify(args));
    expect(result.status).toBe("failed");
    expect(result.error).toBe("invalid_input");
  });

  it("rejects unknown tools and malformed arguments without touching data", async () => {
    expect(await runTool(ctx, "run_sql", '{"query":"select * from profiles"}')).toMatchObject({ status: "failed", error: "not_allowed" });
    expect(await runTool(ctx, "complete_task", "{not json")).toMatchObject({ status: "failed", error: "invalid_input" });
  });

  it("never takes the user from the arguments", async () => {
    // Extra properties (like a user id) are not accepted into a valid call.
    const spy = vi.fn();
    const result = await runTool({ ...ctx, db: new Proxy({}, { get: () => spy }) as ToolContext["db"] }, "complete_task", JSON.stringify({ task_id: ID, user_id: "someone-else" }));
    // Zod objects strip unknown keys; the only user the tool can use is ctx.userId.
    expect(result.status).toBe("failed"); // proxy db can't return a task → safe failure
    expect(JSON.stringify(result)).not.toContain("someone-else");
  });
});
