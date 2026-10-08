/**
 * Structured action results (phase 4B) against a real Supabase stack with
 * real RLS: tools build cards from real rows, the cards are stored in
 * assistant_actions.result, and a reloaded conversation rebuilds them.
 * Run: npm run test:integration (needs `supabase start`). Skips itself if the
 * stack isn't reachable.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { addDays, localDate } from "@/lib/time";
import { runTool } from "./actions/registry";
import type { ToolContext } from "./actions/types";
import { attachActions, STORED_ACTION_COLUMNS, type StoredAction } from "./history";
import { sanitizeCard } from "./cards";

const URL = process.env.INTEGRATION_SUPABASE_URL ?? "http://127.0.0.1:54321";
const PUBLISHABLE = process.env.INTEGRATION_SUPABASE_PUBLISHABLE_KEY ?? "";
const SECRET = process.env.INTEGRATION_SUPABASE_SECRET_KEY ?? "";
const reachable = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: PUBLISHABLE } }).then((r) => r.ok).catch(() => false);
const enabled = reachable && Boolean(PUBLISHABLE && SECRET);

type DB = SupabaseClient;
const today = localDate("UTC");
const tomorrow = addDays(today, 1);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const later = () => new Date(Date.now() + 1500).toISOString();

let user: { id: string; db: DB; conv: string };

function ctx(turn = new Date().toISOString()): ToolContext {
  return { db: user.db as ToolContext["db"], userId: user.id, timezone: "UTC", today, channel: "app", conversationId: user.conv, turnStartedAt: turn };
}
const call = (c: ToolContext, name: string, args: object) => runTool(c, name, JSON.stringify(args));
const row = async (id: string) => (await user.db.from("assistant_actions").select("status, result, error_code").eq("id", id).single()).data!;
const latestRow = async (tool: string) =>
  (await user.db.from("assistant_actions").select("id, status, result, error_code").eq("user_id", user.id).eq("tool", tool).order("created_at", { ascending: false }).limit(1).single()).data!;

/** The conversation as the Assistant page loads it. */
async function reload() {
  const { data: messages } = await user.db.from("conversation_messages").select("id, role, created_at").eq("conversation_id", user.conv).order("created_at");
  const { data: actions } = await user.db.from("assistant_actions").select(STORED_ACTION_COLUMNS).eq("conversation_id", user.conv).order("created_at");
  return attachActions((messages ?? []) as { id: string; role: "user" | "assistant"; created_at: string }[], (actions ?? []) as StoredAction[]);
}
async function say(role: "user" | "assistant", content: string) {
  await wait(20);
  const { error } = await user.db.from("conversation_messages").insert({ user_id: user.id, conversation_id: user.conv, role, content, channel: "app" });
  if (error) throw error;
  await wait(20);
}

