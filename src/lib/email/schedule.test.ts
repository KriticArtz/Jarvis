import { describe, expect, it } from "vitest";
import { DEFAULT_CATCH_UP_MINUTES, dueEmailCheckIns, emailCheckInDedupeKey, type EmailSchedulePrefs } from "./schedule";

// A user who turned email on and chose morning and evening (every slot defaults to off in the database).
const base: EmailSchedulePrefs = {
  email_enabled: true,
  quiet_hours_start: "22:00:00",
  quiet_hours_end: "07:00:00",
  // Postgres returns `time` columns with seconds.
  email_morning_enabled: true,
  email_morning_time: "08:00:00",
  email_afternoon_enabled: false,
  email_afternoon_time: "13:00:00",
  email_evening_enabled: true,
  email_evening_time: "20:30:00",
};
const prefs = (over: Partial<EmailSchedulePrefs> = {}): EmailSchedulePrefs => ({ ...base, ...over });
const at = (iso: string) => new Date(iso);
const slots = (now: string, timezone: string, p: EmailSchedulePrefs = prefs()) => dueEmailCheckIns({ now: at(now), timezone, prefs: p }).map((d) => `${d.date}:${d.slot}`);

describe("dueEmailCheckIns: timing", () => {
  it("is due at the slot time and for the catch-up window after it, not before", () => {
    // America/Los_Angeles is UTC-7 (PDT) on 2026-10-21: 08:00 local = 15:00Z.
    expect(slots("2026-10-21T14:59:00Z", "America/Los_Angeles")).toEqual([]);
    expect(slots("2026-10-21T15:00:00Z", "America/Los_Angeles")).toEqual(["2026-10-21:morning"]);
    expect(slots("2026-10-21T15:59:00Z", "America/Los_Angeles")).toEqual(["2026-10-21:morning"]);
    expect(slots("2026-10-21T16:00:00Z", "America/Los_Angeles")).toEqual([]);
    expect(DEFAULT_CATCH_UP_MINUTES).toBe(60);
  });

  it("covers morning, afternoon and evening, each only when enabled", () => {
    const all = prefs({ email_afternoon_enabled: true });
    expect(slots("2026-10-21T13:10:00Z", "UTC", all)).toEqual(["2026-10-21:afternoon"]);
    expect(slots("2026-10-21T13:10:00Z", "UTC")).toEqual([]); // afternoon not chosen
    expect(slots("2026-10-21T20:30:00Z", "UTC", all)).toEqual(["2026-10-21:evening"]);
    expect(slots("2026-10-21T08:00:00Z", "UTC", prefs({ email_morning_enabled: false }))).toEqual([]);
    expect(slots("2026-10-21T20:45:00Z", "UTC", prefs({ email_evening_enabled: false }))).toEqual([]);
  });

  it("honours a custom catch-up window, clamped to a sane range", () => {
    const now = at("2026-10-21T08:20:00Z");
    expect(dueEmailCheckIns({ now, timezone: "UTC", prefs: prefs(), catchUpMinutes: 15 })).toEqual([]);
    expect(dueEmailCheckIns({ now, timezone: "UTC", prefs: prefs(), catchUpMinutes: 30 })).toHaveLength(1);
    expect(dueEmailCheckIns({ now: at("2026-10-21T08:00:00Z"), timezone: "UTC", prefs: prefs(), catchUpMinutes: 0 })).toHaveLength(1);
    expect(dueEmailCheckIns({ now: at("2026-10-21T12:30:00Z"), timezone: "UTC", prefs: prefs(), catchUpMinutes: 10_000 })).toEqual([]);
  });

  it("returns stable per-day dedupe keys and a reason for the draft", () => {
    const [due] = dueEmailCheckIns({ now: at("2026-10-21T08:05:00Z"), timezone: "UTC", prefs: prefs() });
    expect(due).toMatchObject({ slot: "morning", date: "2026-10-21", dedupeKey: "check_in:2026-10-21:morning" });
    expect(due.dedupeKey).toBe(emailCheckInDedupeKey("2026-10-21", "morning"));
    expect(due.reason).toMatch(/start the day/i);
  });
});

