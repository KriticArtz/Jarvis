import { describe, expect, it } from "vitest";
import { confirmLabel, previousLabel, resultHeading, sanitizeCard, timeRange, whenLabel, type ActionCard, type TaskCard } from "./cards";
import { eventCard, eventWhen, goalCard, planCard, taskCard } from "./card-builders";
import { attachActions } from "./history";
import { applyActionEvent, asResolution, changedNothing, findProposal, isRetryable, parseStreamChunk, withoutProposals } from "./stream-protocol";

const today = "2026-10-08";
const moved = taskCard("moved", { title: "Workout", task_date: "2026-10-09", scheduled_start: "17:30:00", duration_minutes: 45 }, { task_date: today, scheduled_start: "18:00:00" }) as TaskCard;

describe("card schema", () => {
  it("accepts the cards the server builds", () => {
    expect(moved).toEqual({
      v: 1,
      kind: "task",
      action: "moved",
      title: "Workout",
      when: { date: "2026-10-09", start: "17:30", end: null, allDay: false, lastDate: null },
      durationMinutes: 45,
      previous: { date: today, start: "18:00", end: null, allDay: false, lastDate: null },
    });
    expect(sanitizeCard(JSON.parse(JSON.stringify(moved)))).toEqual(moved);
  });

  it("rejects anything outside the whitelist", () => {
    expect(sanitizeCard(null)).toBeNull();
    expect(sanitizeCard("<b>hi</b>")).toBeNull();
    expect(sanitizeCard({ ...moved, kind: "html" })).toBeNull();
    expect(sanitizeCard({ ...moved, action: "launched" })).toBeNull();
    // Unknown keys (e.g. markup or links smuggled in) are refused outright, not passed through.
    expect(sanitizeCard({ ...moved, html: "<img src=x onerror=alert(1)>" })).toBeNull();
    expect(sanitizeCard({ ...moved, href: "javascript:alert(1)" })).toBeNull();
    expect(sanitizeCard({ ...moved, when: { ...moved.when!, start: "25:00" } })).toBeNull();
    expect(sanitizeCard({ ...moved, title: "x".repeat(201) })).toBeNull();
    expect(sanitizeCard({ ...moved, v: 2 })).toBeNull();
  });

  it("clips over-long values when building instead of failing", () => {
    const card = taskCard("created", { title: "x".repeat(400), task_date: today, scheduled_start: null, duration_minutes: null })!;
    expect(card.kind === "task" && card.title.length).toBe(200);
    expect(goalCard("progress", "Run", "y".repeat(500))).not.toBeNull();
  });

  it("builds event cards in the user's time zone", () => {
    const when = eventWhen({ allDay: false, startsAt: "2026-10-08T21:00:00.000Z", endsAt: "2026-10-08T22:30:00.000Z", timeZone: "America/New_York" }, "America/New_York");
    expect(when).toEqual({ date: today, start: "17:00", end: "18:30", allDay: false, lastDate: null });
    const allDay = eventWhen({ allDay: true, startDate: "2026-10-09", endDate: "2026-10-12", timeZone: "UTC" }, "UTC");
    expect(allDay).toEqual({ date: "2026-10-09", start: null, end: null, allDay: true, lastDate: "2026-10-11" });
    const card = eventCard("created", { title: "Proposal", when, location: "  ", notes: ["Overlaps “Gym”", ""] });
    expect(card).toMatchObject({ kind: "event", location: null, notes: ["Overlaps “Gym”"] });
  });

  it("orders plan items by time", () => {
    const card = planCard("proposed", today, [
      { title: "Proposal", start_time: "14:00", duration_minutes: 90 },
      { title: "Call Mom", start_time: null, duration_minutes: 15 },
      { title: "Workout", start_time: "09:00", duration_minutes: 45 },
    ]) as Extract<ActionCard, { kind: "plan" }>;
    expect(card.items.map((i) => i.title)).toEqual(["Workout", "Proposal", "Call Mom"]);
  });
});

describe("card wording", () => {
  it("reads like a person would say it", () => {
    expect(whenLabel(moved.when!, today)).toBe("Tomorrow · 5:30 PM");
    expect(previousLabel(moved.previous!, today)).toBe("Moved from today · 6:00 PM");
    expect(timeRange("14:00", "15:30")).toBe("2:00–3:30 PM");
    expect(timeRange("11:00", "12:30")).toBe("11:00 AM–12:30 PM");
    expect(whenLabel({ date: "2026-10-13", start: null, end: null, allDay: true, lastDate: null }, today)).toBe("Tue, Oct 13 · All day");
    expect(resultHeading(moved)).toBe("Moved");
  });

  it("names the approval after what it does", () => {
    expect(confirmLabel(eventCard("created", { title: "Proposal", when: null }))).toBe("Add to calendar");
    expect(confirmLabel(eventCard("moved", { title: "Call", when: null }))).toBe("Move it");
    expect(confirmLabel(planCard("proposed", today, []))).toBe("Use this plan");
    expect(confirmLabel(null)).toBe("Confirm");
  });
});

