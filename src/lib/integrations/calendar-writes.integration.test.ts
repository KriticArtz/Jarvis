/**
 * Calendar phase 2 (writes) against a real Supabase stack with real RLS and
 * an in-memory fake Google (OAuth token endpoint + Calendar events API with
 * scope checks). Covers: read-only → write upgrade, the assistant's
 * propose → confirm flow (nothing reaches Google before confirmation),
 * idempotent creates, reschedule across DST, update, delete, deleted/invited
 * events, revoked access, a grant Google says can't write, cross-user and
 * demo isolation, sync of Jarvis-created/Google-edited/deleted events, and
 * free-time search around events.
 *
 * Run with `npm run test:integration` (needs `supabase start`). Skips itself
 * if the stack isn't reachable.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { addDays, localDate } from "@/lib/time";
import { GOOGLE_CALENDAR_EVENTS_SCOPE, GOOGLE_CALENDAR_READONLY_SCOPE, type GoogleEvent } from "./calendar/google";
import { saveGoogleConnection, syncGoogleCalendar } from "./calendar/sync";
import { calendarWriteState, createCalendarEvent, getCalendarEventDetails, updateCalendarEvent } from "./calendar/mutations";
import { timedTimes } from "./calendar/times";
import { loadCalendar } from "./calendar/context";
import { runTool } from "@/lib/assistant/actions/registry";
import type { ToolContext } from "@/lib/assistant/actions/types";

const URL_ = process.env.INTEGRATION_SUPABASE_URL ?? "http://127.0.0.1:54321";
const PUBLISHABLE = process.env.INTEGRATION_SUPABASE_PUBLISHABLE_KEY ?? "";
const SECRET = process.env.INTEGRATION_SUPABASE_SECRET_KEY ?? "";
const reachable = await fetch(`${URL_}/auth/v1/health`, { headers: { apikey: PUBLISHABLE } }).then((r) => r.ok).catch(() => false);
const enabled = reachable && Boolean(PUBLISHABLE && SECRET);

type DB = SupabaseClient;
type Who = "a" | "b" | "ro";

// The calendar tools and mutations use the server's configuration and the
// global fetch, exactly as in production; point both at the fake Google.
const saved = { ...process.env };
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE;
process.env.SUPABASE_SECRET_KEY = SECRET;
process.env.GOOGLE_CLIENT_ID = "test-client";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";
process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
delete process.env.GOOGLE_API_TEST_BASE_URL;

/** In-memory Google Calendar with per-token scopes. */
const google = {
  events: new Map<string, GoogleEvent>(),
  tokens: new Map<string, string[]>(), // access token → scopes
  refresh: new Map<string, string[]>(), // refresh token → scopes
  writes: [] as { method: string; id: string | null; token: string }[],
  counter: 0,
  /** Next write answers 403 insufficientPermissions even with a write token. */
  denyNextWrite: false,
};

function grant(scopes: string[]) {
  const n = ++google.counter;
  google.tokens.set(`at-${n}`, scopes);
  google.refresh.set(`rt-${n}`, scopes);
  return { accessToken: `at-${n}`, refreshToken: `rt-${n}`, expiresAt: new Date(Date.now() + 3600_000).toISOString(), scopes };
}

