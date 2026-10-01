import * as SecureStore from "expo-secure-store";
import { api, ApiError } from "./api";
import { healthSource, type HealthSource } from "./health";
import { buildSyncPayload, syncWindow } from "./health/normalize";

/**
 * Connect / sync / disconnect flows. Health data goes straight from the
 * platform store to the Jarvis API — it is never cached on the device by
 * this app and never logged.
 */
const FIRST_SYNC_DAYS = 30;
/** Later syncs re-send a week so late-arriving data (e.g. a watch syncing late) is picked up. */
const REGULAR_SYNC_DAYS = 7;
const LAST_SYNC_KEY = "jarvis.health.lastSync";
/** Don't sync on every app switch. */
export const MIN_FOREGROUND_SYNC_MINUTES = 30;

const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export type FlowResult = { ok: true; message: string } | { ok: false; message: string };

export async function connect(source: HealthSource | null = healthSource()): Promise<FlowResult> {
  if (!source) return { ok: false, message: "Health data isn't supported on this device." };
  const available = await source.available();
  if (!available.ok) return { ok: false, message: available.reason };
  const granted = await source.requestAccess();
  if (!granted && source.provider === "health_connect") {
    return { ok: false, message: "Jarvis needs permission for steps, active energy, distance, sleep and exercise. You can allow them in Health Connect." };
  }
  await api.connect(source.provider);
  return syncNow(source, { first: true });
}

export async function syncNow(source: HealthSource | null = healthSource(), opts: { first?: boolean } = {}): Promise<FlowResult> {
  if (!source) return { ok: false, message: "Health data isn't supported on this device." };
  if ((await source.accessGranted()) === false) {
    await api.report(source.provider, "permission_denied").catch(() => null);
    return { ok: false, message: `Health access is off. ${source.manageHint}` };
  }
  const timeZone = deviceTimeZone();
  const last = await SecureStore.getItemAsync(LAST_SYNC_KEY);
  const window = syncWindow(new Date(), opts.first || !last ? FIRST_SYNC_DAYS : REGULAR_SYNC_DAYS, timeZone);
  try {
    const raw = await source.read(window.fromDate, window.toDate, timeZone);
    const payload = buildSyncPayload(source.provider, raw, { timeZone, ...window });
    try {
      await api.sync(payload);
    } catch (err) {
      // 409: the server has no healthy connection (first run, or it was marked "needs attention"): reconnect once.
      if (!(err instanceof ApiError) || err.status !== 409) throw err;
      await api.connect(source.provider);
      await api.sync(payload);
    }
    await SecureStore.setItemAsync(LAST_SYNC_KEY, new Date().toISOString());
    return { ok: true, message: `Synced ${payload.days.length} day${payload.days.length === 1 ? "" : "s"} and ${payload.workouts.length} workout${payload.workouts.length === 1 ? "" : "s"}.` };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return { ok: false, message: "Please sign in again." };
    await api.report(source.provider, "sync_failed").catch(() => null);
    return { ok: false, message: "Couldn't sync right now. Try again in a moment." };
  }
}

/** Sync when the app comes to the foreground, at most every MIN_FOREGROUND_SYNC_MINUTES. */
export async function syncIfDue(): Promise<FlowResult | null> {
  const last = await SecureStore.getItemAsync(LAST_SYNC_KEY);
  if (!last) return null; // not connected from this device yet
  if (Date.now() - Date.parse(last) < MIN_FOREGROUND_SYNC_MINUTES * 60_000) return null;
  return syncNow();
}

export async function disconnect(source: HealthSource | null = healthSource()): Promise<FlowResult> {
  if (!source) return { ok: false, message: "Health data isn't supported on this device." };
  await api.disconnect(source.provider);
  await SecureStore.deleteItemAsync(LAST_SYNC_KEY);
  return { ok: true, message: `Disconnected. Jarvis deleted the ${source.label} data it had stored. ${source.manageHint}` };
}
