import type { DailySummary, HealthProvider, RawHealthData, SyncPayload, WorkoutSummary, WorkoutType } from "./types";

/**
 * Pure normalization from platform data to the Jarvis sync payload. No
 * React Native imports here, so it is unit-tested from the web repo against
 * the server's schema. Limits mirror the server (it rejects anything larger).
 */

export const LIMITS = { days: 62, workouts: 300, steps: 200_000, kcal: 20_000, meters: 500_000, sleepMinutes: 1440, workoutHours: 24 } as const;

/** YYYY-MM-DD of an instant in a time zone. */
export function dateKey(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Minutes asleep per local day. Overlapping intervals (e.g. the same night
 * from a watch and the phone) are merged first so time isn't double-counted.
 * Each sleep block counts toward the day it ends on (the morning you wake up).
 */
export function sleepMinutesByDay(intervals: { start: Date; end: Date }[], timeZone: string): Record<string, number> {
  const sorted = intervals
    .filter((i) => i.end.getTime() > i.start.getTime())
    .map((i) => ({ start: i.start.getTime(), end: i.end.getTime() }))
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const i of sorted) {
    const last = merged[merged.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else merged.push({ ...i });
  }
  const out: Record<string, number> = {};
  for (const m of merged) {
    const key = dateKey(new Date(m.end), timeZone);
    out[key] = (out[key] ?? 0) + (m.end - m.start) / 60_000;
  }
  for (const k of Object.keys(out)) out[k] = Math.min(LIMITS.sleepMinutes, Math.round(out[k]));
  return out;
}

/** HKWorkoutActivityType raw values → Jarvis workout types. */
const APPLE_WORKOUTS: Record<number, WorkoutType> = {
  52: "walking", // walking
  24: "walking", // hiking
  37: "running", // running
  13: "cycling", // cycling
  74: "cycling", // handCycling
  46: "swimming", // swimming
  50: "strength", // traditionalStrengthTraining
  20: "strength", // functionalStrengthTraining
  63: "hiit", // highIntensityIntervalTraining
  11: "hiit", // crossTraining
  57: "yoga", // yoga
};

/** Health Connect ExerciseSessionRecord.EXERCISE_TYPE_* → Jarvis workout types. */
const HEALTH_CONNECT_WORKOUTS: Record<number, WorkoutType> = {
  79: "walking", // WALKING
  37: "walking", // HIKING
  56: "running", // RUNNING
  57: "running", // RUNNING_TREADMILL
  8: "cycling", // BIKING
  9: "cycling", // BIKING_STATIONARY
  73: "swimming", // SWIMMING_OPEN_WATER
  74: "swimming", // SWIMMING_POOL
  70: "strength", // STRENGTH_TRAINING
  81: "strength", // WEIGHTLIFTING
  13: "strength", // CALISTHENICS
  36: "hiit", // HIGH_INTENSITY_INTERVAL_TRAINING
  83: "yoga", // YOGA
};

export function workoutType(provider: HealthProvider, platformType: number): WorkoutType {
  return (provider === "apple_health" ? APPLE_WORKOUTS : HEALTH_CONNECT_WORKOUTS)[platformType] ?? "other";
}

const clean = (v: number | null | undefined, max: number, digits = 1): number | null => {
  if (v == null || !Number.isFinite(v) || v < 0) return null;
  const f = 10 ** digits;
  return Math.min(max, Math.round(v * f) / f);
};

/**
 * Build one sync payload for local dates `fromDate`..`toDate` (inclusive).
 * Days with no data at all are left out; values are rounded and clamped to
 * what the server accepts; workouts over 24 hours or ending before they start
 * are dropped.
 */
export function buildSyncPayload(provider: HealthProvider, raw: RawHealthData, opts: { timeZone: string; fromDate: string; toDate: string }): SyncPayload {
  const sleep = sleepMinutesByDay(raw.sleep, opts.timeZone);
  const keys = new Set([...Object.keys(raw.steps), ...Object.keys(raw.activeCaloriesKcal), ...Object.keys(raw.distanceMeters), ...Object.keys(sleep)]);
  const days: DailySummary[] = [...keys]
    .filter((d) => d >= opts.fromDate && d <= opts.toDate)
    .sort()
    .slice(-LIMITS.days)
    .map((date) => ({
      date,
      steps: raw.steps[date] == null ? null : Math.min(LIMITS.steps, Math.max(0, Math.round(raw.steps[date]))),
      activeCaloriesKcal: clean(raw.activeCaloriesKcal[date], LIMITS.kcal),
      distanceMeters: clean(raw.distanceMeters[date], LIMITS.meters),
      sleepMinutes: sleep[date] ?? null,
    }))
    .filter((d) => d.steps != null || d.activeCaloriesKcal != null || d.distanceMeters != null || d.sleepMinutes != null);

  const workouts: WorkoutSummary[] = raw.workouts
    .filter((w) => {
      const ms = w.end.getTime() - w.start.getTime();
      const day = dateKey(w.start, opts.timeZone);
      return ms >= 0 && ms <= LIMITS.workoutHours * 3600_000 && day >= opts.fromDate && day <= opts.toDate && w.id.trim().length > 0;
    })
    .sort((a, b) => b.start.getTime() - a.start.getTime())
    .slice(0, LIMITS.workouts)
    .map((w) => ({
      id: w.id.trim().slice(0, 200),
      activityType: workoutType(provider, w.platformType),
      startedAt: w.start.toISOString(),
      endedAt: w.end.toISOString(),
      activeCaloriesKcal: clean(w.activeCaloriesKcal, LIMITS.kcal),
      distanceMeters: clean(w.distanceMeters, LIMITS.meters),
    }));

  return { provider, days, workouts };
}

/** Local dates for the last `days` days ending today, for read ranges. */
export function syncWindow(now: Date, days: number, timeZone: string): { fromDate: string; toDate: string } {
  const toDate = dateKey(now, timeZone);
  // Calendar arithmetic on the date itself (not "now minus N×24h"), so DST changes can't shift a day.
  const from = new Date(`${toDate}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { fromDate: from.toISOString().slice(0, 10), toDate };
}