describe("stream protocol with cards", () => {
  it("carries an optional card and stays compatible with events without one", () => {
    const line = JSON.stringify({ t: "action", id: "c1", status: "succeeded", label: "Moved “Workout”.", card: moved });
    const { events } = parseStreamChunk(`${line}\n{"t":"action","id":"c2","status":"succeeded","label":"Saved."}\n`);
    let actions = applyActionEvent([], events[0] as never);
    actions = applyActionEvent(actions, events[1] as never);
    expect(actions).toEqual([
      { id: "c1", status: "succeeded", label: "Moved “Workout”.", card: moved },
      { id: "c2", status: "succeeded", label: "Saved." },
    ]);
  });

  it("drops invalid cards and never attaches a card to a failure", () => {
    const bad = applyActionEvent([], { t: "action", id: "1", status: "succeeded", label: "Done", card: { kind: "task", title: "<script>" } });
    expect(bad[0].card).toBeUndefined();
    const failed = applyActionEvent([], { t: "action", id: "1", status: "failed", label: "I couldn't move “Workout”.", card: moved, error: "server_error" });
    expect(failed[0]).toEqual({ id: "1", status: "failed", label: "I couldn't move “Workout”.", error: "server_error" });
    expect(isRetryable(failed[0])).toBe(true);
    expect(changedNothing(failed[0])).toBe(true);
    const weird = applyActionEvent([], { t: "action", id: "1", status: "failed", label: "x", error: "drop table" });
    expect(weird[0].error).toBeUndefined();
    expect(changedNothing({ status: "failed", error: "partial_failure" })).toBe(false);
  });
});

describe("reload (attachActions)", () => {
  const messages = [
    { id: "u1", role: "user" as const, created_at: "2026-10-08T10:00:00Z" },
    { id: "a1", role: "assistant" as const, created_at: "2026-10-08T10:00:05Z" },
    { id: "u2", role: "user" as const, created_at: "2026-10-08T10:01:00Z" },
    { id: "a2", role: "assistant" as const, created_at: "2026-10-08T10:01:05Z" },
  ];
  const now = new Date("2026-10-08T10:05:00Z");

  it("rebuilds results, proposals, declines and failures as they were shown", () => {
    const proposal = eventCard("moved", { title: "Client call", when: null });
    const map = attachActions(
      messages,
      [
        { id: "r", status: "succeeded", summary: "Moved “Workout”.", created_at: "2026-10-08T10:00:02Z", resolved_at: "2026-10-08T10:00:02Z", result: moved },
        { id: "f", status: "failed", summary: "I couldn't add that task.", created_at: "2026-10-08T10:00:03Z", resolved_at: "2026-10-08T10:00:03Z", error_code: "server_error", result: moved },
        { id: "p", status: "pending_confirmation", summary: "Move “Client call”", created_at: "2026-10-08T10:00:04Z", resolved_at: null, expires_at: "2026-10-08T10:30:00Z", result: proposal },
        { id: "d", status: "cancelled", summary: "Move “Client call”", created_at: "2026-10-08T10:00:04Z", resolved_at: "2026-10-08T10:01:02Z", result: proposal },
        { id: "x", status: "cancelled", summary: "Skip", created_at: "2026-10-08T10:00:04Z", resolved_at: "2026-10-08T10:01:02Z" },
        { id: "e", status: "pending_confirmation", summary: "Old", created_at: "2026-10-08T10:00:04Z", resolved_at: null, expires_at: "2026-10-08T10:01:00Z", result: proposal },
        { id: "h", status: "succeeded", summary: "Done", created_at: "2026-10-08T10:00:04Z", resolved_at: "2026-10-08T10:00:04Z", result: { kind: "task", html: "<b>" } },
      ],
      now,
    );
    expect(map.get("a1")).toEqual([
      { id: "r", status: "succeeded", label: "Moved “Workout”.", card: moved },
      { id: "f", status: "failed", label: "I couldn't add that task.", error: "server_error" },
      { id: "p", status: "needs_confirmation", label: "Move “Client call”", confirmationId: "p", card: proposal },
      { id: "h", status: "succeeded", label: "Done" },
    ]);
    expect(map.get("a2")).toEqual([{ id: "d", status: "declined", label: "Move “Client call”", card: proposal }]);
  });
});

describe("proposals answered in words (phase 4D regression)", () => {
  const id = "11111111-2222-4333-8444-555555555555";
  const proposal = { id: "p", status: "needs_confirmation" as const, label: "Move “Client call”", confirmationId: id, card: moved };
  const messages = [{ id: "a1", actions: [proposal, { id: "x", status: "succeeded" as const, label: "Done" }] }, { id: "a2" }];

  it("accepts only a well-formed resolution", () => {
    expect(asResolution({ confirmationId: id, decision: "confirm" })).toEqual({ confirmationId: id, decision: "confirm" });
    expect(asResolution({ confirmationId: id, decision: "delete everything" })).toBeUndefined();
    expect(asResolution({ confirmationId: "<script>", decision: "confirm" })).toBeUndefined();
    expect(asResolution("yes")).toBeUndefined();
  });

  it("retires the answered proposal from its message and keeps everything else", () => {
    expect(findProposal(messages, id)).toBe(proposal);
    const after = withoutProposals(messages[0], new Set([id]));
    expect(after.actions).toEqual([{ id: "x", status: "succeeded", label: "Done" }]);
    expect(withoutProposals(messages[1], new Set([id]))).toBe(messages[1]);
    expect(withoutProposals(messages[0], new Set())).toBe(messages[0]);
  });
});
