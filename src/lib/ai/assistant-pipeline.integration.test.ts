/**
 * The whole assistant pipeline against a real Supabase stack and the scripted
 * mock Responses API (scripts/mock-openai.mjs): real context, real history,
 * real tools and database, real confirmations — only the model is scripted.
 * Mirrors what /api/chat does for one turn. Run: npm run test:integration.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createMockOpenAI, type MockOpenAI } from "../../../scripts/mock-openai.mjs";
import { appendMessage, buildToolContext, createConversation, prepareReply } from "@/lib/assistant/conversation";
import type { DB } from "@/lib/data/db";
import type { Conversation } from "@/lib/types/domain";
import { addDays, localDate } from "@/lib/time";
import { FAILED_ACTION_NOTE } from "./agent-rules";

const URL = process.env.INTEGRATION_SUPABASE_URL ?? "http://127.0.0.1:54321";
const PUBLISHABLE = process.env.INTEGRATION_SUPABASE_PUBLISHABLE_KEY ?? "";
const SECRET = process.env.INTEGRATION_SUPABASE_SECRET_KEY ?? "";
const reachable = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: PUBLISHABLE } }).then((r) => r.ok).catch(() => false);
const enabled = reachable && Boolean(PUBLISHABLE && SECRET);

// A time zone where it's early afternoon, so the day has a past and a future.
const utcH = new Date().getUTCHours();
let N = 14 - utcH;
if (N > 14) N -= 24;
if (N < -12) N += 24;
const tz = N === 0 ? "UTC" : `Etc/GMT${N > 0 ? "-" : "+"}${Math.abs(N)}`;
const today = localDate(tz);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let mock: MockOpenAI;
let db: SupabaseClient;
let userId = "";
const ids: Record<string, string> = {};

async function newConversation(): Promise<Conversation> {
  return createConversation(db as DB, userId, "app", null);
}

/** One chat turn, exactly as /api/chat runs it. */
async function turn(conv: Conversation, message: string, opts: { focusTaskId?: string } = {}) {
  const { runAssistantTurn } = await import("./agent");
  await wait(30); // a later message than anything before it
  const user = await appendMessage(db as DB, userId, conv.id, "user", message, "app");
  const { messages, context } = await prepareReply(db as DB, userId, conv, "app", { focusTaskId: opts.focusTaskId });
  const events: { type: string; status?: string; card?: unknown }[] = [];
  const out = await runAssistantTurn({
    messages,
    ctx: buildToolContext(db as DB, userId, conv, "app", context, user.created_at),
    meta: { userId, feature: "chat" },
    stream: true,
    maxOutputTokens: 2000,
    onEvent: (e) => events.push(e),
  });
  await appendMessage(db as DB, userId, conv.id, "assistant", out.text, "app");
  const chat = mock.requests.filter((r) => r.kind === "chat");
  return { text: out.text, events, first: chat[chat.length - 1], actions: out.actions };
}
const task = async (id: string) => (await db.from("tasks").select("title, task_date, scheduled_start, status").eq("id", id).single()).data!;