const realFetch = globalThis.fetch;
const json = (body: unknown, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function fakeGoogleFetch(input: URL | RequestInfo, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!/(^|\.)googleapis\.com$/.test(url.hostname)) return realFetch(input as RequestInfo, init);

  if (url.pathname === "/token") {
    const body = new URLSearchParams(String(init?.body));
    const scopes = google.refresh.get(body.get("refresh_token") ?? "");
    if (body.get("grant_type") !== "refresh_token" || !scopes) return json({ error: "invalid_grant" }, 400);
    const access = `at-${++google.counter}`;
    google.tokens.set(access, scopes);
    return json({ access_token: access, expires_in: 3600, scope: scopes.join(" "), token_type: "Bearer" });
  }
  if (url.pathname === "/revoke") return json({});

  const m = url.pathname.match(/^\/calendar\/v3\/calendars\/primary\/events(?:\/([^/]+))?$/);
  if (!m) return json({ error: { code: 404 } }, 404);
  const token = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "") ?? "";
  const scopes = google.tokens.get(token);
  if (!scopes) return json({ error: { code: 401, errors: [{ reason: "authError" }] } }, 401);
  const method = (init?.method ?? "GET").toUpperCase();
  const id = m[1] ? decodeURIComponent(m[1]) : null;

  if (method !== "GET") {
    google.writes.push({ method, id, token });
    if (!scopes.includes(GOOGLE_CALENDAR_EVENTS_SCOPE) || google.denyNextWrite) {
      google.denyNextWrite = false;
      return json({ error: { code: 403, errors: [{ reason: "insufficientPermissions" }], status: "PERMISSION_DENIED", details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } }, 403);
    }
  }
  if (method === "GET" && !id) {
    const items = [...google.events.values()];
    return json({ timeZone: "UTC", items });
  }
  if (method === "GET") {
    const ev = id ? google.events.get(id) : null;
    return ev ? json(ev) : json({ error: { code: 404 } }, 404);
  }
  if (method === "POST") {
    const body = JSON.parse(String(init?.body)) as GoogleEvent;
    if (body.id && google.events.has(body.id)) return json({ error: { code: 409, errors: [{ reason: "duplicate" }] } }, 409);
    const ev: GoogleEvent = { ...body, id: body.id ?? `g${++google.counter}`, status: "confirmed", organizer: { self: true }, htmlLink: `https://www.google.com/calendar/event?eid=${body.id}` };
    google.events.set(ev.id!, ev);
    return json(ev);
  }
  const existing = id ? google.events.get(id) : undefined;
  if (!existing || existing.status === "cancelled") return json({ error: { code: 404 } }, existing ? 410 : 404);
  if (existing.organizer?.self === false) return json({ error: { code: 403, errors: [{ reason: "forbiddenForNonOrganizer" }] } }, 403);
  if (method === "PATCH") {
    const patch = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const merged = { ...existing, ...patch } as GoogleEvent;
    // Google drops null date/dateTime keys.
    for (const k of ["start", "end"] as const) {
      const v = merged[k] as Record<string, unknown> | undefined;
      if (v) merged[k] = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null)) as GoogleEvent["start"];
    }
    google.events.set(id!, merged);
    return json(merged);
  }
  if (method === "DELETE") {
    google.events.delete(id!);
    return new Response(null, { status: 204 });
  }
  return json({ error: { code: 400 } }, 400);
}

