/**
 * The sync contract with the Jarvis backend (POST /api/integrations/fitness/sync).
 * Mirrors src/lib/integrations/fitness/schema.ts on the server; the contract
 * test (normalize.test.ts) validates payloads built here against that schema.
 */
export type HealthProvider = "apple_health" | "health_connect";

export const WORKOUT_TYPES = ["walking", "running", "cycling", "swimming", "strength", "hiit", "yoga", "other"] as const;
export type WorkoutType = (typeof WORKOUT_TYPES)[number];

export interface DailySummary {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  steps?: number | null;
  activeCaloriesKcal?: number | null;
  distanceMeters?: number | null;
  sleepMinutes?: number | null;
}

export interface WorkoutSummary {
  /** The platform's stable id (HKWorkout UUID / Health Connect record id). */
  id: string;
  activityType: WorkoutType;
  startedAt: string;
  endedAt: string;
  activeCaloriesKcal?: number | null;
  distanceMeters?: number | null;
}

export interface SyncPayload {
  provider: HealthProvider;
  days: DailySummary[];
  workouts: WorkoutSummary[];
}

/** What a platform adapter reads for a date range (before normalization). */
export interface RawHealthData {
  /** Per local date: daily totals. */
  steps: Record<string, number>;
  activeCaloriesKcal: Record<string, number>;
  distanceMeters: Record<string, number>;
  /** Asleep intervals (not "in bed" / awake). */
  sleep: { start: Date; end: Date }[];
  workouts: { id: string; platformType: number; start: Date; end: Date; activeCaloriesKcal?: number | null; distanceMeters?: number | null }[];
}

/** The only data types Jarvis reads. Nothing else is ever requested. */
export const HEALTH_DATA_TYPES = ["steps", "active_energy", "distance", "sleep", "workouts"] as const;
