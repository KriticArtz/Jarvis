/**
 * The Google Calendar connect journey through the REAL route handlers
 * (/api/integrations/google/start and /callback) against a real local
 * Supabase stack and a mock Google (scripts/mock-google.mjs) that enforces
 * client credentials, PKCE, the exact redirect URI and single-use codes.
 * Only the signed-in session is stubbed. Run: npm run test:integration.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { addDays, localDate } from "@/lib/time";
import { createMockGoogle, type MockGoogle } from "../../../../../scripts/mock-google.mjs";

const URL_ = process.env.INTEGRATION_SUPABASE_URL ?? "http://127.0.0.1:54321";
const PUBLISHABLE = process.env.INTEGRATION_SUPABASE_PUBLISHABLE_KEY ?? "";
const SECRET = process.env.INTEGRATION_SUPABASE_SECRET_KEY ?? "";
const reachable = await fetch(`${URL_}/auth/v1/health`, { headers: { apikey: PUBLISHABLE } }).then((r) => r.ok).catch(() => false);
const enabled = reachable && Boolean(PUBLISHABLE && SECRET);

// The routes read their configuration from the environment.
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE;
process.env.SUPABASE_SECRET_KEY = SECRET;
process.env.GOOGLE_CLIENT_ID = "test-client";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";
process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
delete process.env.NEXT_PUBLIC_APP_URL;
delete process.env.VERCEL_ENV;

// The one stub: who is signed in.
let session: { userId: string; isDemo: boolean } | null = null;
vi.mock("@/lib/auth", () => ({
  getSessionUser: async () => (session ? { supabase: null, userId: session.userId, email: null, isDemo: session.isDemo } : null),
}));

const { GET: start } = await import("./start/route");
const { GET: callback } = await import("./callback/route");
const { syncGoogleCalendar, disconnectGoogleCalendar, googleAccountLabel } = await import("@/lib/integrations/calendar/sync");

const ORIGIN = "http://app.test";
const EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
type DB = SupabaseClient;
let admin: DB;
let google: MockGoogle;
let G = "";
const users: Record<"a" | "b", { id: string; db: DB; google: string }> = {} as never;
const tomorrow = addDays(localDate("UTC"), 1);

const control = (path: string, body: unknown) => fetch(`${G}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const as = (who: "a" | "b" | null, isDemo = false) => (session = who ? { userId: users[who].id, isDemo } : null);
const settingsStatus = (res: Response) => new URL(res.headers.get("location")!).searchParams.get("calendar");
const conn = async (who: "a" | "b") =>
  (await admin.from("integration_connections").select("id, status, scopes, last_error").eq("user_id", users[who].id).eq("provider", "google_calendar").maybeSingle()).data;
const creds = async (who: "a" | "b") => (await admin.from("integration_credentials").select("access_token_enc, refresh_token_enc, expires_at").eq("user_id", users[who].id).maybeSingle()).data;
const events = async (who: "a" | "b") => (await admin.from("calendar_events").select("title, user_id").eq("user_id", users[who].id)).data ?? [];

/** /start as the browser would call it; returns the response and the state cookie it set. */
async function begin(ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15", query = "") {
  const res = await start(new NextRequest(`${ORIGIN}/api/integrations/google/start${query}`, { headers: { "user-agent": ua } }));
  const cookie = res.cookies.get("jarvis_oauth_google")?.value ?? null;
  return { res, cookie };
}
/** Follow /start → Google consent → back to /callback with the cookie, like a browser. */
async function connect(opts: { cookie?: string | null; tamperState?: boolean } = {}) {
  const { res, cookie } = await begin();
  const authorize = res.headers.get("location")!;
  const consent = await fetch(authorize, { redirect: "manual" });
  const back = new URL(consent.headers.get("location")!);
  if (opts.tamperState) back.searchParams.set("state", "forged-state");
  const jar = opts.cookie === undefined ? cookie : opts.cookie;
  const req = new NextRequest(back.toString().replace(back.origin, ORIGIN), { headers: jar ? { cookie: `jarvis_oauth_google=${jar}` } : {} });
  return { authorize: new URL(authorize), res: await callback(req) };
}

