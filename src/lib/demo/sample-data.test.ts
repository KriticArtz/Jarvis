import { describe, expect, it } from "vitest";
import { summarizeGoalProgress } from "@/lib/progress";
import { busyBlocks } from "@/lib/planning/availability";
import { timeToMinutes } from "@/lib/time";
import type { Goal } from "@/lib/types/domain";
import { buildDemoData, DEMO_COMMITMENTS, DEMO_GOALS, DEMO_PROFILE } from "./sample-data";

const today = "2026-10-01"; // Thursday

function asGoals(): Goal[] {
  return DEMO_GOALS.map((g) => ({
    ...g,
    id: g.key,
    user_id: "demo",
    due_date: null,
    status: "active",
    completed_at: null,
    created_at: "",
    updated_at: "",
  }));
}

describe("demo sample data", () => {
  const data = buildDemoData(today);

  it("only has history up to today and a plan for today", () => {
    expect(data.progress.every((p) => p.logged_for <= today)).toBe(true);
    expect(data.tasks.filter((t) => t.task_date > today)).toEqual([]);
    expect(data.tasks.filter((t) => t.task_date === today).length).toBe(4);
  });

  it("shows partial, believable progress this week", () => {
    const summaries = asGoals().map((g) =>
      summarizeGoalProgress(
        g,
        data.progress.map((p) => ({ goal_id: p.goal, amount: p.amount, logged_for: p.logged_for })),
        today,
      ),
    );
    const exercise = summaries.find((s) => s.goalId === "exercise")!;
    expect(exercise.current).toBeGreaterThan(0);
    expect(exercise.current).toBeLessThan(4);
    expect(summaries.find((s) => s.goalId === "savings")!.current).toBe(520);
  });

  it("marks today's already-past items as done", () => {
    const evening = buildDemoData("2026-09-28", 20 * 60 + 30); // Monday 8:30 PM
    const todays = evening.tasks.filter((t) => t.task_date === "2026-09-28");
    expect(todays.every((t) => t.status === "done")).toBe(true);
    expect(evening.progress.filter((p) => p.logged_for === "2026-09-28" && p.goal === "exercise")).toHaveLength(1);
    const morning = buildDemoData("2026-09-28", 6 * 60);
    expect(morning.tasks.filter((t) => t.task_date === "2026-09-28" && t.status === "done")).toHaveLength(0);
  });

  it("never schedules today's tasks over work or commitments", () => {
    const busy = busyBlocks(today, DEMO_PROFILE, DEMO_COMMITMENTS, []);
    for (const t of data.tasks.filter((x) => x.task_date === today && x.scheduled_start)) {
      const s = timeToMinutes(t.scheduled_start!);
      const e = s + t.duration_minutes;
      const clash = busy.find((b) => s < b.end && e > b.start && b.label !== "Work");
      expect(clash, `${t.title} clashes with ${clash?.label}`).toBeUndefined();
    }
  });
});
