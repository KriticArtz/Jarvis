import { describe, expect, it } from "vitest";
import type { Goal, PlanItem } from "@/lib/types/domain";
import { summarizeGoalProgress } from "@/lib/progress";
import { busyBlocks, dayBounds, freeWindows } from "./availability";
import { rulePlan } from "./rule-planner";
import { validatePlan } from "./validate";

const profile = {
  wake_time: "07:00",
  sleep_time: "23:00",
  work_start: "09:00",
  work_end: "17:00",
  work_days: [1, 2, 3, 4, 5],
  work_label: "Work",
};

const item = (o: Partial<PlanItem>): PlanItem => ({
  task_id: null,
  title: "Study",
  goal_id: null,
  start_time: null,
  duration_minutes: 30,
  is_priority: false,
  rationale: null,
  ...o,
});

describe("availability", () => {
  it("blocks work on weekdays only", () => {
    expect(busyBlocks("2026-09-28", profile, [], [])).toHaveLength(1); // Monday
    expect(busyBlocks("2026-10-03", profile, [], [])).toHaveLength(0); // Saturday
  });

  it("computes free windows around commitments and timed tasks", () => {
    const busy = busyBlocks(
      "2026-09-28",
      profile,
      [{ title: "Class", days_of_week: [1], start_time: "18:00", end_time: "19:30" }],
      [{ title: "Gym", scheduled_start: "20:00", duration_minutes: 60, status: "pending" }],
    );
    const bounds = dayBounds(profile, null, null)!;
    const windows = freeWindows(bounds.start, bounds.end, busy);
    expect(windows.map((w) => [w.start, w.end])).toEqual([
      [7 * 60, 9 * 60],
      [17 * 60, 18 * 60],
      [19 * 60 + 30, 20 * 60],
      [21 * 60, 23 * 60],
    ]);
  });

  it("returns null bounds when waking hours are unknown", () => {
    expect(dayBounds({ wake_time: null, sleep_time: null }, null, null)).toBeNull();
    expect(dayBounds({ wake_time: null, sleep_time: null }, { start: "18:00", end: "21:00" }, null)).toEqual({
      start: 18 * 60,
      end: 21 * 60,
      source: "user_input",
    });
  });

  it("never plans in the past and handles after-midnight bedtimes", () => {
    const b = dayBounds({ wake_time: "07:00", sleep_time: "00:30" }, null, 14 * 60 + 7)!;
    expect(b.start).toBe(14 * 60 + 15);
    expect(b.end).toBe(24 * 60 - 1);
  });
});

describe("validatePlan", () => {
  const windows = [
    { start: 17 * 60, end: 18 * 60, label: "free" },
    { start: 19 * 60, end: 21 * 60, label: "free" },
  ];

  it("drops items that overlap commitments or each other", () => {
    const result = validatePlan(
      [
        item({ title: "OK", start_time: "17:00", duration_minutes: 45 }),
        item({ title: "Over class", start_time: "17:30", duration_minutes: 60 }),
        item({ title: "Overlap", start_time: "17:30", duration_minutes: 20 }),
        item({ title: "Evening", start_time: "19:15", duration_minutes: 60 }),
        item({ title: "Flexible", duration_minutes: 20 }),
      ],
      windows,
      new Set(),
    );
    expect(result.items.map((i) => i.title)).toEqual(["OK", "Evening", "Flexible"]);
    expect(result.warnings).toHaveLength(2);
  });

  it("strips goal and task ids the user doesn't own", () => {
    const result = validatePlan([item({ goal_id: "foreign", task_id: "foreign" })], windows, new Set(["mine"]), new Set());
    expect(result.items[0].goal_id).toBeNull();
    expect(result.items[0].task_id).toBeNull();
  });

  it("refuses plans larger than the available time", () => {
    const result = validatePlan([item({ duration_minutes: 170 }), item({ title: "More", duration_minutes: 30 })], windows, new Set());
    expect(result.items).toHaveLength(1);
  });
});

describe("rulePlan", () => {
  const goals: Goal[] = [
    { id: "a", title: "Business", rank: 1, priority: "medium" },
    { id: "b", title: "Study", rank: 0, priority: "high", target_unit: "minutes", target_value: 300 },
  ].map((g) => ({
    user_id: "u",
    description: null,
    category: "x",
    goal_type: "recurring",
    target_value: 5,
    target_unit: "times",
    period: "week",
    due_date: null,
    status: "active",
    completed_at: null,
    created_at: "",
    updated_at: "",
    ...g,
  })) as Goal[];

  it("schedules ranked goals into free windows without exceeding 70%", () => {
    const summaries = new Map(goals.map((g) => [g.id, summarizeGoalProgress(g, [], "2026-09-28")]));
    const windows = [{ start: 18 * 60, end: 21 * 60, label: "free" }];
    const plan = rulePlan(goals, summaries, [], windows);
    expect(plan[0].title).toBe("Study");
    expect(plan.reduce((s, i) => s + i.duration_minutes, 0)).toBeLessThanOrEqual(126);
    const validated = validatePlan(plan, windows, new Set(["a", "b"]));
    expect(validated.warnings).toEqual([]);
  });
});
