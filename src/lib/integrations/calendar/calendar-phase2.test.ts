import { describe, expect, it } from "vitest";
import { deleteEvent, eventIdFor, insertEvent, normalizeGoogleEvent, patchEvent, toGoogleEventBody } from "./google";
import { calendarScopes, GOOGLE_CALENDAR_EVENTS_SCOPE, GOOGLE_CALENDAR_READONLY_SCOPE, hasCalendarReadAccess, hasCalendarWriteAccess } from "./scopes";
import { allDayTimes, describeTimes, localDateTime, rescheduleTimes, timedTimes } from "./times";
import { findFreeSlots } from "./free-time";
import { layoutTimedEvents, parseCalendarParams, shiftDate, viewRange, viewTitle } from "./view";
import { groupByLocalDay } from "./local";
import { attachActions } from "@/lib/assistant/history";
import { applyActionEvent } from "@/lib/assistant/stream-protocol";

// plainText lives in a server-only module; its logic is exercised via the integration tests.

describe("calendar scopes", () => {
  it("treats the Phase 1 read-only grant as readable but not writable", () => {
    expect(hasCalendarReadAccess([GOOGLE_CALENDAR_READONLY_SCOPE])).toBe(true);
    expect(hasCalendarWriteAccess([GOOGLE_CALENDAR_READONLY_SCOPE])).toBe(false);
    expect(hasCalendarWriteAccess([GOOGLE_CALENDAR_EVENTS_SCOPE])).toBe(true);
    expect(hasCalendarReadAccess([GOOGLE_CALENDAR_EVENTS_SCOPE])).toBe(true);
    expect(hasCalendarReadAccess(["openid", "https://www.googleapis.com/auth/calendar.readonly"])).toBe(false);
  });

  it("stores only calendar scopes", () => {
    expect(calendarScopes(["openid", "email", GOOGLE_CALENDAR_EVENTS_SCOPE, GOOGLE_CALENDAR_EVENTS_SCOPE])).toEqual([GOOGLE_CALENDAR_EVENTS_SCOPE]);
  });
});

describe("Google event write bodies", () => {
  it("sends timed events as UTC instants plus the user's zone", () => {
    const body = toGoogleEventBody(
      { title: "Dentist", location: null, times: timedTimes("2026-10-07", "14:00", 60, "America/New_York") },
      { forInsert: true, id: "jvabc" },
    );
    expect(body).toEqual({
      id: "jvabc",
      summary: "Dentist",
      location: "",
      start: { dateTime: "2026-10-07T18:00:00.000Z", timeZone: "America/New_York" },
      end: { dateTime: "2026-10-07T19:00:00.000Z", timeZone: "America/New_York" },
    });
  });

  it("clears the other time form when a patch switches between timed and all-day", () => {
    const body = toGoogleEventBody({ times: allDayTimes("2026-10-07", 2, "UTC") });
    expect(body.start).toEqual({ date: "2026-10-07", dateTime: null, timeZone: "UTC" });
    expect(body.end).toEqual({ date: "2026-10-09", dateTime: null, timeZone: "UTC" });
    expect(body).not.toHaveProperty("summary");
    expect(toGoogleEventBody({ colorId: null })).toEqual({ colorId: null });
  });

  it("derives a stable, valid Google event id for idempotent creates", async () => {
    const a = await eventIdFor("user-1:assistant:req-1");
    expect(a).toBe(await eventIdFor("user-1:assistant:req-1"));
    expect(a).not.toBe(await eventIdFor("user-2:assistant:req-1"));
    // base32hex (a–v, 0–9), 5–1024 chars.
    expect(a).toMatch(/^[a-v0-9]{5,1024}$/);
  });
});