describe.skipIf(!enabled)("assistant pipeline with the mock model (real Supabase)", () => {
  beforeAll(async () => {
    mock = createMockOpenAI();
    const url = await mock.listen(0);
    process.env.OPENAI_API_KEY = "test-key-for-the-local-mock";
    process.env.OPENAI_BASE_URL = url;
    process.env.OPENAI_MODEL = "gpt-5-mini";

    const admin = createClient(URL, SECRET, { auth: { persistSession: false } });
    const email = `it-pipeline-${Date.now()}@lifepilot.test`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: "integration-pass-1", email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    db = createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
    await db.auth.signInWithPassword({ email, password: "integration-pass-1" });
    await db.from("profiles").update({ display_name: "Sam", timezone: tz, wake_time: "07:00", sleep_time: "23:30", onboarding_completed_at: new Date().toISOString() }).eq("id", userId);
    const rows = [
      { title: "Finish the proposal", duration_minutes: 90, is_priority: true },
      { title: "Workout", scheduled_start: "18:00", duration_minutes: 45 },
      { title: "Laundry", duration_minutes: 30 },
    ];
    for (const r of rows) {
      const { data: t } = await db.from("tasks").insert({ user_id: userId, task_date: today, ...r }).select("id").single();
      ids[r.title] = t!.id as string;
    }
  });
  afterAll(async () => {
    await mock?.close();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_MODEL;
  });

  it("A: 'What should I do right now?' is answered from the real day", async () => {
    const conv = await newConversation();
    const r = await turn(conv, "What should I do right now?");
    expect(r.text).toContain("You have three tasks left today");
    expect(r.text).toContain("I'd start with “Finish the proposal” now — it's your priority");
    // The app sent the real, current context — and only the app guidance in the app.
    expect(r.first.appGuidance).toBe(true);
    expect(r.first.context).toContain("[pending] Workout at 6:00 PM (45 min)");
    expect(r.first.context).toContain(today);
    // Bounded: context and input stay small for a normal day.
    expect(r.first.contextChars).toBeLessThan(6000);
    expect(r.first.inputChars).toBeLessThan(20000);
  });

  it("E: 'I'm overwhelmed' looks at what's actually left", async () => {
    const r = await turn(await newConversation(), "I'm overwhelmed");
    expect(r.text).toBe("You have three tasks left today. “Finish the proposal” is the one that matters most — it's your priority. I'd do that and leave “Laundry” for tomorrow. Want me to move it?");
  });

  it("B: 'Move my workout to tomorrow' runs the real tool and reports it", async () => {
    const r = await turn(await newConversation(), "Move my workout to tomorrow.");
    expect(r.first.call).toEqual({ name: "reschedule_task", args: { task_id: ids.Workout, date: "tomorrow", start_time: "keep" } });
    expect(await task(ids.Workout)).toMatchObject({ task_date: addDays(today, 1), scheduled_start: "18:00:00" });
    expect(r.text).toBe("Done — moved “Workout” to tomorrow at 6:00 PM.");
    expect(r.events).toContainEqual(expect.objectContaining({ status: "succeeded", card: expect.objectContaining({ kind: "task", action: "moved" }) }));
  });

  it("continuity: a new conversation knows what changed earlier today (app only)", async () => {
    await turn(await newConversation(), "What should I do right now?");
    const ctx = mock.requests.filter((q) => q.kind === "chat").pop()!.context;
    expect(ctx).toContain("## Changes made today");
    expect(ctx).toContain("Moved “Workout” to tomorrow at 6:00 PM.");
    // SMS context is unchanged by this.
    const sms = await createConversation(db as DB, userId, "sms", "Text messages");
    const { messages } = await prepareReply(db as DB, userId, sms, "sms");
    expect(messages.map((m) => m.content).join("\n")).not.toContain("Changes made today");
    expect(messages[0].content).not.toContain("In the app — how to be useful right now");
  });

  it("C: 'I didn't finish my proposal.' carries into the next message", async () => {
    const conv = await newConversation();
    const r1 = await turn(conv, "I didn't finish my proposal.");
    expect(r1.text).toMatch(/^“Finish the proposal” is still open\./);
    const r2 = await turn(conv, "Tomorrow at 9");
    expect(r2.first.dialogue).toBeGreaterThanOrEqual(3); // it saw the earlier turn
    expect(r2.first.call).toEqual({ name: "reschedule_task", args: { task_id: ids["Finish the proposal"], date: "tomorrow", start_time: "09:00" } });
    expect(await task(ids["Finish the proposal"])).toMatchObject({ task_date: addDays(today, 1), scheduled_start: "09:00:00" });
  });

  it("G: a change made on Today is what the assistant sees next", async () => {
    await db.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", ids.Laundry);
    const r = await turn(await newConversation(), "Did I finish the laundry?");
    expect(r.text).toBe("Yes — “Laundry” is marked done.");
  });

  it("D: 'Help me plan the rest of my day' → real planner → proposal → confirmed → tasks scheduled", async () => {
    const { data: t } = await db.from("tasks").insert({ user_id: userId, task_date: today, title: "Deep work", duration_minutes: 60 }).select("id").single();
    const conv = await newConversation();
    const r1 = await turn(conv, "Help me plan the rest of my day");
    expect(r1.first.call?.name).toBe("replan_today");
    expect(mock.requests.some((q) => q.kind === "plan")).toBe(true); // the real planner asked the model
    expect(r1.events).toContainEqual(expect.objectContaining({ status: "needs_confirmation", card: expect.objectContaining({ kind: "plan", action: "proposed" }) }));
    expect(r1.text).toBe("Here's a plan for the rest of today. Nothing moves until you say so.");
    expect((await task(t!.id)).scheduled_start).toBeNull(); // nothing applied yet

    const r2 = await turn(conv, "Yes");
    expect(r2.first.call?.name).toBe("confirm_action");
    expect(r2.text).toMatch(/^Done — updated today's plan/);
    expect((await task(t!.id)).scheduled_start).not.toBeNull();
  });

  it("memory: saved preferences are used later and 'forget that' still needs an OK", async () => {
    const r1 = await turn(await newConversation(), "I always prefer workouts in the evening.");
    expect(r1.first.call).toEqual({ name: "save_memory", args: { content: "I always prefer workouts in the evening." } });
    const conv = await newConversation();
    const r2 = await turn(conv, "When should I work out today?");
    expect(r2.text).toMatch(/^You told me you prefer working out in the evening/);
    const r3 = await turn(conv, "Forget that");
    expect(r3.first.call?.name).toBe("delete_memory");
    expect(r3.text).toMatch(/^That needs your OK first: Forget “I always prefer workouts in the evening\.”/);
    expect((await db.from("user_memories").select("id").eq("user_id", userId)).data).toHaveLength(1); // not yet
    await turn(conv, "Yes");
    expect((await db.from("user_memories").select("id").eq("user_id", userId)).data).toHaveLength(0);
  });

  it("honesty: a model that claims success after a failed change is corrected", async () => {
    mock.script({ lie: true });
    const r = await turn(await newConversation(), "Move the dentist to tomorrow");
    expect(r.actions).toEqual([expect.objectContaining({ status: "failed", error: "not_found" })]);
    expect(r.text).toBe(`Done! I've taken care of that.${FAILED_ACTION_NOTE}`);
  });

  it("partial plan: says what didn't make it, and the rest is applied", async () => {
    const { data: ok } = await db.from("tasks").insert({ user_id: userId, task_date: today, title: "Call Mom", duration_minutes: 20 }).select("id").single();
    const { data: plan } = await db
      .from("daily_plans")
      .insert({
        user_id: userId,
        plan_date: today,
        status: "draft",
        source: "rules",
        proposal: {
          items: [
            { task_id: ok!.id, title: "Call Mom", goal_id: null, start_time: "20:00", duration_minutes: 20, is_priority: false, rationale: null },
            { task_id: null, title: "x".repeat(250), goal_id: null, start_time: "21:00", duration_minutes: 30, is_priority: false, rationale: null },
            { task_id: null, title: "y".repeat(250), goal_id: null, start_time: "22:00", duration_minutes: 30, is_priority: false, rationale: null },
          ],
          warnings: [],
          question: null,
        },
      })
      .select("id")
      .single();
    const conv = await newConversation();
    await db.from("assistant_actions").insert({ user_id: userId, conversation_id: conv.id, tool: "replan_today", arguments: { plan_id: plan!.id }, status: "pending_confirmation", summary: "New plan for today", expires_at: new Date(Date.now() + 600_000).toISOString() });
    const r = await turn(conv, "Yes, use it");
    expect(r.actions).toEqual([expect.objectContaining({ status: "failed", error: "partial_failure" })]);
    expect(r.text).toMatch(/^Some of the plan was applied, but two items couldn't be scheduled: /);
    expect((await task(ok!.id)).scheduled_start).toBe("20:00:00");
  });

  it("H: a new conversation starts with no earlier messages", async () => {
    const r = await turn(await newConversation(), "What did I just ask you?");
    expect(r.first.userMessages).toBe(1);
    expect(r.text).toBe("This is a new conversation — you haven't asked me anything else here yet.");
  });

  it("Move it from Today: the assistant knows which task, and only the user's own", async () => {
    const { data: t } = await db.from("tasks").insert({ user_id: userId, task_date: today, title: "Stretch", duration_minutes: 15 }).select("id").single();
    const r = await turn(await newConversation(), 'Move "Stretch" to later today', { focusTaskId: t!.id });
    expect(r.first.focus).toBe(t!.id);
    expect(r.first.call).toMatchObject({ name: "reschedule_task", args: { task_id: t!.id, date: "today" } });
    // Another user's task id is never described.
    const r2 = await turn(await newConversation(), "Hi", { focusTaskId: "00000000-0000-4000-8000-000000000000" });
    expect(r2.first.focus).toBeNull();
  });
});
