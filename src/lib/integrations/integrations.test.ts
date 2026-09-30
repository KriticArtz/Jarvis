import { createHash, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { seal, unseal } from "./crypto";
import { checkOAuthState, startOAuth } from "./oauth-state";
import { buildAuthorizeUrl, GOOGLE_CALENDAR_SCOPE, listEvents, normalizeGoogleEvent } from "./calendar/google";
import { busyEventsForDay, groupByLocalDay, type CalendarEventRow } from "./calendar/local";
import { fitnessSyncSchema, withinAcceptedRange } from "./fitness/schema";
import { busyBlocks, freeWindows } from "@/lib/planning/availability";
import { renderContext } from "@/lib/ai/context-format";
import { assistantSystemPrompt } from "@/lib/ai/prompts";
import type { AssistantContext } from "@/lib/ai/context-types";

const key = randomBytes(32);

describe("token encryption", () => {
  it("round-trips and never stores plaintext", () => {
    const sealed = seal(key, "google_calendar:refresh:user-a", "1//refresh-token");
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain("refresh-token");
    expect(unseal(key, "google_calendar:refresh:user-a", sealed)).toBe("1//refresh-token");
    expect(seal(key, "p", "same")).not.toBe(seal(key, "p", "same")); // random IV
  });

  it("refuses the wrong purpose (e.g. another user's row), key, or a tampered value", () => {
    const sealed = seal(key, "google_calendar:refresh:user-a", "secret");
    expect(unseal(key, "google_calendar:refresh:user-b", sealed)).toBeNull();
    expect(unseal(key, "google_calendar:access:user-a", sealed)).toBeNull();
    expect(unseal(randomBytes(32), "google_calendar:refresh:user-a", sealed)).toBeNull();
    const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
    expect(unseal(key, "google_calendar:refresh:user-a", tampered)).toBeNull();
    expect(unseal(key, "x", "not-sealed")).toBeNull();
    expect(unseal(key, "x", null)).toBeNull();
  });
});

describe("OAuth state + PKCE", () => {
  const now = 1_700_000_000_000;

  it("accepts the matching state for the same user and returns the PKCE verifier", () => {
    const flow = startOAuth(key, "user-a", now);
    expect(flow.codeChallenge).toBe(createHash("sha256").update(flow.codeVerifier).digest("base64url"));
    expect(flow.cookieValue).not.toContain(flow.state); // encrypted, not just signed
    expect(checkOAuthState(key, flow.cookieValue, flow.state, "user-a", now + 1000)).toEqual({ ok: true, codeVerifier: flow.codeVerifier });
  });

  it("rejects a forged/mismatched state (CSRF)", () => {
    const flow = startOAuth(key, "user-a", now);
    expect(checkOAuthState(key, flow.cookieValue, "attacker-state", "user-a", now)).toEqual({ ok: false, reason: "state_mismatch" });
    expect(checkOAuthState(key, flow.cookieValue, null, "user-a", now)).toEqual({ ok: false, reason: "missing" });
  });

  it("rejects a callback for a different signed-in user", () => {
    const flow = startOAuth(key, "user-a", now);
    expect(checkOAuthState(key, flow.cookieValue, flow.state, "user-b", now)).toEqual({ ok: false, reason: "user_mismatch" });
  });

  it("rejects expired, missing, tampered or foreign-key cookies", () => {
    const flow = startOAuth(key, "user-a", now);
    expect(checkOAuthState(key, flow.cookieValue, flow.state, "user-a", now + 11 * 60_000)).toEqual({ ok: false, reason: "expired" });
    expect(checkOAuthState(key, undefined, flow.state, "user-a", now)).toEqual({ ok: false, reason: "missing" });
    expect(checkOAuthState(key, flow.cookieValue.slice(0, -3) + "abc", flow.state, "user-a", now)).toEqual({ ok: false, reason: "invalid" });
    expect(checkOAuthState(randomBytes(32), flow.cookieValue, flow.state, "user-a", now)).toEqual({ ok: false, reason: "invalid" });
  });

  it("asks Google only for event-level calendar access with PKCE and offline access", () => {
    const url = new URL(buildAuthorizeUrl({ clientId: "cid", clientSecret: "never-in-url" }, { redirectUri: "https://app.test/cb", state: "st", codeChallenge: "ch" }));
    expect(url.searchParams.get("scope")).toBe(GOOGLE_CALENDAR_SCOPE);
    // Events on the user's calendars only — not the full calendar scope (calendars, sharing, settings).
    expect(GOOGLE_CALENDAR_SCOPE).toBe("https://www.googleapis.com/auth/calendar.events");
    expect(url.searchParams.get("scope")?.split(" ")).toHaveLength(1);
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.toString()).not.toContain("never-in-url");
  });
});

