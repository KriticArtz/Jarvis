/**
 * Every assistant tool against a real Supabase stack with real RLS.
 * Run: npm run test:integration (needs `supabase start`). Uses:
 *   INTEGRATION_SUPABASE_URL (default http://127.0.0.1:54321)
 *   INTEGRATION_SUPABASE_PUBLISHABLE_KEY / INTEGRATION_SUPABASE_SECRET_KEY
 * Skips itself if the stack isn't reachable.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { localDate } from "@/lib/time";
import { runTool } from "./registry";
import type { ToolContext } from "./types";

const URL = process.env.INTEGRATION_SUPABASE_URL ?? "http://127.0.0.1:54321";
const PUBLISHABLE = process.env.INTEGRATION_SUPABASE_PUBLISHABLE_KEY ?? "";
const SECRET = process.env.INTEGRATION_SUPABASE_SECRET_KEY ?? "";
const reachable = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: PUBLISHABLE } }).then((r) => r.ok).catch(() => false);
const enabled = reachable && Boolean(PUBLISHABLE && SECRET);

type DB = SupabaseClient;
const today = localDate("UTC");
const later = () => new Date(Date.now() + 1500).toISOString(); // a "later message"
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let admin: DB;
const users: Record<"a" | "b", { id: string; db: DB; conv: string }> = {} as never;
const seed = { taskA: "", goalA: "", memoryA: "", convA: "" };

async function makeUser(tag: string) {
  const email = `it-${tag}-${Date.now()}@lifepilot.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "integration-pass-1", email_confirm: true });
  if (error) throw error;
  const db = createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await db.auth.signInWithPassword({ email, password: "integration-pass-1" });
  if (signInError) throw signInError;
  await db.from("profiles").update({ timezone: "UTC", wake_time: "00:00", sleep_time: "23:59", onboarding_completed_at: new Date().toISOString() }).eq("id", data.user.id);
  const { data: conv } = await db.from("conversations").insert({ user_id: data.user.id, channel: "app" }).select("id").single();
  return { id: data.user.id, db, conv: conv!.id as string };
}

function ctxFor(who: "a" | "b", opts: { db?: DB; conv?: string; turn?: string } = {}): ToolContext {
  const u = users[who];
  return { db: (opts.db ?? u.db) as ToolContext["db"], userId: u.id, timezone: "UTC", today, channel: "app", conversationId: opts.conv ?? u.conv, turnStartedAt: opts.turn ?? new Date().toISOString() };
}
const call = (ctx: ToolContext, name: string, args: object) => runTool(ctx, name, JSON.stringify(args));

describe.skipIf(!enabled)("assistant actions (real Supabase, RLS)", () => {
  beforeAll(async () => {
    admin = createClient(URL, SECRET, { auth: { persistSession: false } });
    users.a = await makeUser("a");
    users.b = await makeUser("b");
    const a = users.a;
    const { data: goal } = await a.db.from("goals").insert({ user_id: a.id, title: "Work out", category: "fitness", goal_type: "recurring", target_value: 4, target_unit: "times", period: "week" }).select("id").single();
    const { data: task } = await a.db.from("tasks").insert({ user_id: a.id, title: "Workout", task_date: today, scheduled_start: "18:00", duration_minutes: 45, goal_id: goal!.id, is_priority: true }).select("id").single();
    const { data: memory } = await a.db.from("user_memories").insert({ user_id: a.id, content: "Prefers mornings" }).select("id").single();
    Object.assign(seed, { taskA: task!.id, goalA: goal!.id, memoryA: memory!.id, convA: a.conv });
  });

  // ---------------------------------------------------------------- tasks
  it("create_task adds a task (and refuses someone else's goal)", async () => {
    const res = await call(ctxFor("a"), "create_task", { title: "Call mom", date: "tomorrow", start_time: "19:00", duration_minutes: 20, goal_id: null, is_priority: false });
    expect(res).toMatchObject({ status: "succeeded" });
    expect(res.message).toContain("tomorrow at 7:00 PM");
    const bad = await call(ctxFor("b"), "create_task", { title: "x", date: "today", start_time: null, duration_minutes: null, goal_id: seed.goalA, is_priority: false });
    expect(bad).toMatchObject({ status: "failed", error: "not_found" });
  });

  it("complete_task marks it done and logs goal progress", async () => {
    const res = await call(ctxFor("a"), "complete_task", { task_id: seed.taskA });
    expect(res).toMatchObject({ status: "succeeded", message: "Marked “Workout” done." });
    const { data: progress } = await users.a.db.from("goal_progress").select("amount, source").eq("task_id", seed.taskA);
    expect(progress).toEqual([{ amount: 1, source: "task" }]);
    expect((await call(ctxFor("a"), "complete_task", { task_id: seed.taskA })).message).toMatch(/already done/);
  });

  it("reschedule_task moves a task to another day and time", async () => {
    const { data: t } = await users.a.db.from("tasks").insert({ user_id: users.a.id, title: "Study", task_date: today, scheduled_start: "20:00" }).select("id").single();
    const res = await call(ctxFor("a"), "reschedule_task", { task_id: t!.id, date: "tomorrow", start_time: "keep" });
    expect(res).toMatchObject({ status: "succeeded" });
    const { data: row } = await users.a.db.from("tasks").select("task_date, scheduled_start").eq("id", t!.id).single();
    expect(row).toEqual({ task_date: localDate("UTC", new Date(Date.now() + 86_400_000)), scheduled_start: "20:00:00" });
    const done = await call(ctxFor("a"), "reschedule_task", { task_id: seed.taskA, date: "tomorrow", start_time: "keep" });
    expect(done).toMatchObject({ status: "failed", error: "conflict" });
    expect(await call(ctxFor("a"), "reschedule_task", { task_id: t!.id, date: "yesterday", start_time: "keep" })).toMatchObject({ status: "failed" });
  });

  it("cancel_task needs confirmation in a later message, runs once, and never in the same turn", async () => {
    const { data: t } = await users.a.db.from("tasks").insert({ user_id: users.a.id, title: "Laundry", task_date: today }).select("id").single();
    const turn1 = new Date().toISOString();
    await wait(50);
    const proposal = await call(ctxFor("a", { turn: turn1 }), "cancel_task", { task_id: t!.id, mode: "delete" });
    expect(proposal).toMatchObject({ status: "needs_confirmation" });
    expect(proposal.message).toContain("Delete “Laundry”");
    expect((await users.a.db.from("tasks").select("id").eq("id", t!.id)).data).toHaveLength(1); // not deleted yet

    const sameTurn = await call(ctxFor("a", { turn: turn1 }), "confirm_action", { confirmation_id: proposal.confirmationId });
    expect(sameTurn).toMatchObject({ status: "failed", error: "not_allowed" });

    const confirmed = await call(ctxFor("a", { turn: later() }), "confirm_action", { confirmation_id: proposal.confirmationId });
    expect(confirmed).toMatchObject({ status: "succeeded", message: "Deleted “Laundry”." });
    expect((await users.a.db.from("tasks").select("id").eq("id", t!.id)).data).toHaveLength(0);

    const replay = await call(ctxFor("a", { turn: later() }), "confirm_action", { confirmation_id: proposal.confirmationId });
    expect(replay).toMatchObject({ status: "failed" });
  });

  it("list_tasks only returns the caller's tasks", async () => {
    const res = await call(ctxFor("b"), "list_tasks", { from_date: "yesterday", to_date: "tomorrow", include_completed: true });
    expect(res.status).toBe("info");
    expect((res.data?.tasks as unknown[]).length).toBe(0);
    const mine = await call(ctxFor("a"), "list_tasks", { from_date: "today", to_date: "tomorrow", include_completed: true });
    expect((mine.data?.tasks as unknown[]).length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------- goals & progress
  it("create_goal creates a goal and rejects duplicates and invalid shapes", async () => {
    const args = { title: "Read", description: null, category: "reading", goal_type: "recurring", target_value: 3, target_unit: "times", period: "week", due_date: null, priority: "medium" };
    const res = await call(ctxFor("a"), "create_goal", args);
    expect(res).toMatchObject({ status: "succeeded" });
    expect(res.message).toContain("3 times per week");
    expect(await call(ctxFor("a"), "create_goal", args)).toMatchObject({ status: "failed", error: "conflict" });
    expect(await call(ctxFor("a"), "create_goal", { ...args, title: "Nap", period: null })).toMatchObject({ status: "failed", error: "invalid_input" });
  });

  it("update_goal: renames directly, target changes need confirmation", async () => {
    const empty = { title: null, description: null, category: null, priority: null, target_value: null, target_unit: null, period: null, due_date: null };
    expect(await call(ctxFor("a"), "update_goal", { ...empty, goal_id: seed.goalA, priority: "high" })).toMatchObject({ status: "succeeded" });
    const turn = new Date().toISOString();
    await wait(50);
    const proposal = await call(ctxFor("a", { turn }), "update_goal", { ...empty, goal_id: seed.goalA, target_value: 3 });
    expect(proposal).toMatchObject({ status: "needs_confirmation" });
    expect(proposal.message).toContain("from 4 times per week to 3 times per week");
    expect((await users.a.db.from("goals").select("target_value").eq("id", seed.goalA).single()).data?.target_value).toBe(4);
    expect(await call(ctxFor("a", { turn: later() }), "confirm_action", { confirmation_id: proposal.confirmationId })).toMatchObject({ status: "succeeded" });
    expect((await users.a.db.from("goals").select("target_value").eq("id", seed.goalA).single()).data?.target_value).toBe(3);
  });

  it("set_goal_status pauses and resumes", async () => {
    expect(await call(ctxFor("a"), "set_goal_status", { goal_id: seed.goalA, status: "paused" })).toMatchObject({ status: "succeeded" });
    expect((await users.a.db.from("goals").select("status").eq("id", seed.goalA).single()).data?.status).toBe("paused");
    expect(await call(ctxFor("a"), "set_goal_status", { goal_id: seed.goalA, status: "active" })).toMatchObject({ status: "succeeded" });
  });

  it("record_progress logs progress and reports the new total", async () => {
    const res = await call(ctxFor("a"), "record_progress", { goal_id: seed.goalA, amount: 1, note: "Morning run", date: null });
    expect(res).toMatchObject({ status: "succeeded" });
    expect(res.message).toMatch(/Logged 1 time toward “Work out” — now 2\/3 times this week/);
    const { data } = await users.a.db.from("goal_progress").select("source").eq("goal_id", seed.goalA).eq("source", "assistant");
    expect(data).toHaveLength(1);
    expect(await call(ctxFor("a"), "record_progress", { goal_id: seed.goalA, amount: 1, note: null, date: "tomorrow" })).toMatchObject({ status: "failed" });
    const summary = await call(ctxFor("a"), "get_goal_progress", { goal_id: seed.goalA });
    expect(summary).toMatchObject({ status: "info" });
    expect(summary.data?.entries_logged).toBe(2);
  });

  it("delete_goal only proposes; declining keeps the goal", async () => {
    const turn = new Date().toISOString();
    await wait(50);
    const proposal = await call(ctxFor("a", { turn }), "delete_goal", { goal_id: seed.goalA });
    expect(proposal).toMatchObject({ status: "needs_confirmation" });
    expect(await call(ctxFor("a", { turn: later() }), "decline_action", { confirmation_id: proposal.confirmationId })).toMatchObject({ status: "succeeded" });
    expect(await call(ctxFor("a", { turn: later() }), "confirm_action", { confirmation_id: proposal.confirmationId })).toMatchObject({ status: "failed" });
    expect((await users.a.db.from("goals").select("id").eq("id", seed.goalA)).data).toHaveLength(1);
  });

  // ---------------------------------------------------------------- memories
  it("save, update and (with confirmation) delete memories", async () => {
    const saved = await call(ctxFor("a"), "save_memory", { content: "I prefer studying in the morning." });
    expect(saved).toMatchObject({ status: "succeeded" });
    expect((await call(ctxFor("a"), "save_memory", { content: "I prefer studying in the morning." })).message).toMatch(/already/);
    const id = saved.data?.memory_id as string;
    expect(await call(ctxFor("a"), "update_memory", { memory_id: id, content: "I prefer studying before 9 AM." })).toMatchObject({ status: "succeeded" });
    const turn = new Date().toISOString();
    await wait(50);
    const proposal = await call(ctxFor("a", { turn }), "delete_memory", { memory_id: id });
    expect(proposal).toMatchObject({ status: "needs_confirmation" });
    expect(await call(ctxFor("a", { turn: later() }), "confirm_action", { confirmation_id: proposal.confirmationId })).toMatchObject({ status: "succeeded" });
    expect((await users.a.db.from("user_memories").select("id").eq("id", id)).data).toHaveLength(0);
  });

  // ---------------------------------------------------------------- planning
  it("replan_today proposes a new schedule and applies exactly that plan on confirmation", async () => {
    await users.a.db.from("tasks").insert({ user_id: users.a.id, title: "Deep work", task_date: today, scheduled_start: "23:00", duration_minutes: 30 });
    const turn = new Date().toISOString();
    await wait(50);
    const proposal = await call(ctxFor("a", { turn }), "replan_today", { available_start: "00:00", available_end: "23:59", note: "working late" });
    if (proposal.status === "info") return; // no free time left today at this hour — the planner asks instead
    expect(proposal).toMatchObject({ status: "needs_confirmation" });
    expect(proposal.message).toMatch(/^New plan for today:/);
    const res = await call(ctxFor("a", { turn: later() }), "confirm_action", { confirmation_id: proposal.confirmationId });
    expect(res).toMatchObject({ status: "succeeded" });
    const { data: plans } = await users.a.db.from("daily_plans").select("status").eq("user_id", users.a.id).eq("status", "accepted");
    expect(plans!.length).toBeGreaterThan(0);
  });

  it("records every change in the user's own audit log", async () => {
    const { data } = await users.a.db.from("assistant_actions").select("tool, status").eq("user_id", users.a.id);
    const tools = new Set((data ?? []).map((r) => r.tool));
    for (const t of ["create_task", "complete_task", "reschedule_task", "cancel_task", "create_goal", "update_goal", "record_progress", "save_memory"]) expect(tools.has(t), t).toBe(true);
    expect((await users.b.db.from("assistant_actions").select("id").eq("user_id", users.a.id)).data).toEqual([]);
  });

  // ---------------------------------------------------------------- cross-user protection
  describe.each([
    ["user session (RLS)", () => undefined],
    ["service role (SMS path)", () => admin],
  ])("another user cannot touch A's data via %s", (_label, dbFor) => {
    const b = () => ctxFor("b", { db: dbFor() });

    it("tasks", async () => {
      for (const [name, args] of [
        ["complete_task", { task_id: seed.taskA }],
        ["reschedule_task", { task_id: seed.taskA, date: "tomorrow", start_time: "keep" }],
        ["cancel_task", { task_id: seed.taskA, mode: "delete" }],
      ] as const) {
        expect(await call(b(), name, args), name).toMatchObject({ status: "failed", error: "not_found" });
      }
      const { data } = await admin.from("tasks").select("status, task_date").eq("id", seed.taskA).single();
      expect(data).toEqual({ status: "done", task_date: today });
    });

    it("goals and progress", async () => {
      const empty = { title: "hacked", description: null, category: null, priority: null, target_value: null, target_unit: null, period: null, due_date: null };
      for (const [name, args] of [
        ["update_goal", { ...empty, goal_id: seed.goalA }],
        ["set_goal_status", { goal_id: seed.goalA, status: "paused" }],
        ["delete_goal", { goal_id: seed.goalA }],
        ["record_progress", { goal_id: seed.goalA, amount: 99, note: null, date: null }],
        ["get_goal_progress", { goal_id: seed.goalA }],
      ] as const) {
        expect(await call(b(), name, args), name).toMatchObject({ status: "failed", error: "not_found" });
      }
      const { data } = await admin.from("goals").select("title, status").eq("id", seed.goalA).single();
      expect(data).toEqual({ title: "Work out", status: "active" });
      expect((await admin.from("goal_progress").select("id").eq("goal_id", seed.goalA).eq("amount", 99)).data).toEqual([]);
    });

    it("memories", async () => {
      expect(await call(b(), "update_memory", { memory_id: seed.memoryA, content: "hacked" })).toMatchObject({ status: "failed", error: "not_found" });
      expect(await call(b(), "delete_memory", { memory_id: seed.memoryA })).toMatchObject({ status: "failed", error: "not_found" });
      expect((await admin.from("user_memories").select("content").eq("id", seed.memoryA).single()).data?.content).toBe("Prefers mornings");
    });

    it("plans, proposals and conversations", async () => {
      const turn = new Date().toISOString();
      await wait(50);
      const proposal = await call(ctxFor("a", { turn }), "cancel_task", { task_id: seed.taskA, mode: "skip" });
      expect(proposal.status).toBe("needs_confirmation");
      // B cannot confirm or decline A's proposal, even with the id (and even claiming A's conversation).
      expect(await call(b(), "confirm_action", { confirmation_id: proposal.confirmationId })).toMatchObject({ status: "failed" });
      expect(await call(ctxFor("b", { db: dbFor(), conv: seed.convA, turn: later() }), "confirm_action", { confirmation_id: proposal.confirmationId })).toMatchObject({ status: "failed" });
      expect(await call(b(), "decline_action", { confirmation_id: proposal.confirmationId })).toMatchObject({ status: "failed" });
      expect((await admin.from("assistant_actions").select("status").eq("id", proposal.confirmationId).single()).data?.status).toBe("pending_confirmation");
      await call(ctxFor("a", { turn: later() }), "decline_action", { confirmation_id: proposal.confirmationId });
      // A's draft plans are not reachable either.
      const { data: plan } = await admin.from("daily_plans").select("id").eq("user_id", users.a.id).limit(1).maybeSingle();
      if (plan) expect((await users.b.db.from("daily_plans").select("id").eq("id", plan.id)).data).toEqual([]);
    });
  });

  it("cannot attach a proposal to another user's conversation (RLS)", async () => {
    const { data: t } = await users.b.db.from("tasks").insert({ user_id: users.b.id, title: "B task", task_date: today }).select("id").single();
    const res = await call(ctxFor("b", { conv: seed.convA }), "cancel_task", { task_id: t!.id, mode: "delete" });
    expect(res.status).toBe("failed");
    expect((await admin.from("assistant_actions").select("id").eq("conversation_id", seed.convA).eq("user_id", users.b.id)).data).toEqual([]);
  });
});
