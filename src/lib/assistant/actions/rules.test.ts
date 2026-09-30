import { describe, expect, it } from "vitest";
import { checkConfirmation } from "./confirmation";
import { describeDate, resolveDate } from "./dates";

const today = "2026-09-29";

describe("resolveDate", () => {
  it("resolves relative and absolute dates", () => {
    expect(resolveDate("today", today)).toEqual({ ok: true, date: today });
    expect(resolveDate("Tomorrow", today)).toEqual({ ok: true, date: "2026-09-30" });
    expect(resolveDate("yesterday", today)).toEqual({ ok: true, date: "2026-09-28" });
    expect(resolveDate("2026-10-15", today)).toEqual({ ok: true, date: "2026-10-15" });
  });
  it("rejects garbage and out-of-range dates", () => {
    expect(resolveDate("next week", today).ok).toBe(false);
    expect(resolveDate("2026-13-45", today).ok).toBe(false);
    expect(resolveDate("2020-01-01", today).ok).toBe(false);
    expect(resolveDate("2030-01-01", today).ok).toBe(false);
  });
  it("describes dates naturally", () => {
    expect(describeDate("2026-09-30", today)).toBe("tomorrow");
    expect(describeDate("2026-10-01", today)).toBe("Thu, Oct 1");
  });
});

describe("checkConfirmation", () => {
  const ctx = { userId: "u1", conversationId: "c1", turnStartedAt: "2026-09-29T20:05:00Z" };
  const row = { user_id: "u1", conversation_id: "c1", status: "pending_confirmation", created_at: "2026-09-29T20:00:00Z", expires_at: "2026-09-29T20:30:00Z" };
  const now = new Date("2026-09-29T20:05:01Z");

  it("allows a pending proposal confirmed in a later message", () => {
    expect(checkConfirmation(row, ctx, now)).toBe("ok");
  });
  it("rejects proposals from another user or conversation", () => {
    expect(checkConfirmation({ ...row, user_id: "u2" }, ctx, now)).toBe("not_found");
    expect(checkConfirmation({ ...row, conversation_id: "c2" }, ctx, now)).toBe("not_found");
    expect(checkConfirmation(null, ctx, now)).toBe("not_found");
  });
  it("rejects confirming in the same turn the proposal was made", () => {
    expect(checkConfirmation({ ...row, created_at: "2026-09-29T20:05:00.500Z" }, ctx, now)).toBe("same_turn");
  });
  it("rejects expired and already-resolved proposals", () => {
    expect(checkConfirmation(row, ctx, new Date("2026-09-29T20:31:00Z"))).toBe("expired");
    expect(checkConfirmation({ ...row, status: "succeeded" }, ctx, now)).toBe("already_resolved");
  });
});