describe("Google event normalization", () => {
  it("maps a timed event and keeps only needed fields", () => {
    const n = normalizeGoogleEvent(
      {
        id: "abc",
        status: "confirmed",
        summary: " Standup ",
        location: "Room 4",
        start: { dateTime: "2026-10-01T09:00:00-05:00", timeZone: "America/Chicago" },
        end: { dateTime: "2026-10-01T09:30:00-05:00" },
        ...({ description: "secret notes", attendees: [{ email: "x@y.z" }] } as object),
      },
      "primary",
      "UTC",
    );
    expect(n).toEqual({
      kind: "event",
      event: {
        providerEventId: "abc",
        calendarId: "primary",
        title: "Standup",
        startsAt: "2026-10-01T14:00:00.000Z",
        endsAt: "2026-10-01T14:30:00.000Z",
        allDay: false,
        startDate: null,
        endDate: null,
        timezone: "America/Chicago",
        location: "Room 4",
        status: "confirmed",
        isBusy: true,
        colorId: null,
        recurringEventId: null,
        isOrganizer: true,
        attendeeCount: 1,
      },
    });
    // Descriptions and guest details are fetched on demand, never stored.
    expect(JSON.stringify(n)).not.toContain("secret notes");
    expect(JSON.stringify(n)).not.toContain("x@y.z");
  });

  it("handles all-day events in the calendar's time zone", () => {
    const n = normalizeGoogleEvent({ id: "d", start: { date: "2026-10-02" }, end: { date: "2026-10-04" } }, "primary", "America/New_York");
    expect(n?.kind === "event" && n.event).toMatchObject({ allDay: true, startDate: "2026-10-02", endDate: "2026-10-04", startsAt: "2026-10-02T04:00:00.000Z" });
  });

  it("marks private, free, tentative and deleted events correctly", () => {
    const priv = normalizeGoogleEvent({ id: "p", start: { dateTime: "2026-10-01T10:00:00Z" }, end: { dateTime: "2026-10-01T11:00:00Z" } }, "primary", "UTC");
    expect(priv?.kind === "event" && priv.event.title).toBe("Busy");
    const free = normalizeGoogleEvent({ id: "f", transparency: "transparent", status: "tentative", start: { dateTime: "2026-10-01T10:00:00Z" }, end: { dateTime: "2026-10-01T11:00:00Z" } }, "primary", "UTC");
    expect(free?.kind === "event" && free.event).toMatchObject({ isBusy: false, status: "tentative" });
    expect(normalizeGoogleEvent({ id: "gone", status: "cancelled" }, "primary", "UTC")).toEqual({ kind: "cancelled", providerEventId: "gone" });
    expect(normalizeGoogleEvent({ status: "confirmed" }, "primary", "UTC")).toBeNull();
    expect(normalizeGoogleEvent({ id: "x", start: { dateTime: "nope" }, end: { dateTime: "nope" } }, "primary", "UTC")).toBeNull();
  });
});

