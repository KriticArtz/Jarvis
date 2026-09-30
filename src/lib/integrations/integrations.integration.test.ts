/**
 * Calendar + fitness integrations against a real Supabase stack with real RLS,
 * using a fake Google (in-memory OAuth + Calendar API). Run with
 * `npm run test:integration` (needs `supabase start`). Skips itself if the
 * stack isn't reachable.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { localDate, addDays } from "@/lib/time";
import { GOOGLE_CALENDAR_SCOPE, type GoogleEvent } from "./calendar/google";
import { disconnectGoogleCalendar, saveGoogleConnection, syncGoogleCalendar, type IntegrationDeps } from "./calendar/sync";
import { loadCalendar } from "./calendar/context";
import { connectFitness, disconnectFitness, ingestFitness, loadFitnessSummary } from "./fitness/store";
import { loadAssistantContext } from "@/lib/ai/context";
import { renderContext } from "@/lib/ai/context-format";
import { runTool } from "@/lib/assistant/actions/registry";
import type { ToolContext } from "@/lib/assistant/actions/types";

const URL_ = process.env.INTEGRATION_SUPABASE_URL ?? "http://127.0.0.1:54321";
const PUBLISHABLE = process.env.INTEGRATION_SUPABASE_PUBLISHABLE_KEY ?? "";
const SECRET = process.env.INTEGRATION_SUPABASE_SECRET_KEY ?? "";
const reachable = await fetch(`${URL_}/auth/v1/health`, { headers: { apikey: PUBLISHABLE } }).then((r) => r.ok).catch(() => false);
const enabled = reachable && Boolean(PUBLISHABLE && SECRET);

// Route handlers read configuration from the environment.
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE;
process.env.SUPABASE_SECRET_KEY = SECRET;

type DB = SupabaseClient;
const KEY = randomBytes(32);
const CONFIG = { clientId: "test-client", clientSecret: "test-secret" };

/** In-memory Google: OAuth token endpoint, revocation and Calendar events list. */
function fakeGoogle() {
  const g = {
    events: new Map<string, GoogleEvent>(),
    validAccess: new Set<string>(),
    refreshTokens: new Set<string>(),
    revoked: [] as string[],
    tokenCalls: 0,
    counter: 0,
    grant() {
      const access = `at-${++g.counter}`;
      const refresh = `rt-${g.counter}`;
      g.validAccess.add(access);
      g.refreshTokens.add(refresh);
      return { accessToken: access, refreshToken: refresh, expiresAt: new Date(Date.now() + 3600_000).toISOString(), scopes: [GOOGLE_CALENDAR_SCOPE] };
    },
    fetch: (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(String(input));
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
      if (url.pathname.endsWith("/token")) {
        g.tokenCalls++;
        const body = new URLSearchParams(String(init?.body));
        if (body.get("grant_type") === "refresh_token") {
          if (!g.refreshTokens.has(body.get("refresh_token") ?? "")) return json({ error: "invalid_grant" }, 400);
          const access = `at-${++g.counter}`;
          g.validAccess.add(access);
          return json({ access_token: access, expires_in: 3600, scope: GOOGLE_CALENDAR_SCOPE, token_type: "Bearer" });
        }
        return json({ error: "unsupported_grant_type" }, 400);
      }
      if (url.pathname.endsWith("/revoke")) {
        const token = new URLSearchParams(String(init?.body)).get("token") ?? "";
        g.revoked.push(token);
        g.refreshTokens.delete(token);
        return json({});
      }
      if (url.pathname.endsWith("/calendars/primary/events")) {
        const auth = String((init?.headers as Record<string, string>)?.Authorization ?? "").replace("Bearer ", "");
        if (!g.validAccess.has(auth)) return json({ error: { code: 401 } }, 401);
        return json({ timeZone: "UTC", items: [...g.events.values()] });
      }
      return json({ error: "not found" }, 404);
    }) as typeof fetch,
  };
  return g;
}

let admin: DB;
const users: Record<"a" | "b", { id: string; db: DB; email: string }> = {} as never;
const today = localDate("UTC");
const tomorrow = addDays(today, 1);
const at = (date: string, hhmm: string) => `${date}T${hhmm}:00Z`;

