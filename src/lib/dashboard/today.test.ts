import { describe, expect, it } from "vitest";
import { attentionItems, pickFocus, pickNextUp } from "./today";

const task = (id: string, over: Partial<{ title: string; status: "pending" | "done" | "skipped"; scheduled_start: string | null; is_priority: boolean; sort_order: number }> = {}) => ({
  id,
  title: over.title ?? id,
  status: over.status ?? "pending",
  scheduled_start: over.scheduled_start ?? null,
  is_priority: over.is_priority ?? false,
  sort_order: over.sort_order ?? 0,
});
const at = (h: number, m = 0) => h * 60 + m;

describe("pickNextUp", () => {
  it("picks the earliest upcoming timed task", () => {
    const tasks = [task("late", { scheduled_start: "19:00" }), task("soon", { scheduled_start: "17:30" }), task("untimed", { is_priority: true })];
    expect(pickNextUp(tasks, at(17))?.id).toBe("soon");
  });

  it("allows a short grace period, then skips past tasks", () => {
    const tasks = [task("a", { scheduled_start: "16:45" }), task("b", { scheduled_start: "18:00" })];
    expect(pickNextUp(tasks, at(17))?.id).toBe("a");
    expect(pickNextUp(tasks, at(17, 30))?.id).toBe("b");
  });

  it("falls back to untimed priorities, then any pending task", () => {
    expect(pickNextUp([task("x", { sort_order: 0 }), task("p", { is_priority: true, sort_order: 1 })], at(9))?.id).toBe("p");
    expect(pickNextUp([task("x"), task("done", { status: "done" })], at(9))?.id).toBe("x");
    expect(pickNextUp([task("done", { status: "done" }), task("skip", { status: "skipped" })], at(9))).toBeNull();
  });
});

describe("pickFocus", () => {
  const goals = [
    { id: "g2", title: "Read", rank: 1 },
    { id: "g1", title: "Exercise", rank: 0 },
  ];
  const summaries = new Map([["g1", { label: "2/4 times this week" }]]);

  it("prefers the user's own morning intention", () => {
    expect(pickFocus({ intention: "Ship the report", tasks: [task("p", { is_priority: true })], goals, summaries })).toEqual({ kind: "intention", title: "Ship the report" });
  });

  it("then the first unfinished priority that isn't already next up", () => {
    const tasks = [
      task("done", { title: "A", is_priority: true, status: "done", sort_order: 0 }),
      task("open", { title: "B", is_priority: true, sort_order: 1 }),
      task("open2", { title: "C", is_priority: true, sort_order: 2 }),
    ];
    expect(pickFocus({ intention: "  ", tasks, goals, summaries })).toEqual({ kind: "priority", title: "B", done: false });
    expect(pickFocus({ intention: null, tasks, goals, summaries, exclude: "open" })).toEqual({ kind: "priority", title: "C", done: false });
    expect(pickFocus({ intention: null, tasks: tasks.slice(0, 2), goals, summaries, exclude: "open" })).toMatchObject({ kind: "goal", title: "Exercise" });
  });

  it("then the top-ranked goal", () => {
    expect(pickFocus({ intention: null, tasks: [], goals, summaries })).toEqual({ kind: "goal", title: "Exercise", goalId: "g1", progress: "2/4 times this week" });
    expect(pickFocus({ intention: null, tasks: [], goals: [], summaries })).toBeNull();
  });
});

describe("attentionItems", () => {
  it("lists confirmations first, then slipped tasks, then goals behind pace", () => {
    const items = attentionItems({
      assistantName: "Nova",
      pendingConfirmations: [{ id: "p1", summary: "Delete goal “Read”", conversationId: "c1" }],
      tasks: [task("t1", { title: "Gym", scheduled_start: "07:00" }), task("t2", { scheduled_start: "20:00" }), task("t3", { scheduled_start: "06:00", status: "done" })],
      nowMinutes: at(12),
      goals: [{ id: "g1", title: "Exercise" }, { id: "g2", title: "Read" }],
      summaries: new Map([
        ["g1", { pace: "behind" as const, label: "1/4 times" }],
        ["g2", { pace: "on_track" as const, label: "3/5 hours" }],
      ]),
    });
    expect(items.map((i) => i.key)).toEqual(["confirm:p1", "late:t1", "behind:g1"]);
    expect(items[0]).toMatchObject({ detail: "Nova is waiting for your OK", href: "/assistant?c=c1" });
  });

  it("is capped", () => {
    const tasks = Array.from({ length: 10 }, (_, i) => task(`t${i}`, { scheduled_start: "06:00" }));
    expect(attentionItems({ assistantName: "Nova", pendingConfirmations: [], tasks, nowMinutes: at(12), goals: [], summaries: new Map() })).toHaveLength(4);
  });
});
