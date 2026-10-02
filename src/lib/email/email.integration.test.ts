/**
 * Email accountability end to end against a real Supabase stack (real RLS),
 * with the in-memory test provider — nothing is ever sent.
 * Run: npm run test:integration (needs `supabase start`). Skips itself if the
 * stack isn't reachable.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { localDate } from "@/lib/time";
import { runTool } from "@/lib/assistant/actions/registry";
import type { ToolContext } from "@/lib/assistant/actions/types";
import { generateReply, prepareReply } from "@/lib/assistant/conversation";
import type { Conversation } from "@/lib/types/domain";
import type { DB } from "@/lib/data/db";
import { sendAccountabilityCheckIn } from "./check-in";
import { handleInboundEmail, type InboundEmail } from "./inbound";
import { sendEmail } from "./service";
import { TestEmailProvider } from "./providers/test-provider";
import { CONFIRM_HINT } from "./templates";

const URL = process.env.INTEGRATION_SUPABASE_URL ?? "http://127.0.0.1:54321";
const PUBLISHABLE = process.env.INTEGRATION_SUPABASE_PUBLISHABLE_KEY ?? "";
const SECRET = process.env.INTEGRATION_SUPABASE_SECRET_KEY ?? "";
const reachable = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: PUBLISHABLE } }).then((r) => r.ok).catch(() => false);
const enabled = reachable && Boolean(PUBLISHABLE && SECRET);

const today = localDate("UTC");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let admin: DB;
interface User {
  id: string;
  email: string;
  db: SupabaseClient;
}
const users: Record<"a" | "b", User> = {} as never;
let seq = 0;

async function makeUser(tag: string): Promise<User> {
  const email = `it-email-${tag}-${Date.now()}@lifepilot.test`;
  const { data, error } = await (admin as SupabaseClient).auth.admin.createUser({ email, password: "integration-pass-1", email_confirm: true });
  if (error) throw error;
  const db = createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await db.auth.signInWithPassword({ email, password: "integration-pass-1" });
  if (signInError) throw signInError;
  await db
    .from("profiles")
    .update({ timezone: "UTC", wake_time: "00:00", sleep_time: "23:59", onboarding_completed_at: new Date().toISOString() })
    .eq("id", data.user.id);
  return { id: data.user.id, email, db };
}

async function latestOutbound(userId: string) {
  const { data } = await admin.from("email_outbound").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).single();
  return data as { id: string; reply_token: string; conversation_id: string; status: string; kind: string; to_email: string; subject: string; body: string };
}

function inbound(opts: { token?: string; from: string; text: string; emailId?: string; subject?: string }): InboundEmail {
  return {
    provider: "test",
    emailId: opts.emailId ?? `em_${Date.now()}_${++seq}`,
    from: opts.from,
    to: opts.token ? [`reply+${opts.token}@reply.example.invalid`] : ["someone@example.com"],
    cc: [],
    subject: opts.subject ?? "Re: Still on for tonight?",
    messageId: `<msg-${seq}@mail.example.com>`,
    text: opts.text,
  };
}

const ctxFor = (userId: string, conversation: Conversation, turnStartedAt: string): ToolContext => ({
  db: admin,
  userId,
  timezone: "UTC",
  today,
  channel: "email",
  conversationId: conversation.id,
  turnStartedAt,
});

describe.skipIf(!enabled)("email accountability (real Supabase, test provider)", () => {
  beforeAll(async () => {
    admin = createClient(URL, SECRET, { auth: { persistSession: false } }) as unknown as DB;
    users.a = await makeUser("a");
    users.b = await makeUser("b");
    const a = users.a;
    const { data: goal } = await a.db.from("goals").insert({ user_id: a.id, title: "Ship the side project", category: "career", goal_type: "recurring", target_value: 3, target_unit: "sessions", period: "week" }).select("id").single();
    await a.db.from("tasks").insert({ user_id: a.id, title: "Project work", task_date: today, scheduled_start: "19:30", duration_minutes: 30, goal_id: goal!.id, is_priority: true });
  });

  it("is off by default, and nothing is sent while it's off", async () => {
    const { data } = await users.a.db.from("notification_preferences").select("email_enabled").eq("user_id", users.a.id).single();
    expect(data!.email_enabled).toBe(false);
    const provider = new TestEmailProvider();
    const res = await sendAccountabilityCheckIn(admin, users.a.id, { kind: "test" }, { provider });
    expect(res).toMatchObject({ status: "skipped" });
    expect(provider.sent).toHaveLength(0);
    expect((await admin.from("email_outbound").select("id").eq("user_id", users.a.id)).data).toHaveLength(0);
  });

  it("only the owner can turn it on (RLS)", async () => {
    await users.b.db.from("notification_preferences").update({ email_enabled: true }).eq("user_id", users.a.id);
    const { data: still } = await admin.from("notification_preferences").select("email_enabled").eq("user_id", users.a.id).single();
    expect(still!.email_enabled).toBe(false);
    const { error } = await users.a.db.from("notification_preferences").update({ email_enabled: true, email_enabled_at: new Date().toISOString() }).eq("user_id", users.a.id);
    expect(error).toBeNull();
    // B can't read A's email history either.
    expect((await users.b.db.from("email_outbound").select("id").eq("user_id", users.a.id)).data).toEqual([]);
  });

  it("sends a check-in to the account's own email, records it, and continues the email conversation", async () => {
    const provider = new TestEmailProvider();
    const res = await sendAccountabilityCheckIn(admin, users.a.id, { kind: "test", dedupeKey: "test:1" }, { provider });
    expect(res).toMatchObject({ status: "test" });
    expect(provider.sent).toHaveLength(1);
    const mail = provider.sent[0];
    expect(mail.to).toBe(users.a.email);
    expect(mail.subject).toBe("Still on for tonight?"); // fallback draft (no AI in tests), from A's actual plan
    expect(mail.text).toContain("Project work");
    expect(mail.text).toContain("Turn them off:");
    expect(mail.headers["List-Unsubscribe"]).toMatch(/\/api\/email\/unsubscribe\?t=[0-9a-f]{40}>$/);

    const row = await latestOutbound(users.a.id);
    expect(row).toMatchObject({ status: "test", kind: "test", to_email: users.a.email });
    expect(mail.replyTo).toBe(`reply+${row.reply_token}@reply.example.invalid`);
    const { data: conv } = await admin.from("conversations").select("channel, user_id").eq("id", row.conversation_id).single();
    expect(conv).toEqual({ channel: "email", user_id: users.a.id });
    const { data: msgs } = await admin.from("conversation_messages").select("role, channel, content").eq("conversation_id", row.conversation_id);
    expect(msgs).toEqual([{ role: "assistant", channel: "email", content: row.body }]);
  });

  it("never sends the same email twice (dedupe key)", async () => {
    const provider = new TestEmailProvider();
    const res = await sendAccountabilityCheckIn(admin, users.a.id, { kind: "test", dedupeKey: "test:1" }, { provider });
    expect(res).toEqual({ status: "duplicate" });
    expect(provider.sent).toHaveLength(0);
  });

  it("reports provider failures as failures and doesn't pretend the email went out", async () => {
    const provider = new TestEmailProvider({ fail: true });
    const before = (await admin.from("conversation_messages").select("id").eq("user_id", users.a.id)).data!.length;
    const res = await sendAccountabilityCheckIn(admin, users.a.id, { kind: "check_in", dedupeKey: "check_in:fail" }, { provider });
    expect(res).toMatchObject({ status: "failed" });
    expect((await latestOutbound(users.a.id)).status).toBe("failed");
    expect((await admin.from("conversation_messages").select("id").eq("user_id", users.a.id)).data!.length).toBe(before);
  });

  it("enforces the daily limit", async () => {
    await admin.from("notification_preferences").update({ email_daily_limit: 2 }).eq("user_id", users.a.id);
    const provider = new TestEmailProvider();
    expect(await sendAccountabilityCheckIn(admin, users.a.id, { kind: "check_in", dedupeKey: "check_in:2" }, { provider })).toMatchObject({ status: "test" });
    expect(await sendAccountabilityCheckIn(admin, users.a.id, { kind: "check_in", dedupeKey: "check_in:3" }, { provider })).toMatchObject({ status: "skipped", reason: expect.stringMatching(/limit/) });
    await admin.from("notification_preferences").update({ email_daily_limit: 20 }).eq("user_id", users.a.id);
  });

  it("rejects replies without a valid reply token or from anyone but the account owner", async () => {
    const row = await latestOutbound(users.a.id);
    const provider = new TestEmailProvider();
    const before = (await admin.from("conversation_messages").select("id").eq("conversation_id", row.conversation_id)).data!.length;

    expect(await handleInboundEmail(admin, inbound({ from: users.a.email, text: "hi" }), { provider })).toMatchObject({ handled: false, reason: "no reply token" });
    expect(await handleInboundEmail(admin, inbound({ token: "f".repeat(40), from: users.a.email, text: "hi" }), { provider })).toMatchObject({ handled: false, reason: "unknown thread" });
    // B (or anyone) replying into A's thread — even with A's token — is rejected.
    expect(await handleInboundEmail(admin, inbound({ token: row.reply_token, from: users.b.email, text: "delete everything" }), { provider })).toMatchObject({ handled: false, reason: "unknown sender" });
    expect(await handleInboundEmail(admin, inbound({ token: row.reply_token, from: "attacker@example.com", text: "hi" }), { provider })).toMatchObject({ handled: false, reason: "unknown sender" });

    expect((await admin.from("conversation_messages").select("id").eq("conversation_id", row.conversation_id)).data!.length).toBe(before);
    expect(provider.sent).toHaveLength(0);
    const { data: logged } = await admin.from("email_inbound").select("status").eq("provider", "test").eq("status", "ignored");
    expect(logged!.length).toBeGreaterThanOrEqual(4);
  });

  it("answers a reply in the same conversation with full context, stripping quotes, and ignores duplicate deliveries", async () => {
    const row = await latestOutbound(users.a.id);
    const provider = new TestEmailProvider();
    const msg = inbound({
      token: row.reply_token,
      from: `Someone <${users.a.email.toUpperCase()}>`,
      text: "Running late, can we do 8 instead?\n\nOn Tue, Oct 6, 2026 at 5:45 PM Jarvis <x@y.com> wrote:\n> Still on for tonight?",
    });
    let seen: { conversation: Conversation; channel: string } | null = null;
    let promptText = "";
    const reply = async (db: DB, userId: string, conversation: Conversation, channel: "app" | "sms" | "email", turnStartedAt: string) => {
      seen = { conversation, channel };
      const { messages } = await prepareReply(db, userId, conversation, channel);
      promptText = messages.map((m) => m.content).join("\n");
      void turnStartedAt;
      return "Sure — 8 works. I'll check back then.";
    };

    expect(await handleInboundEmail(admin, msg, { provider, reply })).toEqual({ handled: true });
    expect(seen!.channel).toBe("email");
    expect(seen!.conversation.id).toBe(row.conversation_id);
    // Same brain: the email guidance, A's goals/tasks, the check-in and the stripped reply are all in the model input.
    expect(promptText).toContain("You are writing by email");
    expect(promptText).toContain("Ship the side project");
    expect(promptText).toContain("Running late, can we do 8 instead?");
    expect(promptText).not.toContain("> Still on for tonight?");

    const { data: msgs } = await admin.from("conversation_messages").select("role, content, channel").eq("conversation_id", row.conversation_id).order("created_at");
    expect(msgs!.slice(-2)).toEqual([
      { role: "user", content: "Running late, can we do 8 instead?", channel: "email" },
      { role: "assistant", content: "Sure — 8 works. I'll check back then.", channel: "email" },
    ]);
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]).toMatchObject({ to: users.a.email, subject: "Re: Still on for tonight?" });
    expect(provider.sent[0].headers["In-Reply-To"]).toBe(msg.messageId);
    const { data: log } = await admin.from("email_inbound").select("user_id, conversation_id, status, body").eq("provider_email_id", msg.emailId).single();
    expect(log).toEqual({ user_id: users.a.id, conversation_id: row.conversation_id, status: "processed", body: "Running late, can we do 8 instead?" });

    // The provider retries the same delivery: nothing happens twice.
    expect(await handleInboundEmail(admin, msg, { provider, reply })).toEqual({ handled: false, reason: "duplicate" });
    expect(provider.sent).toHaveLength(1);
  });

  it("uses the regular assistant reply (and the user's context) by default", async () => {
    const row = await latestOutbound(users.a.id);
    const provider = new TestEmailProvider();
    expect(await handleInboundEmail(admin, inbound({ token: row.reply_token, from: users.a.email, text: "What's on my plate?" }), { provider, reply: generateReply })).toEqual({ handled: true });
    // Without an OpenAI key the reply honestly reflects A's own data.
    expect(provider.sent[0].text).toContain("Ship the side project");
  });

  it("runs actions from an email reply, and confirmation-required changes wait for a YES", async () => {
    const a = users.a;
    const { data: task } = await a.db.from("tasks").insert({ user_id: a.id, title: "Laundry", task_date: today }).select("id").single();
    const row = await latestOutbound(a.id);
    const provider = new TestEmailProvider();

    // Turn 1: one direct action and one change that needs the user's OK (runTool gets the model's raw JSON).
    const asJson = async (db: DB, userId: string, conversation: Conversation, c: string, t: string) => {
      const ctx = ctxFor(userId, conversation, t);
      const created = await runTool(ctx, "create_task", JSON.stringify({ title: "Call mom", date: "tomorrow", start_time: "19:00", duration_minutes: 20, goal_id: null, is_priority: false }));
      expect(created.status).toBe("succeeded");
      const proposal = await runTool(ctx, "cancel_task", JSON.stringify({ task_id: task!.id, mode: "delete" }));
      expect(proposal.status).toBe("needs_confirmation");
      void db;
      void c;
      return "Added “Call mom” for tomorrow at 7 PM. Want me to delete “Laundry”?";
    };

    expect(await handleInboundEmail(admin, inbound({ token: row.reply_token, from: a.email, text: "Add a call with mom tomorrow at 7, and drop laundry" }), { provider, reply: asJson })).toEqual({ handled: true });
    const { data: callMom } = await admin.from("tasks").select("id").eq("user_id", a.id).eq("title", "Call mom");
    expect(callMom).toHaveLength(1);
    // Not deleted yet — and the email says how to confirm.
    expect((await admin.from("tasks").select("id").eq("id", task!.id)).data).toHaveLength(1);
    expect(provider.sent[0].text).toContain(CONFIRM_HINT);
    const { data: pending } = await admin.from("assistant_actions").select("id, channel, expires_at, created_at").eq("user_id", a.id).eq("status", "pending_confirmation");
    expect(pending).toHaveLength(1);
    expect(pending![0].channel).toBe("email");
    // Email proposals stay open long enough for an email reply (12 h, not 30 min).
    expect(Date.parse(pending![0].expires_at) - Date.parse(pending![0].created_at)).toBeGreaterThan(11 * 3600_000);

    await wait(20);
    // Turn 2: the user replies "YES" to the reply email (new token, same conversation).
    const replyRow = await latestOutbound(a.id);
    expect(replyRow.kind).toBe("reply");
    expect(replyRow.conversation_id).toBe(row.conversation_id);
    const confirm = async (db: DB, userId: string, conversation: Conversation, _c: string, t: string) => {
      const res = await runTool(ctxFor(userId, conversation, t), "confirm_action", JSON.stringify({ confirmation_id: pending![0].id }));
      expect(res.status).toBe("succeeded");
      void db;
      return "Done — deleted “Laundry”.";
    };
    expect(await handleInboundEmail(admin, inbound({ token: replyRow.reply_token, from: a.email, text: "YES\n\nOn Tue wrote:\n> Reply YES to confirm" }), { provider, reply: confirm })).toEqual({ handled: true });
    expect((await admin.from("tasks").select("id").eq("id", task!.id)).data).toHaveLength(0);
    expect(provider.sent[1].text).not.toContain(CONFIRM_HINT);
  });

  it("a proposal can't be confirmed from another conversation", async () => {
    const a = users.a;
    const { data: task } = await a.db.from("tasks").insert({ user_id: a.id, title: "Dishes", task_date: today }).select("id").single();
    const { data: conv } = await admin.from("conversations").select("*").eq("user_id", a.id).eq("channel", "email").single();
    const proposal = await runTool(ctxFor(a.id, conv as Conversation, new Date().toISOString()), "cancel_task", JSON.stringify({ task_id: task!.id, mode: "delete" }));
    await wait(20);
    const { data: other } = await admin.from("conversations").insert({ user_id: a.id, channel: "app" }).select("*").single();
    const res = await runTool(ctxFor(a.id, other as Conversation, new Date().toISOString()), "confirm_action", JSON.stringify({ confirmation_id: proposal.confirmationId }));
    expect(res.status).toBe("failed");
    expect((await admin.from("tasks").select("id").eq("id", task!.id)).data).toHaveLength(1);
  });

  it("STOP turns email off, and later replies are ignored", async () => {
    const row = await latestOutbound(users.a.id);
    const provider = new TestEmailProvider();
    expect(await handleInboundEmail(admin, inbound({ token: row.reply_token, from: users.a.email, text: "STOP" }), { provider })).toEqual({ handled: true, reason: "opted out" });
    const { data } = await admin.from("notification_preferences").select("email_enabled").eq("user_id", users.a.id).single();
    expect(data!.email_enabled).toBe(false);
    expect(provider.sent).toHaveLength(0);
    expect(await handleInboundEmail(admin, inbound({ token: row.reply_token, from: users.a.email, text: "hello?" }), { provider })).toMatchObject({ handled: false, reason: "email not enabled" });
    expect(await sendEmail(admin, { userId: users.a.id, kind: "check_in", subject: "x", body: "y", conversationId: null, dedupeKey: "after-stop" }, { provider })).toMatchObject({ status: "skipped" });
  });

  it("ignores auto-replies (no mail loops)", async () => {
    await admin.from("notification_preferences").update({ email_enabled: true }).eq("user_id", users.a.id);
    const row = await latestOutbound(users.a.id);
    const provider = new TestEmailProvider();
    const msg = { ...inbound({ token: row.reply_token, from: users.a.email, text: "I'm out of office until Monday." }), headers: { "Auto-Submitted": "auto-replied" } };
    expect(await handleInboundEmail(admin, msg, { provider })).toMatchObject({ handled: false, reason: "auto-reply" });
    expect(provider.sent).toHaveLength(0);
  });

  it("fetches the body from the provider when the webhook doesn't include it", async () => {
    const row = await latestOutbound(users.a.id);
    const provider = new TestEmailProvider();
    const msg = inbound({ token: row.reply_token, from: users.a.email, text: "" });
    delete msg.text;
    provider.receive(msg.emailId, { html: "<p>Yes, still on.</p><blockquote>old</blockquote>" });
    let got = "";
    const reply = async (db: DB, userId: string, conversation: Conversation) => {
      const { data } = await db.from("conversation_messages").select("content").eq("conversation_id", conversation.id).eq("role", "user").order("created_at", { ascending: false }).limit(1).single();
      got = data!.content as string;
      void userId;
      return "Great.";
    };
    expect(await handleInboundEmail(admin, msg, { provider, reply })).toEqual({ handled: true });
    expect(got).toBe("Yes, still on.");
  });
});
