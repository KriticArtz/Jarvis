import {
  isHealthDataAvailable,
  queryCategorySamples,
  queryStatisticsCollectionForQuantity,
  queryWorkoutSamples,
  requestAuthorization,
} from "@kingstinct/react-native-healthkit";
import { dateKey } from "./normalize";
import type { RawHealthData } from "./types";

/**
 * Apple Health (HealthKit) adapter — iOS only. READ access only, and only
 * for the five data types Jarvis uses. The app never writes to Health
 * (NSHealthUpdateUsageDescription is disabled in app.config.ts).
 *
 * iOS privacy note: HealthKit never tells an app whether READ access was
 * denied — denied types simply return no data. So the app can't detect "the
 * user turned access off"; it shows what was received and points the user to
 * Health → Sharing → Apps → Jarvis.
 */
const READ_TYPES = [
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
  "HKCategoryTypeIdentifierSleepAnalysis",
  "HKWorkoutTypeIdentifier",
] as const;

/** CategoryValueSleepAnalysis values that mean "asleep" (not inBed=0 / awake=2). */
const ASLEEP_VALUES = new Set([1, 3, 4, 5]);

export function appleHealthAvailable(): boolean {
  try {
    return isHealthDataAvailable();
  } catch {
    return false;
  }
}

/** Shows the iOS Health permission sheet (only the first time per type). */
export async function requestAppleHealthAccess(): Promise<boolean> {
  return requestAuthorization({ toRead: READ_TYPES });
}

/** Local midnight of a YYYY-MM-DD in the device's zone. */
const localMidnight = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
};

async function dailySums(identifier: (typeof READ_TYPES)[0 | 1 | 2], unit: string, start: Date, end: Date, timeZone: string): Promise<Record<string, number>> {
  const rows = await queryStatisticsCollectionForQuantity(identifier, ["cumulativeSum"], start, { day: 1 }, {
    filter: { date: { startDate: start, endDate: end } },
    unit,
  } as never);
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.startDate && r.sumQuantity) out[dateKey(new Date(r.startDate), timeZone)] = r.sumQuantity.quantity;
  }
  return out;
}

/** Read the supported data for local dates `fromDate`..`toDate` (inclusive). */
export async function readAppleHealth(fromDate: string, toDate: string, timeZone: string): Promise<RawHealthData> {
  const start = localMidnight(fromDate);
  const end = new Date(localMidnight(toDate).getTime() + 86_400_000);
  // Sleep that ended on the first day began the evening before.
  const sleepStart = new Date(start.getTime() - 18 * 3600_000);

  const [steps, activeCaloriesKcal, distanceMeters, sleepSamples, workouts] = await Promise.all([
    dailySums("HKQuantityTypeIdentifierStepCount", "count", start, end, timeZone),
    dailySums("HKQuantityTypeIdentifierActiveEnergyBurned", "kcal", start, end, timeZone),
    dailySums("HKQuantityTypeIdentifierDistanceWalkingRunning", "m", start, end, timeZone),
    queryCategorySamples("HKCategoryTypeIdentifierSleepAnalysis", { filter: { date: { startDate: sleepStart, endDate: end } }, limit: 0 }),
    queryWorkoutSamples({ filter: { date: { startDate: start, endDate: end } }, limit: 300, ascending: false }),
  ]);

  return {
    steps,
    activeCaloriesKcal,
    distanceMeters,
    sleep: sleepSamples
      .filter((s) => ASLEEP_VALUES.has(Number(s.value)))
      .map((s) => ({ start: new Date(s.startDate), end: new Date(s.endDate) })),
    workouts: workouts.map((w) => ({
      id: w.uuid,
      platformType: Number(w.workoutActivityType),
      start: new Date(w.startDate),
      end: new Date(w.endDate),
      activeCaloriesKcal: w.totalEnergyBurned ? toKcal(w.totalEnergyBurned) : null,
      distanceMeters: w.totalDistance ? toMeters(w.totalDistance) : null,
    })),
  };
}

function toKcal(q: { quantity: number; unit: string }): number | null {
  if (q.unit === "kcal" || q.unit === "Cal") return q.quantity;
  if (q.unit === "cal") return q.quantity / 1000;
  if (q.unit === "kJ") return q.quantity / 4.184;
  return null;
}

function toMeters(q: { quantity: number; unit: string }): number | null {
  if (q.unit === "m") return q.quantity;
  if (q.unit === "km") return q.quantity * 1000;
  if (q.unit === "mi") return q.quantity * 1609.344;
  if (q.unit === "yd") return q.quantity * 0.9144;
  return null;
}
