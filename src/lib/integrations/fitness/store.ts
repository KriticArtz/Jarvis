import type { DB } from "@/lib/data/db";
import { addDays, localDate, zonedParts } from "@/lib/time";
import { PROVIDER_LABEL } from "../connections";
import { FITNESS_PROVIDERS, withinAcceptedRange, type FitnessProvider, type FitnessSyncInput } from "./schema";
import { fitnessConnectionState, type FitnessConnectionRow, type FitnessConnectionState, type FitnessIssue } from "./status";

/**
 * Fitness connections and data. Writes use the service-role client and a
 * user id taken from a verified session/JWT (never from the payload).
 */

export async function connectFitness(admin: DB, userId: string, provider: FitnessProvider): Promise<{ ok: boolean }> {
  const { error } = await admin
    .from("integration_connections")
    .upsert({ user_id: userId, provider, kind: "fitness", status: "connected", last_error: null }, { onConflict: "user_id,provider" });
  return { ok: !error };
}

/** Deletes the connection and, by cascade, every fitness record from that provider. */
export async function disconnectFitness(admin: DB, userId: string, provider: FitnessProvider): Promise<{ ok: boolean }> {
  const { error } = await admin.from("integration_connections").delete().eq("user_id", userId).eq("provider", provider).eq("kind", "fitness");
  return { ok: !error };
}

/**
 * The phone reports a problem it can't fix silently (the user removed the
 * health permission, or syncing keeps failing). The connection is marked
 * "needs attention"; syncing resumes after the app reconnects. Only a code is
 * stored — never health data.
 */
export async function reportFitnessIssue(admin: DB, userId: string, provider: FitnessProvider, issue: Exclude<FitnessIssue, "stale">): Promise<{ ok: boolean; found: boolean }> {
  const { data, error } = await admin
    .from("integration_connections")
    .update({ status: "error", last_error: issue })
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("kind", "fitness")
    .select("id");
  return { ok: !error, found: Boolean(data?.length) };
}

export interface FitnessSourceStatus {
  provider: FitnessProvider;
  state: FitnessConnectionState;
  issue: FitnessIssue | null;
  lastSyncedAt: string | null;
}

/** Status of both health sources for one user (for the native apps). */
export async function fitnessStatus(db: DB, userId: string, now = new Date()): Promise<FitnessSourceStatus[] | null> {
  const { data, error } = await db
    .from("integration_connections")
    .select("provider, status, last_synced_at, last_error, created_at")
    .eq("user_id", userId)
    .eq("kind", "fitness");
  if (error) return null;
  return FITNESS_PROVIDERS.map((provider) => {
    const row = (data ?? []).find((r) => r.provider === provider) as (FitnessConnectionRow & { provider: string }) | undefined;
    return { provider, ...fitnessConnectionState(row ?? null, now), lastSyncedAt: row?.last_synced_at ?? null };
  });
}

export type IngestOutcome =
  | { ok: true; days: number; workouts: number; skipped: number }
  | { ok: false; reason: "not_connected" | "error" };

/** Idempotent upsert of one sync batch (keyed by day / provider workout id). */
export async function ingestFitness(admin: DB, userId: string, input: FitnessSyncInput, now = new Date()): Promise<IngestOutcome> {
  const { data: conn } = await admin
    .from("integration_connections")
    .select("id, status")
    .eq("user_id", userId)
    .eq("provider", input.provider)
    .eq("kind", "fitness")
    .maybeSingle();
  if (!conn || conn.status !== "connected") return { ok: false, reason: "not_connected" };
  const { data: profile } = await admin.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  const today = localDate((profile?.timezone as string | undefined) || "UTC", now);

  const days = input.days.filter((d) => withinAcceptedRange(d.date, today));
  const workouts = input.workouts.filter((w) => withinAcceptedRange(w.startedAt.slice(0, 10), today));
  const skipped = input.days.length - days.length + input.workouts.length - workouts.length;

  if (days.length) {
    const { error } = await admin.from("fitness_daily_summaries").upsert(
      days.map((d) => ({
        user_id: userId,
        connection_id: conn.id,
        provider: input.provider,
        summary_date: d.date,
        steps: d.steps ?? null,
        active_calories_kcal: d.activeCaloriesKcal ?? null,
        distance_m: d.distanceMeters ?? null,
        sleep_minutes: d.sleepMinutes ?? null,
      })),
      { onConflict: "user_id,provider,summary_date" },
    );
    if (error) return { ok: false, reason: "error" };
  }
  if (workouts.length) {
    const { error } = await admin.from("fitness_workouts").upsert(
      workouts.map((w) => ({
        user_id: userId,
        connection_id: conn.id,
        provider: input.provider,
        provider_workout_id: w.id,
        activity_type: w.activityType,
        started_at: w.startedAt,
        ended_at: w.endedAt,
        duration_minutes: Math.round((new Date(w.endedAt).getTime() - new Date(w.startedAt).getTime()) / 60_000),
        active_calories_kcal: w.activeCaloriesKcal ?? null,
        distance_m: w.distanceMeters ?? null,
      })),
      { onConflict: "user_id,provider,provider_workout_id" },
    );
    if (error) return { ok: false, reason: "error" };
  }
  await admin.from("integration_connections").update({ last_synced_at: now.toISOString(), last_error: null }).eq("id", conn.id);
  return { ok: true, days: days.length, workouts: workouts.length, skipped };
}