describe("Google write error handling", () => {
  const fake = (status: number, json?: unknown) => (async () => new Response(json ? JSON.stringify(json) : null, { status })) as typeof fetch;

  it("maps HTTP failures to safe reasons", async () => {
    expect(await insertEvent("t", "primary", {}, fake(401))).toMatchObject({ ok: false, reason: "unauthorized" });
    expect(await patchEvent("t", "primary", "e", {}, fake(404))).toMatchObject({ ok: false, reason: "not_found" });
    expect(await insertEvent("t", "primary", {}, fake(409))).toMatchObject({ ok: false, reason: "conflict" });
    expect(await insertEvent("t", "primary", {}, fake(500))).toMatchObject({ ok: false, reason: "error" });
    expect(
      await insertEvent("t", "primary", {}, fake(403, { error: { errors: [{ reason: "insufficientPermissions" }], details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } })),
    ).toMatchObject({ ok: false, reason: "insufficient_scope" });
    // Not being the organizer is NOT a scope problem (must not downgrade the connection).
    expect(await patchEvent("t", "primary", "e", {}, fake(403, { error: { errors: [{ reason: "forbiddenForNonOrganizer" }] } }))).toMatchObject({ ok: false, reason: "forbidden" });
    expect(await insertEvent("t", "primary", {}, fake(403, { error: { errors: [{ reason: "rateLimitExceeded" }] } }))).toMatchObject({ ok: false, reason: "error" });
    expect(await insertEvent("t", "primary", {}, (async () => Promise.reject(new Error("network"))) as typeof fetch)).toMatchObject({ ok: false, reason: "error" });
  });

  it("treats deleting an already-deleted event as done", async () => {
    expect(await deleteEvent("t", "primary", "e", fake(410))).toEqual({ ok: true });
    expect(await deleteEvent("t", "primary", "e", fake(204))).toEqual({ ok: true });
    expect(await deleteEvent("t", "primary", "e", fake(401))).toMatchObject({ ok: false, reason: "unauthorized" });
  });

  it("sends guest updates and the bearer token only in the header", async () => {
    let seen: { url: string; auth: string | null; method: string } | null = null;
    const spy = (async (url: URL, init: RequestInit) => {
      seen = { url: String(url), auth: new Headers(init.headers).get("Authorization"), method: String(init.method) };
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    }) as unknown as typeof fetch;
    await patchEvent("secret-access", "primary", "abc_20261001T140000Z", { summary: "x" }, spy);
    expect(seen!.method).toBe("PATCH");
    expect(seen!.url).toContain("/calendars/primary/events/abc_20261001T140000Z?sendUpdates=all");
    expect(seen!.url).not.toContain("secret-access");
    expect(seen!.auth).toBe("Bearer secret-access");
  });
});

describe("normalization metadata", () => {
  it("keeps color, series, organizer and guest count — never guest identities", () => {
    const n = normalizeGoogleEvent(
      {
        id: "occ_1",
        colorId: "11",
        recurringEventId: "series",
        start: { dateTime: "2026-10-01T10:00:00Z" },
        end: { dateTime: "2026-10-01T11:00:00Z" },
        organizer: { email: "boss@example.com", self: false },
        attendees: [{ email: "me@example.com", self: true }, { email: "room@example.com", resource: true }, { email: "a@example.com" }, { email: "b@example.com" }],
      },
      "primary",
      "UTC",
    );
    expect(n?.kind === "event" && n.event).toMatchObject({ colorId: "11", recurringEventId: "series", isOrganizer: false, attendeeCount: 2 });
    expect(JSON.stringify(n)).not.toContain("example.com");
    const bad = normalizeGoogleEvent({ id: "x", colorId: "<script>", start: { dateTime: "2026-10-01T10:00:00Z" }, end: { dateTime: "2026-10-01T11:00:00Z" } }, "primary", "UTC");
    expect(bad?.kind === "event" && bad.event.colorId).toBeNull();
  });
});

