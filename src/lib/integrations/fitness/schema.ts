import { z } from "zod";

/**
 * Normalized fitness data submitted by native apps (the iOS app reading
 * HealthKit, the Android app reading Health Connect). The web app cannot read
 * either platform directly. Only daily aggregates and workout summaries are
 * accepted — never raw samples, heart rate, locations/routes, or clinical
 * records.
 */
export const FITNESS_PROVIDERS = ["apple_health", "health_connect"] as const;
export type FitnessProvider = (typeof FITNESS_PROVIDERS)[number];
export const fitnessProviderSchema = z.enum(FITNESS_PROVIDERS);

export const WORKOUT_TYPES = ["walking", "running", "cycling", "swimming", "strength", "hiit", "yoga", "other"] as const;
export type WorkoutType = (typeof WORKOUT_TYPES)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const isoDateTime = z.iso.datetime({ offset: true });

export const dailySummarySchema = z
  .object({
    date: isoDate,
    steps: z.number().int().min(0).max(200_000).nullable().optional(),
    activeCaloriesKcal: z.number().min(0).max(20_000).nullable().optional(),
    distanceMeters: z.number().min(0).max(500_000).nullable().optional(),
    sleepMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  })
  .strict();

export const workoutSchema = z
  .object({
    /** The platform's stable id for the workout (HKWorkout UUID / Health Connect record id). */
    id: z.string().trim().min(1).max(200),
    activityType: z.enum(WORKOUT_TYPES),
    startedAt: isoDateTime,
    endedAt: isoDateTime,
    activeCaloriesKcal: z.number().min(0).max(20_000).nullable().optional(),
    distanceMeters: z.number().min(0).max(500_000).nullable().optional(),
  })
  .strict()
  .refine((w) => new Date(w.endedAt) >= new Date(w.startedAt), "endedAt must be after startedAt")
  .refine((w) => new Date(w.endedAt).getTime() - new Date(w.startedAt).getTime() <= 24 * 3600_000, "Workouts longer than 24 hours are not accepted");

/** One sync batch from a native app. Bounded so a client can't flood the server. */
export const fitnessSyncSchema = z
  .object({
    provider: fitnessProviderSchema,
    days: z.array(dailySummarySchema).max(62).default([]),
    workouts: z.array(workoutSchema).max(300).default([]),
  })
  .strict();

export type FitnessSyncInput = z.infer<typeof fitnessSyncSchema>;

/** Days accepted: the last 60 days through tomorrow (time-zone slack). */
export function withinAcceptedRange(date: string, today: string): boolean {
  const d = Date.parse(`${date}T00:00:00Z`);
  const t = Date.parse(`${today}T00:00:00Z`);
  return d >= t - 60 * 86_400_000 && d <= t + 86_400_000;
}
