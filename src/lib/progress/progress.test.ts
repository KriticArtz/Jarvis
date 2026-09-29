import { describe, expect, it } from "vitest";
import type { Goal } from "@/lib/types/domain";
import { autoProgressAmount, describeTarget, periodWindow, summarizeGoalProgress } from ".";

const goal = (overrides: Partial<Goal> = {}): Goal => ({
  id: "g1",
  user_id: "u1",
  title: "Work out",
  description: null,
  category: "fitness",
  goal_type: "recurring",
  target_value: 4,
  target_unit: "times",
  period: "week",
  due_date: null,
  priority: "high",
  rank: 0,
  status: "active",
  completed_at: null,
  created_at: "",
  updated_at: "",
  ...overrides,
});

describe("goal progress", () => {
  it("computes period windows", () => {
    expect(periodWindow("week", "2026-10-01")).toEqual({ start: "2026-09-28", end: "2026-10-04" });
    expect(periodWindow("month", "2026-10-15")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
  });

  it("sums only entries in the current period for recurring goals", () => {
    const s = summarizeGoalProgress(
      goal(),
      [
        { goal_id: "g1", amount: 1, logged_for: "2026-09-27" }, // previous week
        { goal_id: "g1", amount: 1, logged_for: "2026-09-28" },
        { goal_id: "g1", amount: 1, logged_for: "2026-09-30" },
        { goal_id: "other", amount: 5, logged_for: "2026-09-30" },
      ],
      "2026-10-01",
    );
    expect(s.current).toBe(2);
    expect(s.label).toBe("2/4 times this week");
    expect(s.ratio).toBe(0.5);
    expect(s.pace).toBe("on_track"); // 3 full days elapsed -> expected ~1.7
  });

  it("marks behind pace late in the period", () => {
    const s = summarizeGoalProgress(goal(), [{ goal_id: "g1", amount: 1, logged_for: "2026-09-28" }], "2026-10-03");
    expect(s.pace).toBe("behind");
  });

  it("handles one-time goals and completion", () => {
    const g = goal({ goal_type: "one_time", period: null, target_value: 300, target_unit: "dollars" });
    const s = summarizeGoalProgress(g, [{ goal_id: "g1", amount: 120, logged_for: "2026-01-01" }], "2026-10-01");
    expect(s.label).toBe("120/$300");
    expect(summarizeGoalProgress({ ...g, status: "completed" }, [], "2026-10-01").pace).toBe("done");
  });

  it("derives auto-logged amounts from tasks", () => {
    expect(autoProgressAmount({ target_unit: "minutes" }, 45)).toBe(45);
    expect(autoProgressAmount({ target_unit: "hours" }, 90)).toBe(1.5);
    expect(autoProgressAmount({ target_unit: "times" }, 30)).toBe(1);
    expect(autoProgressAmount({ target_unit: "dollars" }, 30)).toBeNull();
  });

  it("describes targets", () => {
    expect(describeTarget(goal())).toBe("4 times per week");
    expect(describeTarget(goal({ target_value: 30, target_unit: "minutes", period: "day" }))).toBe("30 minutes per day");
  });
});