async function makeUser(tag: string) {
  const email = `it-int-${tag}-${Date.now()}@lifepilot.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "integration-pass-1", email_confirm: true });
  if (error) throw error;
  const db = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  await db.auth.signInWithPassword({ email, password: "integration-pass-1" });
  await db.from("profiles").update({ timezone: "UTC", wake_time: "00:00", sleep_time: "23:59", display_name: tag.toUpperCase(), onboarding_completed_at: new Date().toISOString() }).eq("id", data.user.id);
  return { id: data.user.id, db, email };
}

const toolCtx = (who: "a" | "b"): ToolContext => ({ db: users[who].db as ToolContext["db"], userId: users[who].id, timezone: "UTC", today, channel: "app", conversationId: null as never, turnStartedAt: new Date().toISOString() });

describe.skipIf(!enabled)("calendar + fitness integrations (real Supabase, RLS)", () => {
  const googleA = fakeGoogle();
  const depsA = (): IntegrationDeps => ({ fetch: googleA.fetch, config: CONFIG, key: KEY });

  beforeAll(async () => {
    admin = createClient(URL_, SECRET, { auth: { persistSession: false } });
    users.a = await makeUser("a");
    users.b = await makeUser("b");
    googleA.events.set("e-meeting", { id: "e-meeting", status: "confirmed", summary: "Team meeting", location: "Room 4", start: { dateTime: at(tomorrow, "15:00") }, end: { dateTime: at(tomorrow, "16:00") } });
    googleA.events.set("e-allday", { id: "e-allday", status: "confirmed", summary: "Conference", start: { date: tomorrow }, end: { date: addDays(tomorrow, 1) } });
    googleA.events.set("e-lunch", { id: "e-lunch", status: "confirmed", summary: "Lunch with Sam", start: { dateTime: at(addDays(today, 2), "12:00") }, end: { dateTime: at(addDays(today, 2), "13:00") } });
  });

  // ------------------------------------------------------------- OAuth + tokens
  it("stores tokens encrypted, server-only, and only with the calendar scope and a refresh token", async () => {
    expect(await saveGoogleConnection(admin, users.a.id, { ...googleA.grant(), scopes: ["openid"] }, depsA())).toEqual({ ok: false, reason: "scope_denied" });
    expect(await saveGoogleConnection(admin, users.a.id, { ...googleA.grant(), refreshToken: null }, depsA())).toEqual({ ok: false, reason: "no_refresh_token" });
    const grant = googleA.grant();
    expect(await saveGoogleConnection(admin, users.a.id, grant, depsA())).toEqual({ ok: true });

    const { data: cred } = await admin.from("integration_credentials").select("*").eq("user_id", users.a.id).single();
    expect(JSON.stringify(cred)).not.toContain(grant.accessToken);
    expect(JSON.stringify(cred)).not.toContain(grant.refreshToken);
    expect(cred.refresh_token_enc).toMatch(/^v1\./);
    // Not readable through the API — not even by the owner.
    const own = await users.a.db.from("integration_credentials").select("*");
    expect(own.error?.code).toBe("42501");
    // The owner can see the connection metadata, which has no secrets.
    const { data: conn } = await users.a.db.from("integration_connections").select("*");
    expect(conn).toHaveLength(1);
    expect(JSON.stringify(conn)).not.toMatch(/at-|rt-|v1\./);
  });

  // ------------------------------------------------------------- sync
  it("syncs upcoming events idempotently", async () => {
    const first = await syncGoogleCalendar(admin, users.a.id, depsA());
    expect(first).toEqual({ ok: true, upserted: 3, cancelled: 0, removed: 0 });
    const again = await syncGoogleCalendar(admin, users.a.id, depsA());
    expect(again).toMatchObject({ ok: true, upserted: 3 });
    const { data: rows } = await users.a.db.from("calendar_events").select("provider_event_id, title, all_day, start_date, location, status, timezone").order("provider_event_id");
    expect(rows).toEqual([
      { provider_event_id: "e-allday", title: "Conference", all_day: true, start_date: tomorrow, location: null, status: "confirmed", timezone: "UTC" },
      { provider_event_id: "e-lunch", title: "Lunch with Sam", all_day: false, start_date: null, location: null, status: "confirmed", timezone: "UTC" },
      { provider_event_id: "e-meeting", title: "Team meeting", all_day: false, start_date: null, location: "Room 4", status: "confirmed", timezone: "UTC" },
    ]);
  });

  it("applies updates, cancellations and deletions from Google", async () => {
    googleA.events.set("e-meeting", { ...googleA.events.get("e-meeting")!, summary: "Team meeting (moved)", start: { dateTime: at(tomorrow, "17:00") }, end: { dateTime: at(tomorrow, "18:00") } });
    googleA.events.set("e-lunch", { id: "e-lunch", status: "cancelled" });
    googleA.events.delete("e-allday");
    const res = await syncGoogleCalendar(admin, users.a.id, depsA());
    expect(res).toEqual({ ok: true, upserted: 1, cancelled: 1, removed: 1 });
    const { data: rows } = await users.a.db.from("calendar_events").select("provider_event_id, title, status, starts_at").order("provider_event_id");
    expect(rows?.map((r) => [r.provider_event_id, r.title, r.status])).toEqual([
      ["e-lunch", "Lunch with Sam", "cancelled"],
      ["e-meeting", "Team meeting (moved)", "confirmed"],
    ]);
    expect(new Date(rows![1].starts_at).toISOString()).toBe(new Date(at(tomorrow, "17:00")).toISOString());
    // Cancelled events never reach the assistant.
    const cal = await loadCalendar(users.a.db, users.a.id, { tz: "UTC", from: today, days: 7 });
    expect(cal?.days.flatMap((d) => d.events.map((e) => e.title))).toEqual(["Team meeting (moved)"]);
  });

  it("refreshes an expired access token transparently", async () => {
    await admin.from("integration_credentials").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("user_id", users.a.id);
    const before = googleA.tokenCalls;
    expect(await syncGoogleCalendar(admin, users.a.id, depsA())).toMatchObject({ ok: true });
    expect(googleA.tokenCalls).toBe(before + 1);
    // A revoked access token (401) is refreshed once and retried.
    googleA.validAccess.clear();
    expect(await syncGoogleCalendar(admin, users.a.id, depsA())).toMatchObject({ ok: true });
  });

  // ------------------------------------------------------------- AI context
  it("feeds the calendar into the AI context and tools as read-only constraints", async () => {
    googleA.events.set("e-today", { id: "e-today", summary: "Dentist", start: { dateTime: at(today, "23:00") }, end: { dateTime: at(today, "23:30") } });
    await syncGoogleCalendar(admin, users.a.id, depsA());
    const { context } = await loadAssistantContext(users.a.db, users.a.id);
    expect(context.calendar?.days.map((d) => d.events.map((e) => e.title))).toEqual([["Dentist"], ["Team meeting (moved)"], []]);
    const text = renderContext(context);
    expect(text).toContain("Tomorrow (" + tomorrow + "):\n- 5:00 PM–6:00 PM: Team meeting (moved)");
    // The event is busy time: no free window overlaps 23:00–23:30 today.
    for (const w of context.schedule.freeWindowsToday ?? []) expect(w.end <= "23:00" || w.start >= "23:30").toBe(true);

    const tool = await runTool(toolCtx("a"), "list_calendar_events", JSON.stringify({ from_date: "tomorrow", days: 2 }));
    expect(tool.status).toBe("info");
    expect(JSON.stringify(tool.data)).toContain("Team meeting (moved)");
    expect((await runTool(toolCtx("a"), "list_calendar_events", JSON.stringify({ from_date: addDays(today, 29), days: 5 }))).status).toBe("failed");
    // No calendar for B.
    const none = await runTool(toolCtx("b"), "list_calendar_events", JSON.stringify({ from_date: null, days: 3 }));
    expect(none).toMatchObject({ status: "info", data: { connected: false } });
    expect((await loadAssistantContext(users.b.db, users.b.id)).context.calendar).toBeNull();
  });

  // ------------------------------------------------------------- isolation
  it("isolates users: no cross-user reads, syncs or token reuse", async () => {
    const googleB = fakeGoogle();
    googleB.events.set("b-1", { id: "b-1", summary: "B private", start: { dateTime: at(tomorrow, "09:00") }, end: { dateTime: at(tomorrow, "10:00") } });
    const depsB: IntegrationDeps = { fetch: googleB.fetch, config: CONFIG, key: KEY };
    await saveGoogleConnection(admin, users.b.id, googleB.grant(), depsB);
    await syncGoogleCalendar(admin, users.b.id, depsB);

    // A's session sees none of B's events (and vice versa), even when asking by id.
    expect((await users.a.db.from("calendar_events").select("title").eq("user_id", users.b.id)).data).toEqual([]);
    expect((await users.b.db.from("calendar_events").select("title")).data?.map((r) => r.title)).toEqual(["B private"]);
    expect(await loadCalendar(users.a.db, users.b.id, { tz: "UTC", from: today, days: 3 })).toBeNull();
    // B's sync didn't touch A's events.
    expect((await users.a.db.from("calendar_events").select("id")).data?.length).toBeGreaterThan(0);

    // A copied A's encrypted refresh token into B's row: it can't be decrypted for B.
    const { data: credA } = await admin.from("integration_credentials").select("refresh_token_enc, access_token_enc").eq("user_id", users.a.id).single();
    await admin.from("integration_credentials").update({ refresh_token_enc: credA!.refresh_token_enc, access_token_enc: credA!.access_token_enc, expires_at: new Date(0).toISOString() }).eq("user_id", users.b.id);
    expect(await syncGoogleCalendar(admin, users.b.id, { ...depsB, fetch: googleA.fetch })).toEqual({ ok: false, reason: "reauth_required" });
  });

  it("marks a revoked grant as needing reconnection and stops using stale events", async () => {
    googleA.refreshTokens.clear();
    googleA.validAccess.clear();
    expect(await syncGoogleCalendar(admin, users.a.id, depsA())).toEqual({ ok: false, reason: "reauth_required" });
    const { data: conn } = await users.a.db.from("integration_connections").select("status, last_error").single();
    expect(conn).toEqual({ status: "error", last_error: "reauth_required" });
    expect((await admin.from("integration_credentials").select("connection_id").eq("user_id", users.a.id)).data).toEqual([]);
    expect(await loadCalendar(users.a.db, users.a.id, { tz: "UTC", from: today, days: 3 })).toBeNull();
    expect((await loadAssistantContext(users.a.db, users.a.id)).context.calendar).toBeNull();
    // Without a calendar the sync reports cleanly, not an error.
    expect(await syncGoogleCalendar(admin, users.b.id, { fetch: googleA.fetch, config: null, key: KEY })).toEqual({ ok: false, reason: "not_configured" });
  });

  it("reconnect, then disconnect: revokes at Google and deletes tokens, events and the connection", async () => {
    const grant = googleA.grant();
    await saveGoogleConnection(admin, users.a.id, grant, depsA());
    expect(await syncGoogleCalendar(admin, users.a.id, depsA())).toMatchObject({ ok: true });
    expect((await users.a.db.from("integration_connections").select("status").single()).data).toEqual({ status: "connected" });

    expect(await disconnectGoogleCalendar(admin, users.a.id, depsA())).toEqual({ ok: true, revoked: true });
    expect(googleA.revoked).toContain(grant.refreshToken);
    for (const table of ["integration_connections", "integration_credentials", "calendar_events"]) {
      expect((await admin.from(table).select("user_id").eq("user_id", users.a.id)).data).toEqual([]);
    }
    expect(await syncGoogleCalendar(admin, users.a.id, depsA())).toEqual({ ok: false, reason: "not_connected" });
    expect(await disconnectGoogleCalendar(admin, users.a.id, depsA())).toEqual({ ok: true, revoked: false });
  });

  // ------------------------------------------------------------- fitness
  it("fitness: requires a connection, upserts idempotently, and stays per-user", async () => {
    const payload = {
      provider: "apple_health" as const,
      days: [
        { date: today, steps: 4200, activeCaloriesKcal: 310, distanceMeters: 3100, sleepMinutes: 420 },
        { date: addDays(today, -1), steps: 9100 },
      ],
      workouts: [{ id: "hk-1", activityType: "running" as const, startedAt: at(addDays(today, -1), "06:30"), endedAt: at(addDays(today, -1), "07:00"), distanceMeters: 5000 }],
    };
    expect(await ingestFitness(admin, users.a.id, payload)).toEqual({ ok: false, reason: "not_connected" });
    expect(await connectFitness(admin, users.a.id, "apple_health")).toEqual({ ok: true });
    expect(await ingestFitness(admin, users.a.id, payload)).toEqual({ ok: true, days: 2, workouts: 1, skipped: 0 });
    expect(await ingestFitness(admin, users.a.id, { ...payload, days: [{ date: today, steps: 5000 }] })).toMatchObject({ ok: true });
    const { data: days } = await users.a.db.from("fitness_daily_summaries").select("summary_date, steps").order("summary_date");
    expect(days).toEqual([
      { summary_date: addDays(today, -1), steps: 9100 },
      { summary_date: today, steps: 5000 },
    ]);
    expect((await users.a.db.from("fitness_workouts").select("id")).data).toHaveLength(1);
    // Old data is skipped, not stored.
    expect(await ingestFitness(admin, users.a.id, { provider: "apple_health", days: [{ date: addDays(today, -90), steps: 1 }], workouts: [] })).toMatchObject({ ok: true, days: 0, skipped: 1 });

    // B sees nothing of A's.
    expect((await users.b.db.from("fitness_daily_summaries").select("id")).data).toEqual([]);
    expect((await users.b.db.from("fitness_workouts").select("id")).data).toEqual([]);
    expect(await loadFitnessSummary(users.b.db, users.b.id, { tz: "UTC", today, days: 7 })).toBeNull();
  });

  it("fitness reaches the AI only through the read tool when connected", async () => {
    const { context } = await loadAssistantContext(users.a.db, users.a.id);
    expect(context.fitness).toEqual({ sources: ["Apple Health"] });
    expect(renderContext(context)).not.toContain("5000");
    const res = await runTool(toolCtx("a"), "get_fitness_summary", JSON.stringify({ days: 7 }));
    expect(res.status).toBe("info");
    expect(res.data).toMatchObject({ connected: true, totals: { workouts: 1, workoutMinutes: 30, avgSteps: 7050 } });
    expect(await runTool(toolCtx("b"), "get_fitness_summary", JSON.stringify({ days: 7 }))).toMatchObject({ status: "info", data: { connected: false } });
    expect((await loadAssistantContext(users.b.db, users.b.id)).context.fitness).toBeNull();
  });

  it("fitness disconnect deletes the data", async () => {
    expect(await disconnectFitness(admin, users.a.id, "apple_health")).toEqual({ ok: true });
    for (const table of ["fitness_daily_summaries", "fitness_workouts"]) {
      expect((await admin.from(table).select("id").eq("user_id", users.a.id)).data).toEqual([]);
    }
    expect((await loadAssistantContext(users.a.db, users.a.id)).context.fitness).toBeNull();
  });

  // ------------------------------------------------------------- native API auth
  it("native fitness API: bearer auth required, demo users refused, payload validated", async () => {
    const { POST: connect } = await import("@/app/api/integrations/fitness/connect/route");
    const { POST: sync } = await import("@/app/api/integrations/fitness/sync/route");
    const req = (headers: Record<string, string>, body: unknown) =>
      new NextRequest("http://localhost/api/integrations/fitness/sync", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

    expect((await sync(req({}, { provider: "apple_health" }))).status).toBe(401);
    expect((await sync(req({ Authorization: "Bearer not-a-real-token" }, { provider: "apple_health" }))).status).toBe(401);

    const anon = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false } });
    const { data: demo } = await anon.auth.signInAnonymously();
    expect((await connect(req({ Authorization: `Bearer ${demo.session!.access_token}` }, { provider: "apple_health" }))).status).toBe(401);

    const { data: session } = await users.b.db.auth.getSession();
    const auth = { Authorization: `Bearer ${session.session!.access_token}` };
    expect((await sync(req(auth, { provider: "apple_health", days: [{ date: today, steps: 10 }] }))).status).toBe(409); // not connected yet
    expect((await connect(req(auth, { provider: "apple_health" }))).status).toBe(200);
    const ok = await sync(req(auth, { provider: "apple_health", days: [{ date: today, steps: 1234 }] }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, days: 1, workouts: 0, skipped: 0 });
    // The user id comes only from the token: a body user_id is rejected outright.
    expect((await sync(req(auth, { provider: "apple_health", user_id: users.a.id, days: [] }))).status).toBe(400);
    expect((await sync(req(auth, "{not json"))).status).toBe(400);
    expect((await sync(req(auth, { provider: "apple_health", pad: "x".repeat(300_000) }))).status).toBe(413);
    // The data landed on B, never on A.
    expect((await users.b.db.from("fitness_daily_summaries").select("steps")).data).toEqual([{ steps: 1234 }]);
    expect((await admin.from("fitness_daily_summaries").select("id").eq("user_id", users.a.id)).data).toEqual([]);
  });
});
