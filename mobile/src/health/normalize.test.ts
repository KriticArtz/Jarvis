import { describe, expect, it } from "vitest";
// The server's real schema: payloads built on the phone must always pass it.
import { fitnessSyncSchema } from "@/lib/integrations/fitness/schema";
import { buildSyncPayload, dateKey, sleepMinutesByDay, syncWindow, workoutType } from "./normalize";
import type { RawHealthData } from "./types";

const TZ = "America/New_York";
const empty = (): RawHealthData => ({ steps: {}, activeCaloriesKcal: {}, distanceMeters: {}, sleep: [], workouts: [] });

describe("health normalization (native app → Jarvis sync payload)", () => {
  it("produces payloads the server accepts, with rounded and clamped values", () => {
    const raw: RawHealthData = {
      steps: { "2026-09-29": 8412.6, "2026-09-30": 250_000 },
      activeCaloriesKcal: { "2026-09-30": 512.345 },
      distanceMeters: { "2026-09-30": 6120.27 },
      sleep: [{ start: new Date("2026-09-30T03:30:00Z"), end: new Date("2026-09-30T10:45:00Z") }],
      workouts: [
        { id: "hk-uuid-1", platformType: 37, start: new Date("2026-09-30T10:30:00Z"), end: new Date("2026-09-30T11:05:00Z"), activeCaloriesKcal: 350.04, distanceMeters: 5200 },
        { id: "too-long", platformType: 52, start: new Date("2026-09-28T00:00:00Z"), end: new Date("2026-09-29T01:00:00Z") },
        { id: "backwards", platformType: 52, start: new Date("2026-09-30T12:00:00Z"), end: new Date("2026-09-30T11:00:00Z") },
      ],
    };
    const payload = buildSyncPayload("apple_health", raw, { timeZone: TZ, fromDate: "2026-09-24", toDate: "2026-09-30" });
    expect(fitnessSyncSchema.safeParse(payload).success).toBe(true);
    expect(payload.days).toEqual([
      { date: "2026-09-29", steps: 8413, activeCaloriesKcal: null, distanceMeters: null, sleepMinutes: null },
      { date: "2026-09-30", steps: 200_000, activeCaloriesKcal: 512.3, distanceMeters: 6120.3, sleepMinutes: 435 },
    ]);
    expect(payload.workouts).toEqual([
      { id: "hk-uuid-1", activityType: "running", startedAt: "2026-09-30T10:30:00.000Z", endedAt: "2026-09-30T11:05:00.000Z", activeCaloriesKcal: 350, distanceMeters: 5200 },
    ]);
  });

  it("only includes the requested dates and stays within the server's batch limits", () => {
    const raw = empty();
    for (let i = 0; i < 100; i++) raw.steps[dateKey(new Date(Date.UTC(2026, 6, 1 + i, 16)), TZ)] = 1000 + i;
    for (let i = 0; i < 400; i++) raw.workouts.push({ id: `w${i}`, platformType: 0, start: new Date(Date.UTC(2026, 8, 1, 12, i)), end: new Date(Date.UTC(2026, 8, 1, 12, i + 1)) });
    const payload = buildSyncPayload("health_connect", raw, { timeZone: TZ, fromDate: "2026-07-01", toDate: "2026-10-10" });
    expect(payload.days.length).toBe(62);
    expect(payload.workouts.length).toBe(300);
    expect(fitnessSyncSchema.safeParse(payload).success).toBe(true);
    const narrow = buildSyncPayload("health_connect", raw, { timeZone: TZ, fromDate: "2026-09-01", toDate: "2026-09-03" });
    expect(narrow.days.map((d) => d.date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });

  it("never carries a user id or anything outside the contract", () => {
    const payload = buildSyncPayload("apple_health", { ...empty(), steps: { "2026-09-30": 10 } }, { timeZone: TZ, fromDate: "2026-09-30", toDate: "2026-09-30" });
    expect(Object.keys(payload).sort()).toEqual(["days", "provider", "workouts"]);
    expect(JSON.stringify(payload)).not.toMatch(/user/i);
  });

  it("merges overlapping sleep and credits it to the morning you wake up", () => {
    const night = [
      // Phone and watch both recorded the night: 11 PM – 6:30 AM and 11:30 PM – 7 AM local.
      { start: new Date("2026-09-30T03:00:00Z"), end: new Date("2026-09-30T10:30:00Z") },
      { start: new Date("2026-09-30T03:30:00Z"), end: new Date("2026-09-30T11:00:00Z") },
      // A nap that afternoon.
      { start: new Date("2026-09-30T18:00:00Z"), end: new Date("2026-09-30T18:30:00Z") },
    ];
    expect(sleepMinutesByDay(night, TZ)).toEqual({ "2026-09-30": 510 });
  });

  it("maps platform workout types to Jarvis types", () => {
    expect([52, 24, 37, 13, 46, 50, 20, 63, 57, 999].map((t) => workoutType("apple_health", t))).toEqual([
      "walking", "walking", "running", "cycling", "swimming", "strength", "strength", "hiit", "yoga", "other",
    ]);
    expect([79, 56, 57, 8, 9, 73, 74, 70, 81, 36, 83, 0].map((t) => workoutType("health_connect", t))).toEqual([
      "walking", "running", "running", "cycling", "cycling", "swimming", "swimming", "strength", "strength", "hiit", "yoga", "other",
    ]);
  });

  it("computes the sync window by calendar date, even across a DST change", () => {
    // Shortly after midnight on the day US clocks fall back.
    expect(syncWindow(new Date("2026-11-01T04:30:00Z"), 7, TZ)).toEqual({ fromDate: "2026-10-26", toDate: "2026-11-01" });
    expect(syncWindow(new Date("2026-09-30T12:00:00Z"), 1, TZ)).toEqual({ fromDate: "2026-09-30", toDate: "2026-09-30" });
  });
});
