import { describe, expect, it } from "vitest";
import { buildChatMessages, HISTORY_WINDOW } from "./chat-messages";
import { renderContext } from "./context-format";
import type { AssistantContext } from "./context-types";

const ctx: AssistantContext = {
  now: { date: "2026-09-29", time: "17:45", weekday: "Tuesday", timezone: "America/Chicago" },
  user: { name: "Derek", accountabilityStyle: "direct" },
  schedule: {
    wake: "06:30",
    sleep: "23:00",
    work: { label: "Work", start: "08:00", end: "17:00", days: [1, 2, 3, 4, 5] },
    commitmentsToday: [{ title: "Kids pickup", start: "17:30", end: "18:00" }],
    otherCommitments: [],
    freeWindowsToday: [{ start: "18:00", end: "23:00" }],
    freeMinutesRemainingToday: 300,
  },
  goals: [
    { id: "g", title: "WGU", category: "school", type: "recurring", target: "5 hours per week", priority: "high", rank: 0, progress: "2/5 hours this week", pace: "behind", description: null, dueDate: null },
  ],
  today: { tasks: [{ title: "Gym", start: "18:30", durationMinutes: 60, status: "pending", isPriority: true, goal: null }], planAccepted: true, checkIns: [] },
  recent: { last7Days: { planned: 10, completed: 7, missed: 3 }, lastWeeklyReview: null },
  memories: ["Prefers studying before workouts"],
  otherConversationSummaries: [],
};

describe("assistant context", () => {
  it("renders the key facts the assistant needs", () => {
    const text = renderContext(ctx);
    expect(text).toContain("Name: Derek");
    expect(text).toContain("WGU");
    expect(text).toContain("2/5 hours this week (behind)");
    expect(text).toContain("Kids pickup 5:30 PM–6:00 PM");
    expect(text).toContain("Gym at 6:30 PM (60 min) — priority");
    expect(text).toContain("300 min total");
    expect(text).toContain("Prefers studying before workouts");
  });

  it("states unknowns explicitly", () => {
    const text = renderContext({ ...ctx, schedule: { ...ctx.schedule, wake: null, freeWindowsToday: null, freeMinutesRemainingToday: null } });
    expect(text).toContain("Free time today: unknown");
    expect(text).toContain("Wake: unknown");
  });

  it("bounds conversation history", () => {
    const history = Array.from({ length: 40 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `m${i}` }));
    const msgs = buildChatMessages({ context: ctx, style: "direct", channel: "app", conversationSummary: "Earlier: agreed to study at 7", history });
    const nonSystem = msgs.filter((m) => m.role !== "system");
    expect(nonSystem).toHaveLength(HISTORY_WINDOW);
    expect(nonSystem.at(-1)?.content).toBe("m39");
    expect(msgs.some((m) => m.content.includes("agreed to study at 7"))).toBe(true);
    expect(msgs[0].content).toContain("candid");
  });
});