export interface FitnessSummary {
  sources: string[];
  from: string;
  to: string;
  days: { date: string; steps: number | null; activeCaloriesKcal: number | null; distanceKm: number | null; sleepHours: number | null }[];
  workouts: { date: string; type: string; minutes: number; distanceKm: number | null }[];
  totals: { workouts: number; workoutMinutes: number; avgSteps: number | null };
}

const km = (m: unknown) => (m == null ? null : Math.round(Number(m) / 100) / 10);

/**
 * Aggregated fitness data for the last `days` local days, or null when no
 * fitness source is connected. This is what the assistant may see — no raw
 * samples exist to share.
 */
export async function loadFitnessSummary(db: DB, userId: string, opts: { tz: string; today: string; days: number }): Promise<FitnessSummary | null> {
  const { data: conns, error } = await db
    .from("integration_connections")
    .select("provider")
    .eq("user_id", userId)
    .eq("kind", "fitness")
    .eq("status", "connected");
  if (error || !conns?.length) return null;
  const span = Math.max(1, Math.min(opts.days, 30));
  const from = addDays(opts.today, -(span - 1));
  const [{ data: dayRows }, { data: workoutRows }] = await Promise.all([
    db
      .from("fitness_daily_summaries")
      .select("summary_date, steps, active_calories_kcal, distance_m, sleep_minutes")
      .eq("user_id", userId)
      .gte("summary_date", from)
      .lte("summary_date", opts.today)
      .order("summary_date"),
    db
      .from("fitness_workouts")
      .select("activity_type, started_at, duration_minutes, distance_m")
      .eq("user_id", userId)
      .gte("started_at", new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000).toISOString())
      .order("started_at")
      .limit(200),
  ]);
  const pad = (n: number) => String(n).padStart(2, "0");
  const workouts = (workoutRows ?? [])
    .map((w) => {
      const p = zonedParts(new Date(w.started_at as string), opts.tz);
      return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, type: w.activity_type as string, minutes: Number(w.duration_minutes), distanceKm: km(w.distance_m) };
    })
    .filter((w) => w.date >= from && w.date <= opts.today);
  const days = (dayRows ?? []).map((d) => ({
    date: d.summary_date as string,
    steps: d.steps == null ? null : Number(d.steps),
    activeCaloriesKcal: d.active_calories_kcal == null ? null : Number(d.active_calories_kcal),
    distanceKm: km(d.distance_m),
    sleepHours: d.sleep_minutes == null ? null : Math.round((Number(d.sleep_minutes) / 60) * 10) / 10,
  }));
  const stepDays = days.filter((d) => d.steps != null);
  return {
    sources: conns.map((c) => PROVIDER_LABEL[c.provider as FitnessProvider]),
    from,
    to: opts.today,
    days,
    workouts,
    totals: {
      workouts: workouts.length,
      workoutMinutes: workouts.reduce((a, w) => a + w.minutes, 0),
      avgSteps: stepDays.length ? Math.round(stepDays.reduce((a, d) => a + (d.steps as number), 0) / stepDays.length) : null,
    },
  };
}
