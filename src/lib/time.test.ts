import { describe, expect, it } from "vitest";
import {
  addDays,
  dayPart,
  formatTime12,
  isoWeekday,
  isValidTimeZone,
  localDate,
  localMinutesNow,
  monthEnd,
  weekStart,
  zonedTimeToUtc,
} from "./time";

describe("time utilities", () => {
  it("computes the local date per timezone", () => {
    const instant = new Date("2026-09-29T03:30:00Z");
    expect(localDate("UTC", instant)).toBe("2026-09-29");
    expect(localDate("America/Los_Angeles", instant)).toBe("2026-09-28");
    expect(localDate("Asia/Tokyo", instant)).toBe("2026-09-29");
  });

  it("computes local minutes", () => {
    expect(localMinutesNow("America/New_York", new Date("2026-09-29T13:15:00Z"))).toBe(9 * 60 + 15);
  });

  it("does calendar math", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(isoWeekday("2026-09-28")).toBe(1); // Monday
    expect(isoWeekday("2026-10-04")).toBe(7); // Sunday
    expect(weekStart("2026-10-04")).toBe("2026-09-28");
    expect(monthEnd("2028-02-10")).toBe("2028-02-29");
  });

  it("converts zoned wall time to UTC across DST", () => {
    expect(zonedTimeToUtc("2026-07-01", "08:00", "America/New_York").toISOString()).toBe("2026-07-01T12:00:00.000Z");
    expect(zonedTimeToUtc("2026-12-01", "08:00", "America/New_York").toISOString()).toBe("2026-12-01T13:00:00.000Z");
  });

  it("formats and validates", () => {
    expect(formatTime12("18:30")).toBe("6:30 PM");
    expect(formatTime12("00:05:00")).toBe("12:05 AM");
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
    expect(dayPart("UTC", new Date("2026-09-29T19:00:00Z"))).toBe("evening");
  });
});
