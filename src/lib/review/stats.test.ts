import { describe, expect, it } from "vitest";
import type { Goal } from "@/lib/types/domain";
import { computeWeeklyStats, ruleBasedSummary } from "./stats";

const baseGoal = {
  user_id: "u",
  description: null,
  goal_type: "recurring",
  target_unit: "times",
  due_date: null,
  priority: "medium",
  rank: 0,
  status: "active",
  completed_at: null,
  created_at: "",
  updated_at: "",
} as const;

const goals: Goal[] = [
  { ...baseGoal, id: "fit", title: "Fitness", category: "fitness", target_value: 4, period: "week" },
  { ...baseGoal, id: "read", title: "Read", category: "reading", target_value: 20, target_unit: "minutes", period: "day" },
];

describe("computeWeeklyStats", () => {
  const stats = computeWeeklyStats({
    weekStart: "2026-09-28",
    today: "2026-10-01", // Thursday
    goals,
    checkInCount: 2,
    tasks: [
      { goal_id: "fit", task_date: "2026-09-28", status: "done", is_priority: true, scheduled_start: "07:00" },
      { goal_id: "fit", task_date: "2026-09-29", status: "pending", is_priority: true, scheduled_start: "19:00" },
      { goal_id: null, task_date: "2026-09-30", status: "skipped", is_priority: false, scheduled_start: null },
      { goal_id: "read", task_date: "2026-10-01", status: "pending", is_priority: false, scheduled_start: "21:00" },
      { goal_id: null, task_date: "2026-10-05", status: "pending", is_priority: false, scheduled_start: null }, // next week
    ],
    progress: [
      { goal_id: "fit", amount: 1, logged_for: "2026-09-28" },
      { goal_id: "fit", amount: 1, logged_for: "2026-09-30" },
      { goal_id: "read", amount: 25, logged_for: "2026-09-28" },
      { goal_id: "read", amount: 10, logged_for: "2026-09-29" },
      { goal_id: "read", amount: 20, logged_for: "2026-09-30" },
    ],
  });

  it("counts task outcomes without treating today/future as missed", () => {
    expect(stats.tasks).toEqual({ planned: 4, completed: 1, skipped: 1, missed: 1, open: 1 });
    expect(stats.priorities).toEqual({ planned: 2, completed: 1 });
    expect(stats.daysElapsed).toBe(4);
  });

  it("computes goal consistency from real entries", () => {
    const fit = stats.goals.find((g) => g.goalId === "fit")!;
    expect(fit.amount).toBe(2);
    expect(fit.consistency).toBe(0.5);
    const read = stats.goals.find((g) => g.goalId === "read")!;
    expect(read.activeDays).toBe(3);
    expect(read.consistency).toBe(0.5); // 2 of 4 days hit 20 minutes
  });

  it("buckets by time of day only for resolved tasks", () => {
    expect(stats.timeOfDay.morning).toEqual({ planned: 1, completed: 1 });
    expect(stats.timeOfDay.evening).toEqual({ planned: 1, completed: 0 }); // today's 21:00 not counted
  });

  it("produces a factual summary", () => {
    const text = ruleBasedSummary(stats);
    expect(text).toContain("You completed 1 of 4 planned tasks");
  });

  it("reports empty weeks honestly", () => {
    const empty = computeWeeklyStats({ weekStart: "2026-09-28", today: "2026-10-01", goals: [], tasks: [], progress: [], checkInCount: 0 });
    expect(empty.hasData).toBe(false);
    expect(ruleBasedSummary(empty)).toMatch(/no activity/i);
  });
});
