/**
 * Scheduled email check-ins end to end against a real Supabase stack, with
 * the in-memory test provider and a stubbed draft: nothing is ever sent and
 * no model is called. Run: npm run test:integration (needs `supabase start`
 * with the 20261021000000_email_schedule migration). Skips itself if the
 * stack isn't reachable.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DB } from "@/lib/data/db";
import { runEmailDispatch } from "./dispatch";
import { sendEmail } from "./service";
import { TestEmailProvider } from "./providers/test-provider";
import { sendAccountabilityCheckIn, type CheckInDeps } from "./check-in";

const URL = process.env.INTEGRATION_SUPABASE_URL ?? "http://127.0.0.1:54321";
const PUBLISHABLE = process.env.INTEGRATION_SUPABASE_PUBLISHABLE_KEY ?? "";
const SECRET = process.env.INTEGRATION_SUPABASE_SECRET_KEY ?? "";
const reachable = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: PUBLISHABLE } }).then((r) => r.ok).catch(() => false);
const enabled = reachable && Boolean(PUBLISHABLE && SECRET);

let admin: DB;
const sb = () => admin as unknown as SupabaseClient;

interface Prefs {
  email_enabled?: boolean;
  email_daily_limit?: number;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  email_morning_enabled?: boolean;
  email_morning_time?: string;
  email_afternoon_enabled?: boolean;
  email_afternoon_time?: string;
  email_evening_enabled?: boolean;
  email_evening_time?: string;
}

/**
 * A confirmed user with email check-ins on who chose morning and evening
 * (every slot defaults to off in the database; `defaults: true` keeps them).
 */
async function makeUser(tag: string, opts: { timezone?: string; prefs?: Prefs; confirmed?: boolean; defaults?: boolean } = {}) {
  const email = `it-sched-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@lifepilot.test`;
  const { data, error } = await sb().auth.admin.createUser({ email, password: "integration-pass-1", email_confirm: opts.confirmed ?? true });
  if (error) throw error;
  const id = data.user.id;
  await sb().from("profiles").update({ timezone: opts.timezone ?? "UTC", wake_time: "00:00", sleep_time: "23:59", onboarding_completed_at: new Date().toISOString() }).eq("id", id);
  await sb()
    .from("notification_preferences")
    .update({
      email_enabled: true,
      email_enabled_at: new Date().toISOString(),
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
      ...(opts.defaults ? {} : { email_morning_enabled: true, email_evening_enabled: true }),
      ...opts.prefs,
    })
    .eq("user_id", id);
  return { id, email };
}

async function rows(userId: string) {
  const { data } = await sb().from("email_outbound").select("kind, status, dedupe_key, to_email, provider").eq("user_id", userId).order("created_at");
  return (data ?? []) as { kind: string; status: string; dedupe_key: string; to_email: string; provider: string }[];
}

/** Stubbed draft (no model) + in-memory provider (no email leaves the process). */
function testDeps(provider = new TestEmailProvider()): CheckInDeps & { provider: TestEmailProvider } {
  return { provider, mode: "live", draft: async () => ({ subject: "Checking in", body: "How is the plan going? Just reply." }) };
}

// A fixed morning: 08:05 UTC on 2026-10-21.
const MORNING_UTC = new Date("2026-10-21T08:05:00Z");