async function makeUser(tag: string) {
  const email = `it-goauth-${tag}-${Date.now()}@lifepilot.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "integration-pass-1", email_confirm: true });
  if (error) throw error;
  const db = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  await db.auth.signInWithPassword({ email, password: "integration-pass-1" });
  await db.from("profiles").update({ timezone: "UTC", onboarding_completed_at: new Date().toISOString() }).eq("id", data.user.id);
  return { id: data.user.id, db, google: `${tag}-${Date.now()}@gmail.test` };
}

describe.skipIf(!enabled)("Google Calendar OAuth routes (real handlers, real Supabase, mock Google)", () => {
  beforeAll(async () => {
    google = createMockGoogle();
    G = await google.listen();
    process.env.GOOGLE_API_TEST_BASE_URL = G;
    admin = createClient(URL_, SECRET, { auth: { persistSession: false } });
    users.a = await makeUser("a");
    users.b = await makeUser("b");
    await control("/__events", { email: users.a.google, events: [{ id: "a1", status: "confirmed", summary: "A's dentist", start: { dateTime: `${tomorrow}T15:00:00Z` }, end: { dateTime: `${tomorrow}T16:00:00Z` } }] });
    await control("/__events", { email: users.b.google, events: [{ id: "b1", status: "confirmed", summary: "B's standup", start: { dateTime: `${tomorrow}T09:00:00Z` }, end: { dateTime: `${tomorrow}T09:15:00Z` } }] });
  });
  afterAll(async () => {
    await google?.close();
  });
  beforeEach(async () => {
    await control("/__consent", { email: users.a.google, decision: "allow", scope: EVENTS_SCOPE });
  });

  // ---------------------------------------------------------------- /start
  it("start: sends signed-out people to log in, and refuses the demo", async () => {
    as(null);
    expect(new URL((await begin()).res.headers.get("location")!).pathname).toBe("/login");
    as("a", true);
    expect(settingsStatus((await begin()).res)).toBe("demo");
  });

  it("start: asks Google for event access only, with PKCE, offline access and a single-use state cookie", async () => {
    as("a");
    const { res, cookie } = await begin();
    const url = new URL(res.headers.get("location")!);
    expect(url.origin + url.pathname).toBe(`${G}/o/oauth2/v2/auth`);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "test-client",
      redirect_uri: `${ORIGIN}/api/integrations/google/callback`,
      response_type: "code",
      scope: EVENTS_SCOPE,
      access_type: "offline",
      prompt: "consent",
      code_challenge_method: "S256",
    });
    expect(url.searchParams.get("state")?.length).toBeGreaterThan(30);
    expect(cookie).toMatch(/^v1\./);
    const set = res.headers.get("set-cookie") ?? "";
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=lax/i);
    expect(set).toMatch(/Path=\/api\/integrations\/google/);
    // The state and verifier are sealed, never readable in the cookie.
    expect(cookie).not.toContain(url.searchParams.get("state")!);
  });

  it("start: explains in-app browsers Google blocks, and lets people try anyway", async () => {
    as("a");
    const insta = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 335.0.0.29.92";
    expect(settingsStatus((await begin(insta)).res)).toBe("embedded_browser");
    expect(new URL((await begin(insta, "?continue=1")).res.headers.get("location")!).pathname).toBe("/o/oauth2/v2/auth");
  });

  it("start: on production, moves the flow to the canonical host first", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://www.arovenna.com";
    try {
      const res = await start(new NextRequest("https://arovenna.com/api/integrations/google/start"));
      expect(res.headers.get("location")).toBe("https://www.arovenna.com/api/integrations/google/start");
      // And the test-only Google host is ignored there.
      const { googleTestBaseUrl } = await import("@/lib/env");
      expect(googleTestBaseUrl()).toBeUndefined();
    } finally {
      delete process.env.VERCEL_ENV;
      delete process.env.NEXT_PUBLIC_APP_URL;
    }
  });

  // ---------------------------------------------------------------- /callback failures
  it("callback: denied consent connects nothing", async () => {
    as("a");
    await control("/__consent", { decision: "deny" });
    const { res } = await connect();
    expect(settingsStatus(res)).toBe("denied");
    expect(await conn("a")).toBeNull();
  });

  it("callback: a forged state, a missing cookie, or another user's cookie are rejected", async () => {
    as("a");
    expect(settingsStatus((await connect({ tamperState: true })).res)).toBe("invalid_state");
    expect(settingsStatus((await connect({ cookie: null })).res)).toBe("invalid_state");
    // A's cookie arriving in B's session (e.g. a link replayed in another account).
    const { res: startRes, cookie } = await begin();
    const consent = await fetch(startRes.headers.get("location")!, { redirect: "manual" });
    const back = new URL(consent.headers.get("location")!);
    as("b");
    const res = await callback(new NextRequest(back.toString().replace(back.origin, ORIGIN), { headers: { cookie: `jarvis_oauth_google=${cookie}` } }));
    expect(settingsStatus(res)).toBe("invalid_state");
    expect(await conn("a")).toBeNull();
    expect(await conn("b")).toBeNull();
    // Every outcome clears the single-use cookie.
    expect(res.headers.get("set-cookie") ?? "").toMatch(/jarvis_oauth_google=;.*Max-Age=0/i);
  });

  it("callback: an expired attempt is rejected", async () => {
    as("a");
    const { res: startRes, cookie } = await begin();
    const consent = await fetch(startRes.headers.get("location")!, { redirect: "manual" });
    const back = new URL(consent.headers.get("location")!);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 11 * 60_000);
    try {
      const res = await callback(new NextRequest(back.toString().replace(back.origin, ORIGIN), { headers: { cookie: `jarvis_oauth_google=${cookie}` } }));
      expect(settingsStatus(res)).toBe("expired");
    } finally {
      vi.useRealTimers();
    }
  });

  it("callback: refusing calendar access in the consent screen connects nothing", async () => {
    as("a");
    await control("/__consent", { decision: "no_scope" });
    expect(settingsStatus((await connect()).res)).toBe("scope_denied");
    expect(await conn("a")).toBeNull();
  });

  it("callback: signed-out people go to log in; a replayed code fails", async () => {
    as(null);
    const res = await callback(new NextRequest(`${ORIGIN}/api/integrations/google/callback?code=x&state=y`));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    as("a");
    const { res: startRes, cookie } = await begin();
    const consent = await fetch(startRes.headers.get("location")!, { redirect: "manual" });
    const back = new URL(consent.headers.get("location")!);
    // Spend the code once outside the app, as an attacker would have to.
    await fetch(`${G}/token`, { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code: back.searchParams.get("code")!, client_id: "test-client", client_secret: "test-secret" }) });
    const replay = await callback(new NextRequest(back.toString().replace(back.origin, ORIGIN), { headers: { cookie: `jarvis_oauth_google=${cookie}` } }));
    expect(settingsStatus(replay)).toBe("error");
    expect(await conn("a")).toBeNull();
  });

  // ---------------------------------------------------------------- the happy path and its lifecycle
  it("connect: stores the grant encrypted and syncs only this user's events", async () => {
    as("a");
    const { res } = await connect();
    expect(settingsStatus(res)).toBe("connected");
    expect(await conn("a")).toMatchObject({ status: "connected", scopes: [EVENTS_SCOPE], last_error: null });
    const c = await creds("a");
    expect(c?.access_token_enc).toMatch(/^v1\./);
    expect(c?.refresh_token_enc).toMatch(/^v1\./);
    expect(JSON.stringify(c)).not.toMatch(/\b(at|rt)-[0-9a-f]{24}\b/);
    expect((await events("a")).map((e) => e.title)).toEqual(["A's dentist"]);
    // The signed-in user can see their own events and connection, never the tokens.
    expect((await users.a.db.from("calendar_events").select("title")).data?.map((e) => e.title)).toEqual(["A's dentist"]);
    expect((await users.a.db.from("integration_credentials").select("*")).data ?? []).toEqual([]);
    // Settings can show which Google account is connected.
    expect(await googleAccountLabel(admin, users.a.id)).toBe(users.a.google);
  });

  it("isolation: a second user connects their own account; neither sees the other", async () => {
    await control("/__consent", { email: users.b.google });
    as("b");
    expect(settingsStatus((await connect()).res)).toBe("connected");
    expect((await events("b")).map((e) => e.title)).toEqual(["B's standup"]);
    expect((await users.b.db.from("calendar_events").select("title")).data?.map((e) => e.title)).toEqual(["B's standup"]);
    expect((await users.a.db.from("calendar_events").select("title")).data?.map((e) => e.title)).toEqual(["A's dentist"]);
    expect((await users.b.db.from("integration_connections").select("user_id")).data?.every((r) => r.user_id === users.b.id)).toBe(true);
  });

  it("refresh: an expired access token is renewed without asking the user to reconnect", async () => {
    const before = (await (await fetch(`${G}/__state`)).json()).calls.refresh;
    await control("/__expire", { email: users.a.google });
    await admin.from("integration_credentials").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("user_id", users.a.id);
    const res = await syncGoogleCalendar(admin, users.a.id);
    expect(res).toMatchObject({ ok: true });
    expect((await (await fetch(`${G}/__state`)).json()).calls.refresh).toBe(before + 1);
    expect(await conn("a")).toMatchObject({ status: "connected" });
    expect(new Date((await creds("a"))!.expires_at as string).getTime()).toBeGreaterThan(Date.now());
  });

  it("rate limits and a disabled Calendar API never cost the user their connection", async () => {
    for (const mode of ["rate_limited", "api_disabled"] as const) {
      await control("/__fail", { email: users.a.google, list: mode });
      expect(await syncGoogleCalendar(admin, users.a.id)).toEqual({ ok: false, reason: mode });
      expect(await conn("a")).toMatchObject({ status: "connected", last_error: mode });
      expect(await creds("a")).not.toBeNull();
      expect((await events("a")).length).toBe(1);
    }
    await control("/__fail", { email: users.a.google, list: null });
    expect(await syncGoogleCalendar(admin, users.a.id)).toMatchObject({ ok: true });
    expect(await conn("a")).toMatchObject({ status: "connected", last_error: null });
  });

  it("revoked access: marks the connection for reconnecting and drops the dead grant", async () => {
    await control("/__fail", { email: users.a.google, revoke: true });
    expect(await syncGoogleCalendar(admin, users.a.id)).toEqual({ ok: false, reason: "reauth_required" });
    expect(await conn("a")).toMatchObject({ status: "error", last_error: "reauth_required" });
    expect(await creds("a")).toBeNull();
    expect(await googleAccountLabel(admin, users.a.id)).toBeNull();
    // B is unaffected.
    expect(await conn("b")).toMatchObject({ status: "connected" });
  });

  it("reconnect: the same flow restores the connection", async () => {
    as("a");
    expect(settingsStatus((await connect()).res)).toBe("connected");
    expect(await conn("a")).toMatchObject({ status: "connected", last_error: null });
    expect(await creds("a")).not.toBeNull();
    expect((await events("a")).map((e) => e.title)).toEqual(["A's dentist"]);
  });

  it("disconnect: revokes at Google and deletes tokens, events and the connection", async () => {
    const before = (await (await fetch(`${G}/__state`)).json()).calls.revoke;
    expect(await disconnectGoogleCalendar(admin, users.a.id)).toEqual({ ok: true, revoked: true });
    expect((await (await fetch(`${G}/__state`)).json()).calls.revoke).toBe(before + 1);
    expect(await conn("a")).toBeNull();
    expect(await creds("a")).toBeNull();
    expect(await events("a")).toEqual([]);
    // B's connection and events are untouched.
    expect(await conn("b")).toMatchObject({ status: "connected" });
    expect((await events("b")).length).toBe(1);
  });
});
