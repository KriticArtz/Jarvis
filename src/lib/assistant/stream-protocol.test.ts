import { describe, expect, it } from "vitest";
import { attachActions } from "./history";
import { applyActionEvent, parseStreamChunk } from "./stream-protocol";

describe("chat stream protocol", () => {
  it("parses complete lines and keeps the remainder", () => {
    const { events, rest } = parseStreamChunk('{"t":"text","v":"Hel"}\n{"t":"action","id":"1","status":"running","label":"Moving it…"}\n{"t":"te');
    expect(events).toEqual([
      { t: "text", v: "Hel" },
      { t: "action", id: "1", status: "running", label: "Moving it…" },
    ]);
    expect(rest).toBe('{"t":"te');
  });
  it("ignores malformed lines", () => {
    expect(parseStreamChunk('garbage\n{"t":"text","v":"ok"}\n').events).toEqual([{ t: "text", v: "ok" }]);
  });
  it("updates an action in place and hides read-only lookups", () => {
    let actions = applyActionEvent([], { t: "action", id: "1", status: "running", label: "Moving it…" });
    actions = applyActionEvent(actions, { t: "action", id: "1", status: "succeeded", label: "Moved “Run” to tomorrow." });
    expect(actions).toEqual([{ id: "1", status: "succeeded", label: "Moved “Run” to tomorrow." }]);
    actions = applyActionEvent(actions, { t: "action", id: "2", status: "running", label: "Checking…" });
    actions = applyActionEvent(actions, { t: "action", id: "2", status: "info", label: "" });
    expect(actions.map((a) => a.id)).toEqual(["1"]);
  });
});

describe("attachActions", () => {
  const messages = [
    { id: "u1", role: "user" as const, created_at: "2026-09-29T10:00:00Z" },
    { id: "a1", role: "assistant" as const, created_at: "2026-09-29T10:00:05Z" },
    { id: "u2", role: "user" as const, created_at: "2026-09-29T10:01:00Z" },
    { id: "a2", role: "assistant" as const, created_at: "2026-09-29T10:01:05Z" },
  ];
  it("attaches actions to the reply that followed them, confirmed proposals to the confirming reply", () => {
    const map = attachActions(messages, [
      { id: "x", status: "succeeded", summary: "Marked “Run” done.", created_at: "2026-09-29T10:00:02Z", resolved_at: "2026-09-29T10:00:02Z" },
      { id: "y", status: "succeeded", summary: "Deleted “Read”.", created_at: "2026-09-29T10:00:03Z", resolved_at: "2026-09-29T10:01:02Z" },
      { id: "z", status: "cancelled", summary: "Skip", created_at: "2026-09-29T10:00:03Z", resolved_at: null },
    ]);
    expect(map.get("a1")?.map((a) => a.id)).toEqual(["x"]);
    expect(map.get("a2")?.map((a) => a.id)).toEqual(["y"]);
  });
});