describe("times, time zones and DST", () => {
  const NY = "America/New_York";

  it("keeps the local wall-clock time when moving across a DST change", () => {
    // Fri Oct 30 2026 2 PM EDT (UTC-4) → Mon Nov 2 (EST, UTC-5), still 2 PM local.
    const ev = { starts_at: "2026-10-30T18:00:00.000Z", ends_at: "2026-10-30T19:30:00.000Z", all_day: false, start_date: null, end_date: null };
    const moved = rescheduleTimes(ev, { date: "2026-11-02", time: null }, NY);
    expect(moved).toEqual({ allDay: false, startsAt: "2026-11-02T19:00:00.000Z", endsAt: "2026-11-02T20:30:00.000Z", timeZone: NY });
    expect(localDateTime(moved.allDay ? "" : moved.startsAt, NY)).toEqual({ date: "2026-11-02", time: "14:00" });
  });

  it("uses real elapsed time for events that span the DST switch night", () => {
    // Nov 1 2026: clocks go back at 2 AM, so midnight + 3 real hours = 2:00 AM local (EST), not 3:00.
    const t = timedTimes("2026-11-01", "00:00", 180, NY);
    expect(t.allDay === false && t.startsAt).toBe("2026-11-01T04:00:00.000Z");
    expect(t.allDay === false && localDateTime(t.endsAt, NY).time).toBe("02:00");
  });

  it("moves all-day events by whole days and describes them", () => {
    const ev = { starts_at: "2026-10-05T04:00:00.000Z", ends_at: "2026-10-07T04:00:00.000Z", all_day: true, start_date: "2026-10-05", end_date: "2026-10-07" };
    expect(rescheduleTimes(ev, { date: "2026-10-12", time: "09:00" }, NY)).toEqual({ allDay: true, startDate: "2026-10-12", endDate: "2026-10-14", timeZone: NY });
    expect(describeTimes(ev, NY)).toBe("Mon, Oct 5 – Tue, Oct 6 (all day)");
    expect(describeTimes(timedTimes("2026-10-07", "14:00", 60, NY), NY)).toBe("Wed, Oct 7, 2:00 PM–3:00 PM");
  });
});

describe("find free time", () => {
  it("never suggests time over busy blocks and doesn't fill the day", () => {
    const slots = findFreeSlots(
      [
        { date: "2026-10-07", bounds: { start: 8 * 60, end: 22 * 60 }, busy: [{ start: 9 * 60, end: 17 * 60, label: "Work" }, { start: 18 * 60, end: 19 * 60, label: "Dentist" }] },
        { date: "2026-10-08", bounds: null, busy: [] },
      ],
      { durationMinutes: 45 },
    );
    expect(slots).toEqual([
      { date: "2026-10-07", start: "08:00", end: "08:45", windowMinutes: 60 },
      { date: "2026-10-07", start: "17:00", end: "17:45", windowMinutes: 60 },
    ]);
    const evening = findFreeSlots([{ date: "2026-10-07", bounds: { start: 480, end: 1320 }, busy: [{ start: 1080, end: 1140, label: "Dentist" }] }], { durationMinutes: 60, timeOfDay: "evening" });
    expect(evening.map((s) => s.start)).toEqual(["17:00", "19:00"]);
    for (const s of evening) expect(s.start >= "19:00" || s.end <= "18:00").toBe(true);
  });
});