describe("listEvents", () => {
  afterEach(() => vi.restoreAllMocks());

  it("follows pages and reports 401 as unauthorized", async () => {
    const pages = [
      { items: [{ id: "a", start: { dateTime: "2026-10-01T10:00:00Z" }, end: { dateTime: "2026-10-01T11:00:00Z" } }], nextPageToken: "p2" },
      { items: [{ id: "b", status: "cancelled" }] },
    ];
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      seen.push(String(url));
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
      return new Response(JSON.stringify(pages.shift()), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await listEvents("tok", { calendarId: "primary", timeMin: new Date("2026-10-01T00:00:00Z"), timeMax: new Date("2026-10-31T00:00:00Z"), fallbackTz: "UTC" }, fetchImpl);
    expect(res).toMatchObject({ ok: true, complete: true });
    expect(res.ok && res.items.map((i) => i.kind)).toEqual(["event", "cancelled"]);
    expect(seen[0]).toContain("singleEvents=true");
    expect(seen[0]).toContain("showDeleted=true");
    expect(seen[1]).toContain("pageToken=p2");

    const unauthorized = vi.fn(async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    expect(await listEvents("bad", { calendarId: "primary", timeMin: new Date(), timeMax: new Date(), fallbackTz: "UTC" }, unauthorized)).toEqual({ ok: false, reason: "unauthorized" });
  });
});

describe("calendar days and busy time", () => {
  const row = (over: Partial<CalendarEventRow>): CalendarEventRow => ({
    title: "x",
    starts_at: "2026-10-01T14:00:00Z",
    ends_at: "2026-10-01T15:00:00Z",
    all_day: false,
    start_date: null,
    end_date: null,
    location: null,
    status: "confirmed",
    is_busy: true,
    ...over,
  });

  it("groups events into the user's local days, clamps overnight events and drops cancellations", () => {
    const days = groupByLocalDay(
      [
        row({ title: "Meeting" }), // 9–10 AM Chicago
        row({ title: "Red-eye", starts_at: "2026-10-02T03:00:00Z", ends_at: "2026-10-02T08:00:00Z" }), // Oct 1 22:00 → Oct 2 03:00
        row({ title: "Trip", all_day: true, start_date: "2026-10-01", end_date: "2026-10-03" }),
        row({ title: "Cancelled", status: "cancelled" }),
        row({ title: "Ends at midnight", starts_at: "2026-10-02T03:00:00Z", ends_at: "2026-10-02T05:00:00Z" }), // 22:00–00:00
      ],
      "America/Chicago",
      "2026-10-01",
      3,
    );
    const titles = days.map((d) => d.events.map((e) => `${e.title} ${e.start ?? "all-day"}-${e.end ?? ""}`));
    expect(titles[0]).toEqual(["Trip all-day-", "Meeting 09:00-10:00", "Red-eye 22:00-24:00", "Ends at midnight 22:00-24:00"]);
    expect(titles[1]).toEqual(["Trip all-day-", "Red-eye 00:00-03:00"]);
    expect(titles[2]).toEqual([]);
  });

  it("counts busy calendar events as busy time for planning (free events don't block)", () => {
    const [day] = groupByLocalDay([row({ title: "Meeting" }), row({ title: "Focus (free)", is_busy: false, starts_at: "2026-10-01T20:00:00Z", ends_at: "2026-10-01T21:00:00Z" })], "America/Chicago", "2026-10-01", 1);
    const events = busyEventsForDay(day);
    expect(events).toEqual([{ title: "Meeting", start: "09:00", end: "10:00" }]);
    const profile = { work_start: null, work_end: null, work_days: [], work_label: "Work" };
    const windows = freeWindows(8 * 60, 12 * 60, busyBlocks("2026-10-01", profile, [], [], events));
    expect(windows.map(({ start, end }) => ({ start, end }))).toEqual([
      { start: 8 * 60, end: 9 * 60 },
      { start: 10 * 60, end: 12 * 60 },
    ]);
  });
});

describe("fitness ingestion schema", () => {
  const good = {
    provider: "apple_health",
    days: [{ date: "2026-09-30", steps: 8412, activeCaloriesKcal: 512, distanceMeters: 6120, sleepMinutes: 431 }],
    workouts: [{ id: "w1", activityType: "running", startedAt: "2026-09-30T06:30:00-05:00", endedAt: "2026-09-30T07:05:00-05:00" }],
  };

  it("accepts normalized aggregates and workouts", () => {
    expect(fitnessSyncSchema.safeParse(good).success).toBe(true);
    expect(fitnessSyncSchema.parse({ provider: "health_connect" })).toEqual({ provider: "health_connect", days: [], workouts: [] });
  });

  it.each([
    ["an unknown provider", { ...good, provider: "fitbit" }],
    ["raw/extra health fields", { ...good, days: [{ date: "2026-09-30", heartRate: [72, 80] }] }],
    ["a user id in the payload", { ...good, user_id: "someone-else" }],
    ["negative steps", { ...good, days: [{ date: "2026-09-30", steps: -1 }] }],
    ["impossible sleep", { ...good, days: [{ date: "2026-09-30", sleepMinutes: 2000 }] }],
    ["a workout that ends before it starts", { ...good, workouts: [{ ...good.workouts[0], endedAt: "2026-09-30T06:00:00-05:00" }] }],
    ["a 30-hour workout", { ...good, workouts: [{ ...good.workouts[0], endedAt: "2026-10-01T12:30:00-05:00" }] }],
    ["an unknown workout type", { ...good, workouts: [{ ...good.workouts[0], activityType: "skydiving" }] }],
    ["too many days", { ...good, days: Array.from({ length: 63 }, () => good.days[0]) }],
  ])("rejects %s", (_label, payload) => {
    expect(fitnessSyncSchema.safeParse(payload).success).toBe(false);
  });

  it("only accepts recent days", () => {
    expect(withinAcceptedRange("2026-09-30", "2026-09-30")).toBe(true);
    expect(withinAcceptedRange("2026-10-01", "2026-09-30")).toBe(true);
    expect(withinAcceptedRange("2026-10-02", "2026-09-30")).toBe(false);
    expect(withinAcceptedRange("2026-07-01", "2026-09-30")).toBe(false);
  });
});

describe("AI context and rules", () => {
  const ctx: AssistantContext = {
    now: { date: "2026-10-01", time: "14:00", weekday: "Thursday", timezone: "America/Chicago" },
    user: { name: "Sam" },
    assistant: { name: "Nova", personality: "direct" },
    schedule: { wake: "07:00", sleep: "23:00", work: null, commitmentsToday: [], otherCommitments: [], freeWindowsToday: [], freeMinutesRemainingToday: 0 },
    goals: [],
    today: { tasks: [], planAccepted: false, checkIns: [] },
    recent: { last7Days: { planned: 0, completed: 0, missed: 0 }, lastWeeklyReview: null },
    memories: [],
    otherConversationSummaries: [],
    calendar: {
      provider: "Google Calendar",
      lastSyncedAt: null,
      days: [
        { date: "2026-10-01", events: [{ title: "Team sync", start: "15:00", end: "16:00", allDay: false, location: null, tentative: false, busy: true }] },
        { date: "2026-10-02", events: [] },
      ],
    },
    fitness: { sources: ["Apple Health"] },
  };

  it("renders calendar events as read-only constraints and only flags fitness as connected", () => {
    const text = renderContext(ctx);
    expect(text).toContain("## Calendar (Google Calendar, read-only");
    expect(text).toContain("Today (2026-10-01):\n- 3:00 PM–4:00 PM: Team sync");
    expect(text).toContain("Tomorrow (2026-10-02):\n- No events");
    expect(text).toContain("Connected: Apple Health");
    expect(text).not.toMatch(/\d+ steps|kcal|sleep (minutes|hours)|workout minutes/i); // no health data in the context itself
    expect(renderContext({ ...ctx, calendar: null, fitness: null })).toContain("## Calendar\nNot connected.");
  });

  it("tells the model calendar changes need the user's OK (or aren't possible without tools) and forbids medical claims", () => {
    const withTools = assistantSystemPrompt({ name: "Nova", personality: "direct" }, "app", { tools: true });
    expect(withTools).toContain("EVERY calendar change is only a proposal until the user approves it");
    expect(withTools).toContain("never say it's done before the confirmation succeeds");
    expect(withTools).toContain("every calendar change (create, update, move, delete)");
    expect(withTools).toContain("Don't fill every free minute");
    const withoutTools = assistantSystemPrompt({ name: "Nova", personality: "direct" }, "app", { tools: false });
    expect(withoutTools).toContain("You can't change the calendar from here; never claim you did.");
    for (const prompt of [withTools, withoutTools]) {
      expect(prompt).toMatch(/fixed commitments — plan around them and never (suggest )?double-book/);
      expect(prompt).toContain("Never diagnose, make medical claims or give medical advice");
    }
    expect(assistantSystemPrompt({ name: "Nova", personality: "direct" }, "app", { tools: true })).toContain("get_fitness_summary only when the request actually needs it");
  });
});

describe("before the integrations migration is applied", () => {
  // A query builder that fails like PostgREST does for a missing table.
  const missingTables = () => {
    const result = { data: null, error: { code: "42P01", message: 'relation "integration_connections" does not exist' }, count: null };
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "lt", "gt", "gte", "lte", "order", "limit", "in"]) q[m] = () => q;
    q.then = (resolve: (v: typeof result) => unknown) => resolve(result);
    q.maybeSingle = async () => result;
    return { from: () => q } as never;
  };

  it("treats integrations as not connected instead of failing", async () => {
    const { getConnections } = await import("./connections");
    const { loadCalendar } = await import("./calendar/context");
    const { loadFitnessSummary } = await import("./fitness/store");
    expect(await getConnections(missingTables(), "u")).toEqual([]);
    expect(await loadCalendar(missingTables(), "u", { tz: "UTC", from: "2026-10-01", days: 3 })).toBeNull();
    expect(await loadFitnessSummary(missingTables(), "u", { tz: "UTC", today: "2026-10-01", days: 7 })).toBeNull();
  });
});