describe("dueEmailCheckIns: time zones", () => {
  it("uses each user's own local time and date", () => {
    // 2026-10-21T23:05Z is 08:05 on Oct 22 in Tokyo (UTC+9) and 16:05 on Oct 21 in Los Angeles.
    expect(slots("2026-10-21T23:05:00Z", "Asia/Tokyo")).toEqual(["2026-10-22:morning"]);
    expect(slots("2026-10-21T23:05:00Z", "America/Los_Angeles")).toEqual([]);
  });

  it("handles half-hour offsets", () => {
    // Asia/Kolkata is UTC+5:30: 08:00 local = 02:30Z.
    expect(slots("2026-10-21T02:29:00Z", "Asia/Kolkata")).toEqual([]);
    expect(slots("2026-10-21T02:30:00Z", "Asia/Kolkata")).toEqual(["2026-10-21:morning"]);
  });

  it("follows daylight-saving changes", () => {
    // New York: DST ends 2026-11-01 (EDT UTC-4 -> EST UTC-5), starts 2026-03-08.
    expect(slots("2026-10-31T12:00:00Z", "America/New_York")).toEqual(["2026-10-31:morning"]); // 08:00 EDT
    expect(slots("2026-11-01T12:00:00Z", "America/New_York")).toEqual([]); // 07:00 EST, quiet hours
    expect(slots("2026-11-01T13:00:00Z", "America/New_York")).toEqual(["2026-11-01:morning"]); // 08:00 EST
    expect(slots("2026-03-08T12:00:00Z", "America/New_York")).toEqual(["2026-03-08:morning"]); // 08:00 EDT
  });

  it("falls back to UTC for a missing or invalid timezone", () => {
    expect(slots("2026-10-21T08:05:00Z", "Not/AZone")).toEqual(["2026-10-21:morning"]);
    expect(dueEmailCheckIns({ now: at("2026-10-21T08:05:00Z"), timezone: null, prefs: prefs() })).toHaveLength(1);
  });

  it("dates a slot just before midnight to the day it belongs to", () => {
    const late = prefs({ email_evening_time: "23:50:00", quiet_hours_start: null, quiet_hours_end: null });
    expect(slots("2026-10-21T23:55:00Z", "UTC", late)).toEqual(["2026-10-21:evening"]);
    expect(slots("2026-10-22T00:20:00Z", "UTC", late)).toEqual(["2026-10-21:evening"]); // same key: no second send
  });
});

describe("dueEmailCheckIns: quiet hours and opt-outs", () => {
  it("sends nothing during quiet hours, including windows that wrap past midnight", () => {
    const lateEvening = prefs({ email_evening_time: "22:30:00" });
    expect(slots("2026-10-21T22:35:00Z", "UTC", lateEvening)).toEqual([]);
    const earlyMorning = prefs({ email_morning_time: "06:30:00" });
    expect(slots("2026-10-21T06:35:00Z", "UTC", earlyMorning)).toEqual([]);
    expect(slots("2026-10-21T06:35:00Z", "UTC", prefs({ email_morning_time: "06:30:00", quiet_hours_start: null, quiet_hours_end: null }))).toEqual([
      "2026-10-21:morning",
    ]);
    // Daytime quiet hours (e.g. a work block) are respected too.
    expect(slots("2026-10-21T13:05:00Z", "UTC", prefs({ email_afternoon_enabled: true, quiet_hours_start: "12:00", quiet_hours_end: "14:00" }))).toEqual([]);
  });

  it("sends nothing when email check-ins are off", () => {
    expect(slots("2026-10-21T08:05:00Z", "UTC", prefs({ email_enabled: false }))).toEqual([]);
  });

  it("sends nothing when no slot was chosen (the database default for every slot)", () => {
    const none = prefs({ email_morning_enabled: false, email_afternoon_enabled: false, email_evening_enabled: false });
    for (const t of ["2026-10-21T08:05:00Z", "2026-10-21T13:05:00Z", "2026-10-21T20:35:00Z"]) expect(slots(t, "UTC", none)).toEqual([]);
  });
});

describe("dueEmailCheckIns: a day of 15-minute scheduler runs", () => {
  it("produces each enabled slot exactly once per local day (dedupe keys collapse the catch-up repeats)", () => {
    const p = prefs({ email_afternoon_enabled: true });
    const keys = new Map<string, number>();
    for (let t = Date.parse("2026-10-21T00:00:00Z"); t < Date.parse("2026-10-23T00:00:00Z"); t += 15 * 60_000) {
      for (const due of dueEmailCheckIns({ now: new Date(t), timezone: "America/Chicago", prefs: p })) keys.set(due.dedupeKey, (keys.get(due.dedupeKey) ?? 0) + 1);
    }
    // The runs cover 19:00 Oct 20 to 19:00 Oct 22 in Chicago (UTC-5): every slot in that span, once.
    expect([...keys.keys()].sort()).toEqual([
      "check_in:2026-10-20:evening",
      "check_in:2026-10-21:afternoon",
      "check_in:2026-10-21:evening",
      "check_in:2026-10-21:morning",
      "check_in:2026-10-22:afternoon",
      "check_in:2026-10-22:morning",
    ]);
    // Each key is seen by the 4 runs inside its 60-minute catch-up window; the dedupe key makes only the first one send.
    for (const n of keys.values()) expect(n).toBe(4);
  });
});
