import { describe, expect, it } from "vitest";
import { parseInline, parseReply } from "./format";
import { buildOpening } from "./opening";
import type { AssistantContext } from "@/lib/ai/context-types";

describe("parseReply (safe formatting)", () => {
  it("splits paragraphs and keeps single line breaks inside a paragraph", () => {
    expect(parseReply("First line\nsecond line\n\nNew paragraph")).toEqual([
      { kind: "p", lines: [[{ text: "First line" }], [{ text: "second line" }]] },
      { kind: "p", lines: [[{ text: "New paragraph" }]] },
    ]);
  });

  it("recognizes bulleted and numbered lists, with continuation lines", () => {
    const blocks = parseReply("Here's the plan:\n- Proposal at 9\n- Gym at 6\n  (bring shoes)\n\n1. First\n2) Second");
    expect(blocks.map((b) => b.kind)).toEqual(["p", "ul", "ol"]);
    expect(blocks[1]).toEqual({ kind: "ul", items: [[{ text: "Proposal at 9" }], [{ text: "Gym at 6 (bring shoes)" }]] });
    expect(blocks[2]).toEqual({ kind: "ol", items: [[{ text: "First" }], [{ text: "Second" }]] });
  });

  it("supports **bold** and never interprets HTML", () => {
    expect(parseInline("Start with **the proposal** now")).toEqual([{ text: "Start with " }, { text: "the proposal", strong: true }, { text: " now" }]);
    expect(parseInline("a ** b")).toEqual([{ text: "a ** b" }]);
    const html = parseReply("<img src=x onerror=alert(1)>");
    expect(html).toEqual([{ kind: "p", lines: [[{ text: "<img src=x onerror=alert(1)>" }]] }]);
  });

  it("handles streaming partials and empty text", () => {
    expect(parseReply("")).toEqual([]);
    expect(parseReply("- half a li")).toEqual([{ kind: "ul", items: [[{ text: "half a li" }]] }]);
  });
});

type Ctx = Parameters<typeof buildOpening>[0];
const base = (p: Partial<{ time: string; tasks: AssistantContext["today"]["tasks"]; windows: { start: string; end: string }[] | null; goals: Partial<AssistantContext["goals"][number]>[]; events: object[]; writable: boolean }> = {}): Ctx => ({
  now: { date: "2026-10-08", time: p.time ?? "10:00", weekday: "Thursday", timezone: "UTC" },
  today: { tasks: p.tasks ?? [], planAccepted: false, checkIns: [] },
  schedule: { wake: "07:00", sleep: "23:00", work: null, commitmentsToday: [], otherCommitments: [], freeWindowsToday: p.windows ?? null, freeMinutesRemainingToday: null },
  goals: (p.goals ?? []) as AssistantContext["goals"],
  calendar: p.events ? ({ provider: "Google Calendar", lastSyncedAt: null, writable: p.writable ?? false, days: [{ date: "2026-10-08", events: p.events }] } as AssistantContext["calendar"]) : null,
});
const task = (title: string, extra: object = {}) => ({ title, start: null, durationMinutes: null, status: "pending", isPriority: false, goal: null, ...extra });

describe("buildOpening", () => {
  it("states the day from real data and suggests what fits", () => {
    const o = buildOpening(
      base({
        tasks: [task("Proposal", { start: "11:00" }), task("Gym", { start: "18:00" }), task("Call Mom")],
        windows: [{ start: "13:00", end: "14:30" }],
        goals: [{ title: "Run", pace: "on_track" }],
      }),
    );
    expect(o.line).toBe("You have three things planned today and a free 90-minute window this afternoon.");
    expect(o.suggestions).toEqual(["What should I do right now?", "Help me plan the rest of today", "Move a task to tomorrow"]);
  });

  it("only offers calendar moves when there are events it can change", () => {
    const events = [{ title: "Client call", start: "15:00", end: "16:00", allDay: false, busy: true, tentative: false, location: null }];
    expect(buildOpening(base({ events, writable: true, goals: [{ title: "x", pace: "on_track" }] })).suggestions).toContain("Move something on my calendar");
    expect(buildOpening(base({ events, writable: false, goals: [{ title: "x", pace: "on_track" }] })).suggestions).not.toContain("Move something on my calendar");
  });

  it("notices slipping and overload without inventing context", () => {
    const tasks = [task("A", { start: "08:00" }), task("B"), task("C"), task("D"), task("E")];
    const o = buildOpening(base({ tasks, goals: [{ title: "Read", pace: "behind" }] }));
    expect(o.line).toBe("You have five things left today.");
    expect(o.suggestions).toEqual(["What should I do right now?", "Help me plan the rest of today", "I'm falling behind", "I'm overwhelmed"]);
  });

  it("says nothing it can't support for a brand-new user", () => {
    const o = buildOpening(base());
    expect(o.line).toBeNull();
    expect(o.suggestions).toEqual(["Help me plan today", "Help me set a goal"]);
  });

  it("acknowledges a finished day", () => {
    const o = buildOpening(base({ time: "20:00", tasks: [task("A", { status: "done" })], goals: [{ title: "x", pace: "on_track" }] }));
    expect(o.line).toBe("Everything on today's plan is done.");
    expect(o.suggestions[0]).toBe("What went well today?");
  });
});