describe("token exchange failure details (for logs)", () => {
  const cfg = { clientId: "cid.apps.googleusercontent.com", clientSecret: "SUPER-SECRET-VALUE" };

  it("reports Google's status and error without the code, verifier, secret or tokens", async () => {
    const { exchangeCode } = await import("./calendar/google");
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: "invalid_client", error_description: "Unauthorized" }), { status: 401 })) as unknown as typeof fetch;
    const res = await exchangeCode(cfg, { code: "4/AUTH-CODE", codeVerifier: "VERIFIER-XYZ", redirectUri: "https://app.test/cb" }, fetchImpl);
    expect(res).toEqual({ ok: false, reason: "error", detail: { httpStatus: 401, googleError: "invalid_client", googleErrorDescription: "Unauthorized", missingAccess: false } });
    expect(JSON.stringify(res)).not.toMatch(/SUPER-SECRET|AUTH-CODE|VERIFIER-XYZ/);

    const invalidGrant = (async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Bad Request" }), { status: 400 })) as unknown as typeof fetch;
    expect(await exchangeCode(cfg, { code: "c", codeVerifier: "v", redirectUri: "r" }, invalidGrant)).toMatchObject({ reason: "invalid_grant", detail: { httpStatus: 400, googleError: "invalid_grant" } });

    const down = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    expect(await exchangeCode(cfg, { code: "c", codeVerifier: "v", redirectUri: "r" }, down)).toMatchObject({ reason: "error", detail: { network: true } });
  });

  it("log sanitizing keeps these fields readable (none of their keys look like secrets)", async () => {
    const { log } = await import("@/lib/observability/log");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const entry = log("error", "integrations", "google oauth callback", { step: "token_exchange", httpStatus: 401, googleError: "invalid_client", hasRefresh: false, redirectUri: "https://app.test/cb" });
    expect(entry.context).toMatchObject({ httpStatus: 401, googleError: "invalid_client", hasRefresh: false, redirectUri: "https://app.test/cb" });
    spy.mockRestore();
  });
});
