import { describe, expect, it } from "vitest";
import { fitnessConnectionState, STALE_AFTER_DAYS } from "./status";

const now = new Date("2026-10-01T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();
const row = (over: Partial<{ status: string; last_synced_at: string | null; last_error: string | null; created_at: string }>) => ({
  status: "connected",
  last_synced_at: null,
  last_error: null,
  created_at: hoursAgo(1),
  ...over,
});

describe("health connection state", () => {
  it("maps the stored connection to Not connected / Syncing / Connected / Needs attention", () => {
    expect(fitnessConnectionState(null, now)).toEqual({ state: "not_connected", issue: null });
    expect(fitnessConnectionState(row({}), now)).toEqual({ state: "syncing", issue: null });
    expect(fitnessConnectionState(row({ last_synced_at: hoursAgo(2) }), now)).toEqual({ state: "connected", issue: null });
  });

  it("needs attention when the phone reports a problem", () => {
    expect(fitnessConnectionState(row({ status: "error", last_error: "permission_denied", last_synced_at: hoursAgo(2) }), now)).toEqual({ state: "needs_attention", issue: "permission_denied" });
    expect(fitnessConnectionState(row({ status: "error", last_error: "sync_failed" }), now)).toEqual({ state: "needs_attention", issue: "sync_failed" });
    // Unknown codes are never echoed back.
    expect(fitnessConnectionState(row({ status: "error", last_error: "something else" }), now)).toEqual({ state: "needs_attention", issue: "sync_failed" });
  });

  it("needs attention when data stops arriving", () => {
    expect(fitnessConnectionState(row({ last_synced_at: hoursAgo(STALE_AFTER_DAYS * 24 + 1) }), now)).toEqual({ state: "needs_attention", issue: "stale" });
    expect(fitnessConnectionState(row({ created_at: hoursAgo(30) }), now)).toEqual({ state: "needs_attention", issue: "stale" });
  });
});