describe("calendar page views", () => {
  it("parses and clamps URL params", () => {
    expect(parseCalendarParams({}, "2026-09-30")).toEqual({ view: "week", date: "2026-09-30" });
    expect(parseCalendarParams({ view: "month", date: "2026-02-30" }, "2026-09-30")).toEqual({ view: "month", date: "2026-09-30" });
    expect(parseCalendarParams({ view: "year", date: "2099-01-01" }, "2026-09-30")).toEqual({ view: "week", date: "2026-09-30" });
  });

  it("computes ranges, navigation and titles", () => {
    expect(viewRange("day", "2026-09-30")).toEqual({ from: "2026-09-30", days: 1 });
    expect(viewRange("week", "2026-09-30")).toEqual({ from: "2026-09-28", days: 7 });
    expect(viewRange("month", "2026-09-30")).toEqual({ from: "2026-08-31", days: 35 });
    expect(viewRange("month", "2026-08-15").days % 7).toBe(0);
    expect(shiftDate("month", "2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftDate("week", "2026-09-30", -1)).toBe("2026-09-23");
    expect(viewTitle("week", "2026-09-30")).toBe("Sep 28 – Oct 4, 2026");
    expect(viewTitle("month", "2026-09-30")).toBe("September 2026");
    expect(viewTitle("day", "2026-09-30")).toBe("Wednesday, September 30");
  });

  it("lays overlapping events side by side", () => {
    const ev = (title: string, start: string, end: string) => ({ title, start, end, allDay: false, location: null, tentative: false, busy: true });
    const out = layoutTimedEvents([ev("A", "09:00", "10:00"), ev("B", "09:30", "10:30"), ev("C", "10:00", "11:00"), ev("D", "12:00", "12:10")]);
    const by = Object.fromEntries(out.map((p) => [p.event.title, p]));
    expect([by.A.column, by.B.column, by.C.column]).toEqual([0, 1, 0]);
    expect(by.A.columns).toBe(2);
    expect(by.D).toMatchObject({ column: 0, columns: 1, height: 20 });
  });

  it("groups events by local day in the user's zone, with ids and metadata for the page", () => {
    const days = groupByLocalDay(
      [
        {
          id: "e1",
          title: "Late call",
          starts_at: "2026-10-01T03:00:00.000Z", // Sep 30, 11 PM in New York
          ends_at: "2026-10-01T04:00:00.000Z",
          all_day: false,
          start_date: null,
          end_date: null,
          location: null,
          status: "confirmed",
          is_busy: true,
          color_id: "5",
          recurring_event_id: "s",
          is_organizer: false,
          attendee_count: 3,
        },
      ],
      "America/New_York",
      "2026-09-30",
      2,
    );
    expect(days[0].events[0]).toMatchObject({ id: "e1", start: "23:00", end: "24:00", colorId: "5", recurring: true, editable: false, attendeeCount: 3 });
    expect(days[1].events).toHaveLength(0);
  });
});

describe("chat confirmation buttons", () => {
  it("carries the proposal id on live needs_confirmation events only", () => {
    let actions = applyActionEvent([], { t: "action", id: "call1", status: "needs_confirmation", label: "Move “Dentist”", confirmationId: "p1" });
    expect(actions[0].confirmationId).toBe("p1");
    actions = applyActionEvent(actions, { t: "action", id: "call1", status: "succeeded", label: "Moved", confirmationId: "p1" });
    expect(actions[0].confirmationId).toBeUndefined();
  });

  it("offers buttons in history only for open, unexpired proposals", () => {
    const messages = [{ id: "m1", role: "assistant" as const, created_at: "2026-10-01T11:00:01Z" }];
    const map = attachActions(
      messages,
      [
        { id: "open", status: "pending_confirmation", summary: "Move", created_at: "2026-10-01T11:00:00Z", resolved_at: null, expires_at: "2026-10-01T11:30:01Z" },
        { id: "old", status: "pending_confirmation", summary: "Delete", created_at: "2026-10-01T11:00:00Z", resolved_at: null, expires_at: "2026-10-01T11:10:00Z" },
        { id: "done", status: "succeeded", summary: "Created", created_at: "2026-10-01T10:00:00Z", resolved_at: "2026-10-01T10:59:00Z" },
      ],
      new Date("2026-10-01T11:20:00Z"),
    );
    const list = map.get("m1")!;
    expect(list.find((a) => a.id === "open")?.confirmationId).toBe("open");
    expect(list.find((a) => a.id === "old")?.confirmationId).toBeUndefined();
    expect(list.find((a) => a.id === "done")?.confirmationId).toBeUndefined();
  });
});
