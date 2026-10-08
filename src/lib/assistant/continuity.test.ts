import { describe, expect, it } from "vitest";
import { activeConversationToday, assistantHref, isActiveToday } from "./active";
import { testBaseURL } from "@/lib/env";
import { assistantSystemPrompt } from "@/lib/ai/prompts";
import { renderContext } from "@/lib/ai/context-format";
import type { AssistantContext } from "@/lib/ai/context-types";
import { buildChatMessages } from "@/lib/ai/chat-messages";

describe("today's active conversation", () => {
  const now = new Date("2026-10-08T15:00:00Z");
  it("is the latest in-app conversation if it was updated today in the user's time zone", () => {
    expect(isActiveToday("2026-10-08T01:00:00Z", "UTC", now)).toBe(true);
    expect(isActiveToday("2026-10-07T23:59:00Z", "UTC", now)).toBe(false);
    // 2026-10-08T01:00Z is still Oct 7 in Chicago, while "now" is Oct 8 there.
    expect(isActiveToday("2026-10-08T01:00:00Z", "America/Chicago", now)).toBe(false);
    expect(isActiveToday("2026-10-08T06:00:00Z", "America/Chicago", now)).toBe(true);
  });

  it("only considers app conversations, most recent first", async () => {
    const calls: unknown[][] = [];
    const fakeDb = (row: { id: string; updated_at: string }) => {
      const chain = {
        select: (...a: unknown[]) => (calls.push(["select", ...a]), chain),
        eq: (...a: unknown[]) => (calls.push(["eq", ...a]), chain),
        order: (...a: unknown[]) => (calls.push(["order", ...a]), chain),
        limit: (...a: unknown[]) => (calls.push(["limit", ...a]), chain),
        maybeSingle: async () => ({ data: row }),
      };
      return { from: () => chain } as never;
    };
    expect(await activeConversationToday(fakeDb({ id: "c1", updated_at: "2026-10-08T14:00:00Z" }), "u1", "UTC", now)).toEqual({ id: "c1" });
    expect(calls).toContainEqual(["eq", "channel", "app"]);
    expect(calls).toContainEqual(["eq", "user_id", "u1"]);
    expect(calls).toContainEqual(["order", "updated_at", { ascending: false }]);
    expect(await activeConversationToday(fakeDb({ id: "c0", updated_at: "2026-10-07T14:00:00Z" }), "u1", "UTC", now)).toBeNull();
  });

  it("builds Assistant links: resume by default, fresh only when asked", () => {
    expect(assistantHref()).toBe("/assistant");
    expect(assistantHref({ fresh: true })).toBe("/assistant?new=1");
    expect(assistantHref({ prompt: 'Move "Gym" to later today', taskId: "t1" })).toBe("/assistant?q=Move+%22Gym%22+to+later+today&task=t1");
  });
});

describe("test-only OPENAI_BASE_URL", () => {
  it("is honoured only for a local mock, never on production", () => {
    expect(testBaseURL("http://127.0.0.1:4010/v1", undefined)).toBe("http://127.0.0.1:4010/v1");
    expect(testBaseURL("http://localhost:4010/v1/", "preview")).toBe("http://localhost:4010/v1");
    expect(testBaseURL("http://127.0.0.1:4010/v1", "production")).toBeNull();
    expect(testBaseURL("https://evil.example.com/v1", undefined)).toBeNull();
    expect(testBaseURL("https://127.0.0.1.evil.example/v1", undefined)).toBeNull();
    expect(testBaseURL("not a url", undefined)).toBeNull();
    expect(testBaseURL(undefined, undefined)).toBeNull();
  });
});

const ctx: AssistantContext = {
  now: { date: "2026-10-08", time: "14:05", weekday: "Thursday", timezone: "UTC" },
  user: { name: "Sam" },
  assistant: { name: "Jarvis", personality: "direct" },
  schedule: { wake: "07:00", sleep: "23:00", work: null, commitmentsToday: [], otherCommitments: [], freeWindowsToday: [{ start: "14:05", end: "23:00" }], freeMinutesRemainingToday: 535 },
  goals: [],
  today: { tasks: [], planAccepted: false, checkIns: [] },
  recent: { last7Days: { planned: 0, completed: 0, missed: 0 }, lastWeeklyReview: null },
  memories: [],
  otherConversationSummaries: [],
};

describe("app-only continuity and guidance", () => {
  it("adds the app guidance to the in-app prompt only", () => {
    const app = assistantSystemPrompt(ctx.assistant, "app", { tools: true });
    expect(app).toContain("In the app — how to be useful right now");
    expect(app).toContain("Lead with one concrete next step");
    expect(app).toContain("Formatting: plain text with short paragraphs");
    for (const channel of ["sms", "email"] as const) expect(assistantSystemPrompt(ctx.assistant, channel, { tools: true })).not.toContain("In the app — how to be useful right now");
  });

  it("lists today's changes compactly, and only when present", () => {
    expect(renderContext(ctx)).not.toContain("Changes made today");
    const text = renderContext({
      ...ctx,
      changesToday: [
        { time: "10:42", summary: "Moved “Workout” to tomorrow at 5:30 PM.", status: "done" },
        { time: "09:15", summary: "Move “Client call”", status: "declined" },
      ],
    });
    expect(text).toContain("## Changes made today");
    expect(text).toContain("- 10:42 AM: Moved “Workout” to tomorrow at 5:30 PM.");
    expect(text).toContain("- 9:15 AM: Move “Client call” (the user said no — nothing changed)");
  });

  it("stays bounded for a heavy user (relevant context, not everything)", () => {
    const heavy: AssistantContext = {
      ...ctx,
      goals: Array.from({ length: 12 }, (_, i) => ({ id: `g${i}`, title: `Goal ${i}`, category: "x", type: "recurring" as const, target: "3 times per week", priority: "medium", rank: i, progress: "1/3", pace: "on_track", description: null, dueDate: null })),
      today: { tasks: Array.from({ length: 15 }, (_, i) => ({ id: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`, title: `Task ${i}`, start: null, durationMinutes: 30, status: "pending", isPriority: false, goal: null })), planAccepted: false, checkIns: [] },
      memories: Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, content: `Preference number ${i} about how they like to work` })),
      otherConversationSummaries: Array.from({ length: 3 }, () => "s".repeat(400)),
      changesToday: Array.from({ length: 6 }, () => ({ time: "10:00", summary: "c".repeat(160), status: "done" as const })),
    };
    const messages = buildChatMessages({ context: heavy, channel: "app", conversationSummary: "x".repeat(1500), history: Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), content: "m".repeat(900) })), tools: true });
    const total = messages.reduce((n, m) => n + m.content.length, 0);
    expect(messages.filter((m) => m.role !== "system").length).toBeLessThanOrEqual(12);
    expect(total).toBeLessThan(30_000);
  });
});
