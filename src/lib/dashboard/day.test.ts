import { describe, expect, it } from "vitest";
import { buildTimeline, interpretDay, recommendations, sleepSignal, windowPhrase, type DayEvent, type DayTask } from "./day";

const task = (p: Partial<DayTask> & { id: string; title: string }): DayTask => ({
  start: null,
  durationMinutes: null,
  status: "pending",
  isPriority: false,
  goalTitle: null,
  sortOrder: 0,
  ...p,
});
const event = (p: Partial<DayEvent> & { title: string }): DayEvent => ({ start: null, end: null, allDay: false, busy: true, tentative: false, location: null, ...p });
const at = (h: number, m = 0) => h * 60 + m;
const base = { assistantName: "Jarvis", intention: null, pendingConfirmations: [], goals: [], summaries: new Map() };

describe("buildTimeline", () => {
  const tasks = [
    task({ id: "a", title: "Deep work", start: "09:00", durationMinutes: 90, isPriority: true }),
    task({ id: "b", title: "Run", start: "18:00", durationMinutes: 40 }),
    task({ id: "c", title: "Call the bank", isPriority: true, sortOrder: 2 }),
    task({ id: "d", title: "Laundry", sortOrder: 1 }),
  ];
  const events = [event({ id: "e1", title: "Team sync", start: "10:30", end: "11:00" }), event({ title: "Holiday", allDay: true })];

  it("merges events and timed tasks into one chronological line", () => {
    const tl = buildTimeline({ tasks, events, nowMinutes: at(8) });
    expect(tl.entries.map((e) => e.title)).toEqual(["Deep work", "Team sync", "Run"]);
    expect(tl.allDay.map((e) => e.title)).toEqual(["Holiday"]);
    expect(tl.later.map((t) => t.title)).toEqual(["Call the bank", "Laundry"]); // priorities first
  });

  it("marks past, current and upcoming, and places the now marker", () => {
    const tl = buildTimeline({ tasks, events, nowMinutes: at(10, 45) });
    expect(tl.entries.map((e) => e.phase)).toEqual(["past", "now", "upcoming"]);
    expect(tl.nowIndex).toBe(2);
    expect(buildTimeline({ tasks, events, nowMinutes: at(23) }).nowIndex).toBe(3);
  });
});

describe("interpretDay", () => {
  it("is calm and general when nothing is planned", () => {
    const tl = buildTimeline({ tasks: [], events: [], nowMinutes: at(8) });
    expect(interpretDay({ timeline: tl, nowMinutes: at(8), dayPart: "morning", sleep: null })).toBe("Nothing planned yet. Let's shape the day.");
  });

  it("notices an open morning", () => {
    const tl = buildTimeline({ tasks: [task({ id: "a", title: "Lunch", start: "12:30" })], events: [], nowMinutes: at(8) });
    expect(interpretDay({ timeline: tl, nowMinutes: at(8), dayPart: "morning", sleep: null })).toBe("Your morning is open until 12:30 PM. Let's use it well.");
  });

  it("counts what matters and calls a full day busy", () => {
    const tasks = [
      task({ id: "a", title: "A", start: "09:00", isPriority: true }),
      task({ id: "b", title: "B", start: "11:00", isPriority: true }),
      task({ id: "c", title: "C", isPriority: true }),
      task({ id: "d", title: "D" }),
      task({ id: "e", title: "E" }),
    ];
    const tl = buildTimeline({ tasks, events: [], nowMinutes: at(8, 30) });
    expect(interpretDay({ timeline: tl, nowMinutes: at(8, 30), dayPart: "morning", sleep: null })).toBe("Busy day. Three things matter.");
  });

  it("says when everything is done, and leads with short sleep when there is a signal", () => {
    const tl = buildTimeline({ tasks: [task({ id: "a", title: "A", status: "done" })], events: [], nowMinutes: at(15) });
    expect(interpretDay({ timeline: tl, nowMinutes: at(15), dayPart: "afternoon", sleep: null })).toBe("Everything you planned is done.");
    expect(interpretDay({ timeline: tl, nowMinutes: at(15), dayPart: "afternoon", sleep: "short" })).toMatch(/^Sleep was shorter than usual/);
  });
});

