import { describe, expect, it } from "vitest";
import type { NotificationPreferences } from "@/lib/types/domain";
import { detectKeyword } from "./keywords";
import { canReceiveSms, dueNotifications, inQuietHours } from "./scheduler";
import { computeTwilioSignature, isValidTwilioSignature } from "./twilio-signature";

const prefs: NotificationPreferences = {
  user_id: "u",
  sms_enabled: true,
  sms_consent_at: "2026-09-01T00:00:00Z",
  sms_consent_text: "ok",
  sms_opted_out_at: null,
  morning_checkin_enabled: true,
  morning_checkin_time: "08:00",
  evening_checkin_enabled: true,
  evening_checkin_time: "20:30",
  task_reminders_enabled: true,
  quiet_hours_start: "22:00",
  quiet_hours_end: "07:00",
  email_enabled: false,
  email_enabled_at: null,
  email_daily_limit: 6,
};
const profile = { timezone: "America/Chicago", display_name: "Derek", accountability_style: "balanced" as const };

describe("dueNotifications", () => {
  it("sends the morning check-in in the user's own timezone", () => {
    // 13:05 UTC = 08:05 in Chicago (CDT)
    const due = dueNotifications({ now: new Date("2026-09-29T13:05:00Z"), windowMinutes: 15, profile, prefs, todayTasks: [] });
    expect(due.map((d) => d.kind)).toEqual(["morning_checkin"]);
    expect(due[0].dedupeKey).toBe("morning:2026-09-29");
    expect(due[0].body).toContain("Derek");
  });

  it("reminds before a planned priority task", () => {
    const due = dueNotifications({
      now: new Date("2026-09-29T23:20:00Z"), // 18:20 local
      windowMinutes: 15,
      profile,
      prefs,
      todayTasks: [
        { id: "t1", title: "Gym", scheduled_start: "18:30", status: "pending", is_priority: true },
        { id: "t2", title: "Later", scheduled_start: "19:30", status: "pending", is_priority: true },
        { id: "t3", title: "Done", scheduled_start: "18:30", status: "done", is_priority: true },
      ],
    });
    expect(due).toHaveLength(1);
    expect(due[0].body).toBe('You planned "Gym" at 6:30 PM. Still happening?');
  });

  it("respects quiet hours and disabled toggles", () => {
    expect(inQuietHours(23 * 60, "22:00", "07:00")).toBe(true);
    expect(inQuietHours(12 * 60, "22:00", "07:00")).toBe(false);
    const due = dueNotifications({
      now: new Date("2026-09-29T13:05:00Z"),
      windowMinutes: 15,
      profile,
      prefs: { ...prefs, morning_checkin_enabled: false },
      todayTasks: [],
    });
    expect(due).toEqual([]);
  });

  it("requires phone + consent + no opt-out", () => {
    expect(canReceiveSms({ phone: "+15551234567" }, prefs)).toBe(true);
    expect(canReceiveSms({ phone: null }, prefs)).toBe(false);
    expect(canReceiveSms({ phone: "+15551234567" }, { ...prefs, sms_consent_at: null })).toBe(false);
    expect(canReceiveSms({ phone: "+15551234567" }, { ...prefs, sms_opted_out_at: "2026-09-02" })).toBe(false);
  });
});

describe("SMS keywords", () => {
  it("detects standard keywords", () => {
    expect(detectKeyword(" stop ")).toBe("stop");
    expect(detectKeyword("Unsubscribe")).toBe("stop");
    expect(detectKeyword("START")).toBe("start");
    expect(detectKeyword("help!")).toBe("help");
    expect(detectKeyword("stop reminding me about the gym")).toBeNull();
  });
});

describe("Twilio signature", () => {
  it("signs url + alphabetically sorted params (expected value computed independently with Python hmac)", () => {
    const url = "https://example.com/myapp.php?foo=1&bar=2";
    const params = { CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212" };
    expect(computeTwilioSignature("12345", url, params)).toBe("vNe7KK2kJwCsxc9K3OLkkKB3qqI=");
    expect(isValidTwilioSignature("12345", "vNe7KK2kJwCsxc9K3OLkkKB3qqI=", url, params)).toBe(true);
    expect(isValidTwilioSignature("12345", "bad", url, params)).toBe(false);
    expect(isValidTwilioSignature("12345", null, url, params)).toBe(false);
  });
});