let admin: DB;
const users = {} as Record<Who, { id: string; db: DB; conv: string }>;
const TZ = "America/New_York";
const today = localDate(TZ);
/** Local date + time in TZ → the UTC instants Google stores. */
const at = (date: string, time: string, minutes: number) => timedTimes(date, time, minutes, TZ) as { startsAt: string; endsAt: string };
const later = () => new Date(Date.now() + 1500).toISOString();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function makeUser(tag: string) {
  const email = `it-calw-${tag}-${Date.now()}@lifepilot.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "integration-pass-1", email_confirm: true });
  if (error) throw error;
  const db = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  await db.auth.signInWithPassword({ email, password: "integration-pass-1" });
  await db.from("profiles").update({ timezone: TZ, wake_time: "07:00", sleep_time: "23:00", onboarding_completed_at: new Date().toISOString() }).eq("id", data.user.id);
  const { data: conv } = await db.from("conversations").insert({ user_id: data.user.id, channel: "app" }).select("id").single();
  return { id: data.user.id, db, conv: conv!.id as string };
}

function ctxFor(who: Who, opts: { turn?: string; conv?: string } = {}): ToolContext {
  const u = users[who];
  return { db: u.db as ToolContext["db"], userId: u.id, timezone: TZ, today, channel: "app", conversationId: opts.conv ?? u.conv, turnStartedAt: opts.turn ?? new Date().toISOString() };
}
const call = (ctx: ToolContext, name: string, args: object) => runTool(ctx, name, JSON.stringify(args));

/** Propose in one turn, then confirm in a later one (the only way a change runs). */
async function proposeAndConfirm(who: Who, tool: string, args: object) {
  const proposal = await call(ctxFor(who), tool, args);
  expect(proposal).toMatchObject({ status: "needs_confirmation" });
  await wait(20);
  const result = await call(ctxFor(who, { turn: later() }), "confirm_action", { confirmation_id: proposal.confirmationId });
  return { proposal, result };
}

async function localEvent(who: Who, providerId: string) {
  const { data } = await users[who].db.from("calendar_events").select("id, title, starts_at, ends_at, location, status, is_organizer").eq("provider_event_id", providerId).maybeSingle();
  return data as { id: string; title: string; starts_at: string; ends_at: string; location: string | null; status: string; is_organizer: boolean } | null;
}

/** The Friday before / Monday after the next US "fall back" (first Sunday of November). */
function nextFallBack(): { friday: string; monday: string } {
  let year = Number(today.slice(0, 4));
  const firstSunday = (y: number) => {
    for (let d = 1; d <= 7; d++) {
      const iso = `${y}-11-0${d}`;
      if (new Date(`${iso}T12:00:00Z`).getUTCDay() === 0) return iso;
    }
    throw new Error("unreachable");
  };
  if (addDays(firstSunday(year), -2) <= addDays(today, 1)) year++;
  const sunday = firstSunday(year);
  return { friday: addDays(sunday, -2), monday: addDays(sunday, 1) };
}

describe.skipIf(!enabled)("calendar writes (real Supabase, RLS, fake Google)", () => {
  const soon = addDays(today, 2);

  beforeAll(async () => {
    globalThis.fetch = fakeGoogleFetch as typeof fetch;
    admin = createClient(URL_, SECRET, { auth: { persistSession: false } });
    users.a = await makeUser("a");
    users.b = await makeUser("b");
    users.ro = await makeUser("ro");
    google.events.set("dentist", {
      id: "dentist",
      status: "confirmed",
      summary: "Dentist Appointment",
      description: "<p>Bring <b>insurance card</b></p>",
      location: "Main St",
      start: { dateTime: at(soon, "14:00", 60).startsAt, timeZone: TZ },
      end: { dateTime: at(soon, "14:00", 60).endsAt, timeZone: TZ },
      organizer: { self: true },
      attendees: [{ email: "me@example.com", self: true, responseStatus: "accepted" }, { email: "dr@example.com", displayName: "Dr. Lee", responseStatus: "accepted" }],
    });
    google.events.set("invited", {
      id: "invited",
      status: "confirmed",
      summary: "Board review",
      start: { dateTime: at(soon, "10:00", 60).startsAt },
      end: { dateTime: at(soon, "10:00", 60).endsAt },
      organizer: { email: "ceo@example.com", self: false },
    });
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
    for (const k of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "INTEGRATIONS_ENCRYPTION_KEY"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  // ------------------------------------------------------------- scope upgrade
  it("keeps a Phase 1 read-only connection syncing, refuses writes with a reconnect message, and upgrades on reconnect", async () => {
    const ro = users.ro;
    expect(await saveGoogleConnection(admin, ro.id, grant([GOOGLE_CALENDAR_READONLY_SCOPE]))).toEqual({ ok: true });
    expect(await syncGoogleCalendar(admin, ro.id)).toMatchObject({ ok: true });
    expect(await calendarWriteState(ro.db, ro.id)).toBe("read_only");
    const ev = await localEvent("ro", "dentist");
    expect(ev?.title).toBe("Dentist Appointment");

    const writesBefore = google.writes.length;
    const create = await call(ctxFor("ro"), "create_calendar_event", { title: "Gym", date: soon, start_time: "18:00", duration_minutes: 60, all_day_days: null, location: null, description: null });
    expect(create).toMatchObject({ status: "failed" });
    expect(create.message).toMatch(/read-only.*Reconnect/);
    const move = await call(ctxFor("ro"), "reschedule_calendar_event", { event_id: ev!.id, date: addDays(soon, 1), start_time: null });
    expect(move).toMatchObject({ status: "failed" });
    // No proposal was stored and Google was never asked to write.
    expect((await ro.db.from("assistant_actions").select("id").eq("status", "pending_confirmation")).data).toHaveLength(0);
    expect(await createCalendarEvent(admin, ro.id, { title: "x", times: timedTimes(soon, "18:00", 30, TZ) }, { idempotencyKey: "k" })).toEqual({ ok: false, reason: "needs_write_access" });
    expect(google.writes.length).toBe(writesBefore);
    // Details still work with read access.
    expect(await getCalendarEventDetails(admin, ro.id, ev!.id)).toMatchObject({ ok: true, details: { description: "Bring insurance card" } });

    // Reconnect with the new scope: same connection row, now writable.
    const { data: before } = await admin.from("integration_connections").select("id").eq("user_id", ro.id).single();
    expect(await saveGoogleConnection(admin, ro.id, grant([GOOGLE_CALENDAR_EVENTS_SCOPE, "openid"]))).toEqual({ ok: true });
    const { data: after } = await admin.from("integration_connections").select("id, scopes").eq("user_id", ro.id).single();
    expect(after).toEqual({ id: before!.id, scopes: [GOOGLE_CALENDAR_EVENTS_SCOPE] });
    expect(await calendarWriteState(ro.db, ro.id)).toBe("writable");
  });

  // ------------------------------------------------------------- confirmation flow
  it("create: proposal only → nothing in Google → confirmed in a later turn → created once", async () => {
    expect(await saveGoogleConnection(admin, users.a.id, grant([GOOGLE_CALENDAR_EVENTS_SCOPE]))).toEqual({ ok: true });
    expect(await syncGoogleCalendar(admin, users.a.id)).toMatchObject({ ok: true });
    const countBefore = google.events.size;
    const writesBefore = google.writes.length;

    const turn1 = new Date().toISOString();
    await wait(20);
    const proposal = await call(ctxFor("a", { turn: turn1 }), "create_calendar_event", {
      title: "Study block",
      date: soon,
      start_time: "13:30",
      duration_minutes: 60,
      all_day_days: null,
      location: "Library",
      description: null,
    });
    expect(proposal).toMatchObject({ status: "needs_confirmation" });
    expect(proposal.message).toContain("Add “Study block” to your calendar");
    expect(proposal.message).toContain("Overlaps: “Dentist Appointment”"); // 13:30–14:30 vs 14:00
    expect(google.writes.length).toBe(writesBefore); // never modify Google before confirmation
    expect(google.events.size).toBe(countBefore);

    // Same turn can't confirm; another user can't confirm.
    expect(await call(ctxFor("a", { turn: turn1 }), "confirm_action", { confirmation_id: proposal.confirmationId })).toMatchObject({ status: "failed" });
    expect(await call(ctxFor("b", { turn: later() }), "confirm_action", { confirmation_id: proposal.confirmationId })).toMatchObject({ status: "failed" });
    expect(google.writes.length).toBe(writesBefore);

    const confirmed = await call(ctxFor("a", { turn: later() }), "confirm_action", { confirmation_id: proposal.confirmationId });
    expect(confirmed).toMatchObject({ status: "succeeded" });
    expect(confirmed.message).toMatch(/^Added “Study block” — .*1:30 PM–2:30 PM\.$/);
    expect(google.events.size).toBe(countBefore + 1);
    const created = [...google.events.values()].find((e) => e.summary === "Study block")!;
    expect(created.id).toMatch(/^jv[0-9a-f]{40}$/);
    expect(created.start).toEqual({ dateTime: at(soon, "13:30", 60).startsAt, timeZone: TZ });
    expect((await localEvent("a", created.id!))?.location).toBe("Library");

    // Replaying the confirmation does nothing.
    expect(await call(ctxFor("a", { turn: later() }), "confirm_action", { confirmation_id: proposal.confirmationId })).toMatchObject({ status: "failed" });
    expect(google.events.size).toBe(countBefore + 1);
  });

  it("creates are idempotent: retrying the same request never duplicates", async () => {
    const input = { title: "Plan block", times: timedTimes(soon, "08:00", 30, TZ) };
    const first = await createCalendarEvent(admin, users.a.id, input, { idempotencyKey: "plan:p1:0" });
    const second = await createCalendarEvent(admin, users.a.id, input, { idempotencyKey: "plan:p1:0" });
    expect(first.ok && second.ok && first.event.id === second.event.id).toBe(true);
    expect([...google.events.values()].filter((e) => e.summary === "Plan block")).toHaveLength(1);
    const { data } = await users.a.db.from("calendar_events").select("id").eq("title", "Plan block");
    expect(data).toHaveLength(1);
  });

  it("reschedule: shows current and new time, keeps local time across DST, and changes Google only after confirmation", async () => {
    const { friday, monday } = nextFallBack();
    const t = at(friday, "14:00", 90);
    google.events.set("dst", { id: "dst", status: "confirmed", summary: "Physio", start: { dateTime: t.startsAt, timeZone: TZ }, end: { dateTime: t.endsAt, timeZone: TZ } });
    expect(await syncGoogleCalendar(admin, users.a.id, {}, { from: friday, days: 5 })).toMatchObject({ ok: true });
    const ev = await localEvent("a", "dst");

    const proposal = await call(ctxFor("a"), "reschedule_calendar_event", { event_id: ev!.id, date: monday, start_time: null });
    expect(proposal).toMatchObject({ status: "needs_confirmation" });
    expect(proposal.message).toMatch(/^Move “Physio”\nCurrent: Fri, .*, 2:00 PM–3:30 PM\nNew: Mon, .*, 2:00 PM–3:30 PM$/);
    expect(google.events.get("dst")!.start!.dateTime).toBe(t.startsAt); // unchanged until confirmed

    await wait(20);
    const res = await call(ctxFor("a", { turn: later() }), "confirm_action", { confirmation_id: proposal.confirmationId });
    expect(res).toMatchObject({ status: "succeeded" });
    const moved = at(monday, "14:00", 90);
    expect(google.events.get("dst")!.start).toEqual({ dateTime: moved.startsAt, timeZone: TZ });
    // EDT (UTC-4) → EST (UTC-5): the UTC hour shifts by one so the local time stays 2 PM.
    expect(new Date(t.startsAt).getUTCHours() + 1).toBe(new Date(moved.startsAt).getUTCHours());
    expect((await localEvent("a", "dst"))?.starts_at).toBe(moved.startsAt.replace(".000Z", "+00:00"));
  });

  it("update + delete go through confirmation; guests are mentioned; details come from Google on demand", async () => {
    const ev = await localEvent("a", "dentist");
    const { proposal, result } = await proposeAndConfirm("a", "update_calendar_event", { event_id: ev!.id, title: null, location: "12 Oak Ave", description: null, duration_minutes: null });
    expect(proposal.message).toContain("Location: 12 Oak Ave");
    expect(proposal.message).toContain("Guests (1) will be notified.");
    expect(result).toMatchObject({ status: "succeeded" });
    expect(google.events.get("dentist")!.location).toBe("12 Oak Ave");
    expect((await localEvent("a", "dentist"))?.location).toBe("12 Oak Ave");

    const details = await call(ctxFor("a"), "get_calendar_event", { event_id: ev!.id });
    expect(details).toMatchObject({ status: "info", data: { description: "Bring insurance card", guests: ["me@example.com", "Dr. Lee"], can_edit: true } });

    const del = await proposeAndConfirm("a", "delete_calendar_event", { event_id: ev!.id });
    expect(del.proposal.message).toContain("Delete “Dentist Appointment” from your calendar");
    expect(del.result).toMatchObject({ status: "succeeded" });
    expect(google.events.has("dentist")).toBe(false);
    expect(await localEvent("a", "dentist")).toBeNull();
  });

  it("handles events deleted in Google and events the user was only invited to", async () => {
    google.events.set("gone", { id: "gone", status: "confirmed", summary: "Gone soon", start: { dateTime: at(soon, "19:00", 30).startsAt }, end: { dateTime: at(soon, "19:00", 30).endsAt }, organizer: { self: true } });
    await syncGoogleCalendar(admin, users.a.id);
    const gone = await localEvent("a", "gone");
    google.events.delete("gone"); // deleted in Google after our last sync
    const { result } = await proposeAndConfirm("a", "reschedule_calendar_event", { event_id: gone!.id, date: addDays(soon, 1), start_time: null });
    expect(result).toMatchObject({ status: "failed", error: "not_found" });
    expect(result.message).toMatch(/doesn't exist anymore/);
    expect(await localEvent("a", "gone")).toBeNull(); // stale copy dropped

    const invited = await localEvent("a", "invited");
    expect(invited?.is_organizer).toBe(false);
    const res = await call(ctxFor("a"), "delete_calendar_event", { event_id: invited!.id });
    expect(res).toMatchObject({ status: "failed" });
    expect(res.message).toMatch(/organizer/);
    expect(google.events.has("invited")).toBe(true);
  });

  it("a grant Google says can't write is downgraded to read-only (reconnect prompt), not an error loop", async () => {
    google.denyNextWrite = true;
    const res = await createCalendarEvent(admin, users.a.id, { title: "Denied", times: timedTimes(soon, "20:00", 30, TZ) }, { idempotencyKey: randomUUID() });
    expect(res).toEqual({ ok: false, reason: "needs_write_access" });
    expect(await calendarWriteState(users.a.db, users.a.id)).toBe("read_only");
    // Reconnecting restores writing.
    await saveGoogleConnection(admin, users.a.id, grant([GOOGLE_CALENDAR_EVENTS_SCOPE]));
    expect(await calendarWriteState(users.a.db, users.a.id)).toBe("writable");
  });

  it("revoked access: the confirmed change fails honestly and the connection asks for reconnecting", async () => {
    const proposal = await call(ctxFor("a"), "create_calendar_event", { title: "Run", date: soon, start_time: "06:30", duration_minutes: 30, all_day_days: null, location: null, description: null });
    expect(proposal).toMatchObject({ status: "needs_confirmation" });
    // User revokes Jarvis in their Google account.
    google.tokens.clear();
    google.refresh.clear();
    await wait(20);
    const res = await call(ctxFor("a", { turn: later() }), "confirm_action", { confirmation_id: proposal.confirmationId });
    expect(res).toMatchObject({ status: "failed" });
    expect(res.message).toMatch(/revoked or expired/);
    expect(await calendarWriteState(users.a.db, users.a.id)).toBe("reauth_required");
    expect([...google.events.values()].some((e) => e.summary === "Run")).toBe(false);
    // New proposals are refused until reconnecting.
    expect(await call(ctxFor("a"), "create_calendar_event", { title: "Run", date: soon, start_time: "06:30", duration_minutes: 30, all_day_days: null, location: null, description: null })).toMatchObject({ status: "failed" });
    await saveGoogleConnection(admin, users.a.id, grant([GOOGLE_CALENDAR_EVENTS_SCOPE]));
  });

  // ------------------------------------------------------------- isolation
  it("another user can't see, open, change or confirm anything of A's", async () => {
    await saveGoogleConnection(admin, users.b.id, grant([GOOGLE_CALENDAR_EVENTS_SCOPE]));
    const aEvent = (await users.a.db.from("calendar_events").select("id").limit(1).single()).data!;
    // RLS: B reads none of A's rows, even by id.
    expect((await users.b.db.from("calendar_events").select("id").eq("id", aEvent.id)).data).toEqual([]);
    for (const [tool, args] of [
      ["get_calendar_event", { event_id: aEvent.id }],
      ["reschedule_calendar_event", { event_id: aEvent.id, date: addDays(soon, 1), start_time: null }],
      ["update_calendar_event", { event_id: aEvent.id, title: "Hacked", location: null, description: null, duration_minutes: null }],
      ["delete_calendar_event", { event_id: aEvent.id }],
    ] as const) {
      expect(await call(ctxFor("b"), tool, args)).toMatchObject({ status: "failed", error: "not_found" });
    }
    // The mutation layer itself also refuses (user id is always the caller's).
    expect(await updateCalendarEvent(admin, users.b.id, aEvent.id, { title: "Hacked" })).toEqual({ ok: false, reason: "not_found" });
    // B's own calendar doesn't include A's events.
    const bCal = await loadCalendar(users.b.db, users.b.id, { tz: TZ, from: today, days: 7 });
    expect(JSON.stringify(bCal)).not.toContain("Study block");
  });

  it("demo users never reach Google: no connection, so every calendar write is refused", async () => {
    const anon = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: demo } = await anon.auth.signInAnonymously();
    const demoId = demo.user!.id;
    await admin.from("profiles").update({ timezone: TZ, onboarding_completed_at: new Date().toISOString() }).eq("id", demoId);
    const writesBefore = google.writes.length;
    const ctx: ToolContext = { db: anon as ToolContext["db"], userId: demoId, timezone: TZ, today, channel: "app", conversationId: null, turnStartedAt: new Date().toISOString() };
    const res = await call(ctx, "create_calendar_event", { title: "x", date: soon, start_time: "09:00", duration_minutes: 30, all_day_days: null, location: null, description: null });
    expect(res).toMatchObject({ status: "failed" });
    expect(res.message).toMatch(/isn't connected/);
    expect(await createCalendarEvent(admin, demoId, { title: "x", times: timedTimes(soon, "09:00", 30, TZ) }, { idempotencyKey: "demo" })).toEqual({ ok: false, reason: "not_connected" });
    expect(google.writes.length).toBe(writesBefore);
  });

  // ------------------------------------------------------------- sync
  it("sync keeps Jarvis-created and Google-edited events without duplicates, removes deletions, and covers later months on demand", async () => {
    const created = [...google.events.values()].find((e) => e.summary === "Study block")!;
    google.events.set(created.id!, { ...created, summary: "Study block (edited in Google)" });
    const r1 = await syncGoogleCalendar(admin, users.a.id);
    const r2 = await syncGoogleCalendar(admin, users.a.id);
    expect(r1.ok && r2.ok).toBe(true);
    const { data: rows } = await users.a.db.from("calendar_events").select("title").eq("provider_event_id", created.id!);
    expect(rows).toEqual([{ title: "Study block (edited in Google)" }]);

    google.events.delete(created.id!);
    await syncGoogleCalendar(admin, users.a.id);
    expect(await localEvent("a", created.id!)).toBeNull();

    // An event 45 days out is outside the regular window until that range is viewed.
    const far = addDays(today, 45);
    const ft = at(far, "09:00", 60);
    google.events.set("far", { id: "far", status: "confirmed", summary: "Far away", start: { dateTime: ft.startsAt }, end: { dateTime: ft.endsAt } });
    expect(await syncGoogleCalendar(admin, users.a.id, {}, { from: addDays(far, -3), days: 7 })).toMatchObject({ ok: true });
    expect((await localEvent("a", "far"))?.title).toBe("Far away");
    await syncGoogleCalendar(admin, users.a.id); // the regular sync doesn't drop it
    expect((await localEvent("a", "far"))?.title).toBe("Far away");
  });

  it("find_free_time treats calendar events as hard busy blocks", async () => {
    const day = addDays(today, 3);
    const block = (h: string, mins: number) => at(day, h, mins);
    google.events.set("busy1", { id: "busy1", status: "confirmed", summary: "All morning", start: { dateTime: block("07:00", 300).startsAt }, end: { dateTime: block("07:00", 300).endsAt } });
    await syncGoogleCalendar(admin, users.a.id);
    const res = await call(ctxFor("a"), "find_free_time", { from_date: day, days: 1, duration_minutes: 60, time_of_day: "any" });
    expect(res).toMatchObject({ status: "info", data: { calendar_connected: true } });
    const slots = (res.data as { slots: { start: string }[] }).slots;
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) expect(s.start >= "12:00").toBe(true);
  });
});