describe("sleepSignal", () => {
  const nights = (last: number | null) => [
    { date: "2026-10-04", sleepHours: 7.5 },
    { date: "2026-10-05", sleepHours: 7.8 },
    { date: "2026-10-06", sleepHours: 7.2 },
    { date: "2026-10-07", sleepHours: last },
  ];
  it("only flags clearly short sleep against the user's own baseline", () => {
    expect(sleepSignal(nights(5.5), "2026-10-07")).toBe("short");
    expect(sleepSignal(nights(7.1), "2026-10-07")).toBeNull();
    expect(sleepSignal(nights(null), "2026-10-07")).toBeNull();
    expect(sleepSignal(nights(5).slice(2), "2026-10-07")).toBeNull(); // not enough history
  });
});

describe("recommendations", () => {
  it("starts with a pending confirmation, then what's happening now", () => {
    const tl = buildTimeline({ tasks: [task({ id: "a", title: "Deep work", start: "09:00", durationMinutes: 90 })], events: [], nowMinutes: at(9, 30) });
    const recs = recommendations({ ...base, timeline: tl, nowMinutes: at(9, 30), pendingConfirmations: [{ id: "p1", summary: "Move Run to tomorrow", conversationId: "c1" }] });
    expect(recs[0]).toMatchObject({ kind: "confirm", title: "Move Run to tomorrow", href: "/assistant?c=c1" });
    expect(recs[1]).toMatchObject({ kind: "task", eyebrow: "Right now", taskId: "a" });
    expect(recs[1].reason).toBe("It's planned for now, until 10:30 AM.");
  });

  it("recommends a priority with the real window before the next commitment", () => {
    const tl = buildTimeline({
      tasks: [task({ id: "p", title: "Finish the proposal", isPriority: true, goalTitle: "Grow the business" })],
      events: [event({ title: "Client call", start: "11:00", end: "12:00" })],
      nowMinutes: at(9, 30),
    });
    const [first] = recommendations({ ...base, timeline: tl, nowMinutes: at(9, 30) });
    expect(first).toMatchObject({ kind: "task", eyebrow: "Start with this", title: "Finish the proposal" });
    expect(first.reason).toBe("You have a clear 90-minute window before Client call at 11:00 AM. It moves “Grow the business” forward.");
  });

  it("asks about a task that slipped", () => {
    const tl = buildTimeline({ tasks: [task({ id: "a", title: "Workout", start: "07:00", durationMinutes: 30 })], events: [], nowMinutes: at(9) });
    const [first] = recommendations({ ...base, timeline: tl, nowMinutes: at(9) });
    expect(first).toMatchObject({ kind: "task", eyebrow: "Still on?", reason: "It was planned for 7:00 AM. Done — or should we move it?" });
    // "Move it" continues today's conversation and names the task it's about.
    const href = new URL(first.kind === "task" ? first.askHref : "", "http://x");
    expect([href.pathname, href.searchParams.get("q"), href.searchParams.get("task"), href.searchParams.has("new")]).toEqual(["/assistant", 'Move "Workout" to later today', "a", false]);
  });

  it("falls back to a goal behind pace, then to a helpful prompt — never inventing context", () => {
    const tl = buildTimeline({ tasks: [], events: [], nowMinutes: at(9) });
    const recs = recommendations({
      ...base,
      timeline: tl,
      nowMinutes: at(9),
      goals: [{ id: "g", title: "Run a half marathon", rank: 1 }],
      summaries: new Map([["g", { pace: "behind" as const, label: "0/4 runs this week" }]]),
    });
    expect(recs.map((r) => r.kind)).toEqual(["goal", "empty"]);
    expect(recs[0].reason).toBe("It's behind pace — 0/4 runs this week. Want to make room for it today?");
    const empty = recommendations({ ...base, timeline: tl, nowMinutes: at(9) });
    expect(empty).toEqual([expect.objectContaining({ kind: "empty", title: "Tell me what you're trying to get done today." })]);
  });

  it("celebrates a finished day", () => {
    const tl = buildTimeline({ tasks: [task({ id: "a", title: "A", status: "done" })], events: [], nowMinutes: at(17) });
    expect(recommendations({ ...base, timeline: tl, nowMinutes: at(17) })[0]).toMatchObject({ kind: "done" });
  });

  it("uses the user's own morning intention", () => {
    const tl = buildTimeline({ tasks: [], events: [], nowMinutes: at(8) });
    expect(recommendations({ ...base, timeline: tl, nowMinutes: at(8), intention: "Send the proposal" })[0]).toMatchObject({ kind: "intention", title: "Send the proposal" });
  });
});

describe("windowPhrase", () => {
  it("reads naturally", () => {
    expect(windowPhrase(88)).toBe("90-minute");
    expect(windowPhrase(45)).toBe("45-minute");
    expect(windowPhrase(200)).toBe("3-hour");
  });
});
