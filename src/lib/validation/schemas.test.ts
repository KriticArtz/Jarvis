import { describe, expect, it } from "vitest";
import { goalSchema, normalizePhone, scheduleSchema } from "./schemas";
import { safeNextPath } from "@/lib/routes";

describe("validation", () => {
  it("normalizes phone numbers to E.164", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhone("12345")).toBeNull();
  });

  it("requires a period for recurring goals", () => {
    const r = goalSchema.safeParse({ title: "Gym", category: "fitness", goal_type: "recurring", period: "" });
    expect(r.success).toBe(false);
  });

  it("clears irrelevant fields and defaults units", () => {
    const r = goalSchema.parse({
      title: "Save",
      category: "Money",
      goal_type: "one_time",
      period: "week",
      target_value: "300",
      target_unit: "",
      due_date: "2026-12-01",
    });
    expect(r.period).toBeNull();
    expect(r.target_value).toBe(300);
    expect(r.target_unit).toBe("times");
    expect(r.category).toBe("money");
  });

  it("allows skipping schedule fields", () => {
    const r = scheduleSchema.parse({ wake_time: "", sleep_time: "23:00", work_start: "", work_end: "" });
    expect(r.wake_time).toBeNull();
    expect(r.sleep_time).toBe("23:00");
    expect(r.work_label).toBe("Work");
  });

  it("rejects open redirects", () => {
    expect(safeNextPath("/goals")).toBe("/goals");
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
  });
});
