import {
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
  SleepStageType,
  type Permission,
} from "react-native-health-connect";
import { dateKey } from "./normalize";
import type { RawHealthData } from "./types";

/**
 * Google Health Connect adapter — Android only. READ access only, for the
 * five data types Jarvis uses; the matching android.permission.health.READ_*
 * permissions are declared in app.config.ts and nothing else.
 */
const PERMISSIONS: Permission[] = [
  { accessType: "read", recordType: "Steps" },
  { accessType: "read", recordType: "ActiveCaloriesBurned" },
  { accessType: "read", recordType: "Distance" },
  { accessType: "read", recordType: "SleepSession" },
  { accessType: "read", recordType: "ExerciseSession" },
];

const ASLEEP_STAGES = new Set<number>([SleepStageType.SLEEPING, SleepStageType.LIGHT, SleepStageType.DEEP, SleepStageType.REM]);

export type HealthConnectAvailability = "available" | "needs_update" | "unavailable";

export async function healthConnectAvailability(): Promise<HealthConnectAvailability> {
  try {
    const status = await getSdkStatus();
    if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return "available";
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return "needs_update";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

/** Shows the Health Connect permission screen. Returns true when every type Jarvis reads was granted. */
export async function requestHealthConnectAccess(): Promise<boolean> {
  if (!(await initialize())) return false;
  const granted = await requestPermission(PERMISSIONS);
  return hasAll(granted);
}

/** Whether the user still allows Jarvis to read everything it needs (they can revoke anytime). */
export async function healthConnectAccessGranted(): Promise<boolean> {
  if (!(await initialize())) return false;
  return hasAll(await getGrantedPermissions());
}

function hasAll(granted: { accessType: string; recordType: string }[]): boolean {
  return PERMISSIONS.every((p) => granted.some((g) => g.accessType === p.accessType && g.recordType === p.recordType));
}

export function openHealthConnectPermissions() {
  openHealthConnectSettings();
}

const localMidnight = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
};

async function readAll<T extends "SleepSession" | "ExerciseSession">(recordType: T, startTime: string, endTime: string) {
  const out = [];
  let pageToken: string | undefined;
  do {
    const page = await readRecords(recordType, { timeRangeFilter: { operator: "between", startTime, endTime }, pageSize: 500, pageToken });
    out.push(...page.records);
    pageToken = page.pageToken || undefined;
  } while (pageToken && out.length < 2000);
  return out;
}

/** Read the supported data for local dates `fromDate`..`toDate` (inclusive). */
export async function readHealthConnect(fromDate: string, toDate: string, timeZone: string): Promise<RawHealthData> {
  await initialize();
  const raw: RawHealthData = { steps: {}, activeCaloriesKcal: {}, distanceMeters: {}, sleep: [], workouts: [] };

  // Daily totals: one aggregate per local day (Health Connect de-duplicates overlapping sources).
  for (let day = localMidnight(fromDate); dateKey(day, timeZone) <= toDate; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    const range = { operator: "between" as const, startTime: day.toISOString(), endTime: next.toISOString() };
    const key = dateKey(day, timeZone);
    const [steps, energy, distance] = await Promise.all([
      aggregateRecord({ recordType: "Steps", timeRangeFilter: range }),
      aggregateRecord({ recordType: "ActiveCaloriesBurned", timeRangeFilter: range }),
      aggregateRecord({ recordType: "Distance", timeRangeFilter: range }),
    ]);
    if (steps.dataOrigins.length) raw.steps[key] = steps.COUNT_TOTAL;
    if (energy.dataOrigins.length) raw.activeCaloriesKcal[key] = energy.ACTIVE_CALORIES_TOTAL.inKilocalories;
    if (distance.dataOrigins.length) raw.distanceMeters[key] = distance.DISTANCE.inMeters;
  }

  const start = localMidnight(fromDate);
  const end = new Date(localMidnight(toDate).getTime() + 86_400_000);
  const sleepStart = new Date(start.getTime() - 18 * 3600_000);

  for (const s of await readAll("SleepSession", sleepStart.toISOString(), end.toISOString())) {
    const stages = (s.stages ?? []).filter((st) => ASLEEP_STAGES.has(st.stage));
    if (stages.length) for (const st of stages) raw.sleep.push({ start: new Date(st.startTime), end: new Date(st.endTime) });
    else raw.sleep.push({ start: new Date(s.startTime), end: new Date(s.endTime) });
  }

  const sessions = (await readAll("ExerciseSession", start.toISOString(), end.toISOString())).slice(-100);
  for (const w of sessions) {
    if (!w.metadata?.id) continue;
    // Sessions carry no totals; aggregate energy and distance within the session.
    const range = { operator: "between" as const, startTime: w.startTime, endTime: w.endTime };
    const [energy, distance] = await Promise.all([
      aggregateRecord({ recordType: "ActiveCaloriesBurned", timeRangeFilter: range }),
      aggregateRecord({ recordType: "Distance", timeRangeFilter: range }),
    ]);
    raw.workouts.push({
      id: w.metadata.id,
      platformType: w.exerciseType,
      start: new Date(w.startTime),
      end: new Date(w.endTime),
      activeCaloriesKcal: energy.dataOrigins.length ? energy.ACTIVE_CALORIES_TOTAL.inKilocalories : null,
      distanceMeters: distance.dataOrigins.length ? distance.DISTANCE.inMeters : null,
    });
  }
  return raw;
}