describe.skipIf(!enabled)("scheduled email check-ins (real Supabase, test provider)", () => {
  beforeAll(async () => {
    admin = createClient(URL, SECRET, { auth: { persistSession: false } }) as unknown as DB;
  });

  it("sends the due slot once, to the account's own email, with the per-day dedupe key", async () => {
    const u = await makeUser("basic");
    const deps = testDeps();
    const summary = await runEmailDispatch(admin, MORNING_UTC, { userIds: [u.id] }, deps);
    // The test provider never delivers, so the outcome is "test" (a real Resend send would be "sent").
    expect(summary).toMatchObject({ usersChecked: 1, due: 1, test: 1, sent: 0, failed: 0 });
    expect(deps.provider.sent).toHaveLength(1);
    expect(deps.provider.sent[0].to).toBe(u.email.toLowerCase());
    expect(await rows(u.id)).toEqual([
      { kind: "check_in", status: "test", dedupe_key: "check_in:2026-10-21:morning", to_email: u.email.toLowerCase(), provider: "test" },
    ]);
  });

  it("does not resend on retries or later runs inside the catch-up window", async () => {
    const u = await makeUser("retry");
    const deps = testDeps();
    await runEmailDispatch(admin, MORNING_UTC, { userIds: [u.id] }, deps);
    const again = await runEmailDispatch(admin, MORNING_UTC, { userIds: [u.id] }, deps);
    const later = await runEmailDispatch(admin, new Date("2026-10-21T08:50:00Z"), { userIds: [u.id] }, deps);
    expect(again).toMatchObject({ due: 1, duplicate: 1, test: 0 });
    expect(later).toMatchObject({ due: 1, duplicate: 1, test: 0 });
    expect(deps.provider.sent).toHaveLength(1);
    expect(await rows(u.id)).toHaveLength(1);
  });

  it("sends at most once when dispatches overlap", async () => {
    const u = await makeUser("race");
    const deps = testDeps();
    const runs = await Promise.all(Array.from({ length: 4 }, () => runEmailDispatch(admin, MORNING_UTC, { userIds: [u.id] }, deps)));
    expect(runs.reduce((n, s) => n + s.test, 0)).toBe(1);
    expect(deps.provider.sent).toHaveLength(1);
    expect(await rows(u.id)).toHaveLength(1);
  });

  it("does not send to users who turned email check-ins off, or slots they disabled", async () => {
    const off = await makeUser("off", { prefs: { email_enabled: false } });
    const slotOff = await makeUser("slot-off", { prefs: { email_morning_enabled: false } });
    const deps = testDeps();
    const summary = await runEmailDispatch(admin, MORNING_UTC, { userIds: [off.id, slotOff.id] }, deps);
    expect(summary).toMatchObject({ usersChecked: 1, due: 0, test: 0 });
    expect(deps.provider.sent).toHaveLength(0);
    expect(await rows(off.id)).toEqual([]);
    expect(await rows(slotOff.id)).toEqual([]);
  });

  it("respects quiet hours", async () => {
    const u = await makeUser("quiet", { prefs: { email_evening_time: "22:30", quiet_hours_start: "22:00", quiet_hours_end: "07:00" } });
    const deps = testDeps();
    expect(await runEmailDispatch(admin, new Date("2026-10-21T22:35:00Z"), { userIds: [u.id] }, deps)).toMatchObject({ due: 0, sent: 0 });
    expect(await rows(u.id)).toEqual([]);
  });

  it("uses each user's time zone", async () => {
    // 2026-10-20T23:05Z is 08:05 on 2026-10-21 in Tokyo and 16:05 on 2026-10-20 in Los Angeles.
    const tokyo = await makeUser("tokyo", { timezone: "Asia/Tokyo" });
    const la = await makeUser("la", { timezone: "America/Los_Angeles" });
    const deps = testDeps();
    await runEmailDispatch(admin, new Date("2026-10-20T23:05:00Z"), { userIds: [tokyo.id, la.id] }, deps);
    expect((await rows(tokyo.id)).map((r) => r.dedupe_key)).toEqual(["check_in:2026-10-21:morning"]);
    expect(await rows(la.id)).toEqual([]);
  });

  it("sends morning, afternoon and evening as separate check-ins on the same day", async () => {
    const u = await makeUser("three", { prefs: { email_afternoon_enabled: true, email_daily_limit: 6 } });
    const deps = testDeps();
    for (const t of ["2026-10-21T08:05:00Z", "2026-10-21T13:05:00Z", "2026-10-21T20:35:00Z"]) await runEmailDispatch(admin, new Date(t), { userIds: [u.id] }, deps);
    expect((await rows(u.id)).map((r) => r.dedupe_key)).toEqual(["check_in:2026-10-21:morning", "check_in:2026-10-21:afternoon", "check_in:2026-10-21:evening"]);
    expect(deps.provider.sent).toHaveLength(3);
  });

  it("stops at the user's daily email limit without drafting (no model call), on every run in the window", async () => {
    const u = await makeUser("cap", { prefs: { email_daily_limit: 1 } });
    const deps = testDeps();
    // One check-in already went out in the last 24 hours (e.g. a test check-in).
    await sendEmail(admin, { userId: u.id, kind: "test", subject: "Test", body: "Hi", conversationId: null, dedupeKey: "test:earlier" }, deps);
    const draft = vi.fn(async () => ({ subject: "Should not be drafted", body: "x" }));
    for (const t of ["2026-10-21T08:05:00Z", "2026-10-21T08:20:00Z", "2026-10-21T08:35:00Z", "2026-10-21T08:50:00Z"]) {
      expect(await runEmailDispatch(admin, new Date(t), { userIds: [u.id] }, { ...deps, draft })).toMatchObject({ due: 1, skipped: 1, test: 0 });
    }
    expect(draft).not.toHaveBeenCalled();
    expect((await rows(u.id)).map((r) => r.kind)).toEqual(["test"]);
  });

  it("a manual test check-in at the cap is also refused before drafting", async () => {
    const u = await makeUser("cap-manual", { prefs: { email_daily_limit: 1 } });
    const deps = testDeps();
    await sendEmail(admin, { userId: u.id, kind: "check_in", subject: "Earlier", body: "Hi", conversationId: null, dedupeKey: "check_in:earlier" }, deps);
    const draft = vi.fn(async () => ({ subject: "x", body: "x" }));
    expect(await sendAccountabilityCheckIn(admin, u.id, { kind: "test" }, { ...deps, draft })).toEqual({ status: "skipped", reason: "Daily email limit reached — try again tomorrow." });
    expect(draft).not.toHaveBeenCalled();
  });

  it("still drafts and sends while under the cap", async () => {
    const u = await makeUser("under-cap", { prefs: { email_daily_limit: 2 } });
    const deps = testDeps();
    await sendEmail(admin, { userId: u.id, kind: "test", subject: "Test", body: "Hi", conversationId: null, dedupeKey: "test:earlier" }, deps);
    const draft = vi.fn(async () => ({ subject: "Morning", body: "Hi" }));
    expect(await runEmailDispatch(admin, MORNING_UTC, { userIds: [u.id] }, { ...deps, draft })).toMatchObject({ test: 1 });
    expect(draft).toHaveBeenCalledTimes(1);
  });

  it("schedules nothing for a user who turned email on but never chose check-ins (all slots default to off)", async () => {
    const u = await makeUser("defaults", { defaults: true });
    const { data } = await sb().from("notification_preferences").select("email_morning_enabled, email_afternoon_enabled, email_evening_enabled").eq("user_id", u.id).single();
    expect(data).toEqual({ email_morning_enabled: false, email_afternoon_enabled: false, email_evening_enabled: false });
    const deps = testDeps();
    for (const t of ["2026-10-21T08:05:00Z", "2026-10-21T13:05:00Z", "2026-10-21T20:35:00Z"]) {
      expect(await runEmailDispatch(admin, new Date(t), { userIds: [u.id] }, deps)).toMatchObject({ usersChecked: 1, due: 0 });
    }
    expect(deps.provider.sent).toHaveLength(0);
    expect(await rows(u.id)).toEqual([]);
  });

  it("skips accounts whose email isn't confirmed", async () => {
    const u = await makeUser("unconfirmed", { confirmed: false });
    const deps = testDeps();
    expect(await runEmailDispatch(admin, MORNING_UTC, { userIds: [u.id] }, deps)).toMatchObject({ due: 1, skipped: 1, sent: 0 });
    expect(deps.provider.sent).toHaveLength(0);
  });

  it("records a provider failure once and does not retry that slot (no double sends)", async () => {
    const u = await makeUser("fail");
    const failing = testDeps(new TestEmailProvider({ fail: true }));
    expect(await runEmailDispatch(admin, MORNING_UTC, { userIds: [u.id] }, failing)).toMatchObject({ failed: 1, sent: 0 });
    const ok = testDeps();
    expect(await runEmailDispatch(admin, new Date("2026-10-21T08:20:00Z"), { userIds: [u.id] }, ok)).toMatchObject({ duplicate: 1, sent: 0 });
    expect(ok.provider.sent).toHaveLength(0);
    expect((await rows(u.id)).map((r) => r.status)).toEqual(["failed"]);
  });

  it("with EMAIL_MODE=test (no provider injected) records the check-in without delivering it", async () => {
    const u = await makeUser("testmode");
    const summary = await runEmailDispatch(admin, MORNING_UTC, { userIds: [u.id] }, { mode: "test", draft: async () => ({ subject: "Hi", body: "Hi" }) });
    expect(summary).toMatchObject({ test: 1, sent: 0 });
    expect((await rows(u.id)).map((r) => [r.status, r.provider])).toEqual([["test", "test"]]);
  });
});