describe.skipIf(!enabled)("assistant action results (real Supabase, RLS)", () => {
  beforeAll(async () => {
    const admin = createClient(URL, SECRET, { auth: { persistSession: false } });
    const email = `it-results-${Date.now()}@lifepilot.test`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: "integration-pass-1", email_confirm: true });
    if (error) throw error;
    const db = createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
    await db.auth.signInWithPassword({ email, password: "integration-pass-1" });
    await db.from("profiles").update({ timezone: "UTC", wake_time: "00:00", sleep_time: "23:59", onboarding_completed_at: new Date().toISOString() }).eq("id", data.user.id);
    const { data: conv } = await db.from("conversations").insert({ user_id: data.user.id, channel: "app" }).select("id").single();
    user = { id: data.user.id, db, conv: conv!.id as string };
  });

  it("reschedule_task returns and stores a 'moved' card with where it was before", async () => {
    const { data: t } = await user.db.from("tasks").insert({ user_id: user.id, title: "Workout", task_date: today, scheduled_start: "18:00", duration_minutes: 45 }).select("id").single();
    await say("user", "Move my workout to tomorrow at 5:30");
    const res = await call(ctx(), "reschedule_task", { task_id: t!.id, date: "tomorrow", start_time: "17:30" });
    expect(res.status).toBe("succeeded");
    const expected = {
      v: 1,
      kind: "task",
      action: "moved",
      title: "Workout",
      when: { date: tomorrow, start: "17:30", end: null, allDay: false, lastDate: null },
      durationMinutes: 45,
      previous: { date: today, start: "18:00", end: null, allDay: false, lastDate: null },
    };
    expect(res.card).toEqual(expected);
    const stored = await latestRow("reschedule_task");
    expect(stored).toMatchObject({ status: "succeeded", result: expected });
    await say("assistant", "Done — it's tomorrow at 5:30.");

    // Reload: the same structured result, not a generic status line.
    const map = await reload();
    const actions = [...map.values()].flat();
    expect(actions).toContainEqual(expect.objectContaining({ status: "succeeded", card: expected }));
  });

  it("create_task and complete_task store their results", async () => {
    const created = await call(ctx(), "create_task", { title: "Call Mom", date: "today", start_time: "19:00", duration_minutes: 20, goal_id: null, is_priority: false });
    expect(created.card).toMatchObject({ kind: "task", action: "created", title: "Call Mom", when: { date: today, start: "19:00" }, durationMinutes: 20 });
    const id = created.data!.task_id as string;
    const done = await call(ctx(), "complete_task", { task_id: id });
    expect(done.card).toMatchObject({ kind: "task", action: "completed", title: "Call Mom" });
    expect((await latestRow("complete_task")).result).toMatchObject({ action: "completed" });
    expect(sanitizeCard((await latestRow("create_task")).result)).not.toBeNull();
  });

  it("a failed action stores no result and reloads as a failure", async () => {
    await say("user", "Move the thing");
    const res = await call(ctx(), "reschedule_task", { task_id: "00000000-0000-4000-8000-000000000000", date: "tomorrow", start_time: "keep" });
    expect(res).toMatchObject({ status: "failed", error: "not_found" });
    expect(res.card).toBeUndefined();
    const stored = await latestRow("reschedule_task");
    expect(stored).toMatchObject({ status: "failed", result: null, error_code: "not_found" });
    await say("assistant", "I couldn't find that task.");
    const failed = [...(await reload()).values()].flat().find((a) => a.id === stored.id);
    expect(failed).toEqual({ id: stored.id, status: "failed", label: "I couldn't find that task.", error: "not_found" });
  });

  it("a proposal stores the change awaiting approval; declining keeps it, marked declined", async () => {
    const { data: t } = await user.db.from("tasks").insert({ user_id: user.id, title: "Laundry", task_date: today, scheduled_start: "20:00" }).select("id").single();
    const turn = new Date().toISOString();
    await wait(50);
    const proposal = await call(ctx(turn), "cancel_task", { task_id: t!.id, mode: "skip" });
    expect(proposal).toMatchObject({ status: "needs_confirmation" });
    expect(proposal.card).toMatchObject({ kind: "task", action: "skipped", title: "Laundry", when: { date: today, start: "20:00" } });
    expect(await row(proposal.confirmationId!)).toMatchObject({ status: "pending_confirmation", result: { action: "skipped" } });
    await say("assistant", "Want me to skip laundry tonight?");

    await say("user", "No, cancel that.");
    expect(await call(ctx(later()), "decline_action", { confirmation_id: proposal.confirmationId })).toMatchObject({ status: "succeeded" });
    await say("assistant", "Okay — I won't make that change.");
    expect((await user.db.from("tasks").select("status").eq("id", t!.id).single()).data?.status).toBe("pending");

    const map = await reload();
    const declined = [...map.values()].flat().find((a) => a.id === proposal.confirmationId);
    expect(declined).toMatchObject({ status: "declined", card: { title: "Laundry" } });
    expect(declined?.confirmationId).toBeUndefined();
  });

  it("confirming replaces the proposal with what actually happened", async () => {
    const { data: t } = await user.db.from("tasks").insert({ user_id: user.id, title: "Old errand", task_date: today }).select("id").single();
    const turn = new Date().toISOString();
    await wait(50);
    const proposal = await call(ctx(turn), "cancel_task", { task_id: t!.id, mode: "delete" });
    const confirmed = await call(ctx(later()), "confirm_action", { confirmation_id: proposal.confirmationId });
    expect(confirmed.card).toMatchObject({ kind: "task", action: "deleted", title: "Old errand" });
    expect(await row(proposal.confirmationId!)).toMatchObject({ status: "succeeded", result: { action: "deleted" } });
  });

  it("replan_today proposes a plan card and, once confirmed, an applied plan that Today reads", async () => {
    await user.db.from("tasks").delete().eq("user_id", user.id).eq("task_date", today);
    const { data: t } = await user.db.from("tasks").insert({ user_id: user.id, title: "Deep work", task_date: today, duration_minutes: 60 }).select("id").single();
    const turn = new Date().toISOString();
    await wait(50);
    const proposal = await call(ctx(turn), "replan_today", { available_start: "00:00", available_end: "23:59", note: null });
    expect(proposal.status).toBe("needs_confirmation");
    expect(proposal.card).toMatchObject({ kind: "plan", action: "proposed", date: today });
    const items = (proposal.card as { items: { title: string; start: string | null }[] }).items;
    expect(items.map((i) => i.title)).toContain("Deep work");

    const applied = await call(ctx(later()), "confirm_action", { confirmation_id: proposal.confirmationId });
    expect(applied.status).toBe("succeeded");
    expect(applied.card).toMatchObject({ kind: "plan", action: "applied", date: today, items });
    expect(await row(proposal.confirmationId!)).toMatchObject({ status: "succeeded", result: { action: "applied" } });

    // The same tasks Today loads now carry the planned time.
    const planned = items.find((i) => i.title === "Deep work")!;
    const { data: task } = await user.db.from("tasks").select("scheduled_start, task_date").eq("id", t!.id).single();
    expect(task).toEqual({ task_date: today, scheduled_start: planned.start ? `${planned.start}:00` : null });
  });

  it("an applied plan keeps the times of blocks it creates (Today shows them)", async () => {
    const { data: plan } = await user.db
      .from("daily_plans")
      .insert({
        user_id: user.id,
        plan_date: today,
        status: "draft",
        proposal: { items: [{ task_id: null, title: "Walk", goal_id: null, start_time: "21:00", duration_minutes: 30, is_priority: false, rationale: null }], warnings: [], question: null },
        source: "rules",
      })
      .select("id")
      .single();
    const { data: pending } = await user.db
      .from("assistant_actions")
      .insert({ user_id: user.id, conversation_id: user.conv, tool: "replan_today", arguments: { plan_id: plan!.id }, status: "pending_confirmation", expires_at: new Date(Date.now() + 600_000).toISOString() })
      .select("id")
      .single();
    await wait(50);
    const applied = await call(ctx(later()), "confirm_action", { confirmation_id: pending!.id });
    expect(applied.card).toMatchObject({ kind: "plan", action: "applied", items: [{ title: "Walk", start: "21:00" }] });
    const { data: walk } = await user.db.from("tasks").select("scheduled_start").eq("user_id", user.id).eq("title", "Walk").single();
    expect(walk?.scheduled_start).toBe("21:00:00");
  });
});
