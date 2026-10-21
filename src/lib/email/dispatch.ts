import "server-only";
import type { DB } from "@/lib/data/db";
import { logWarn } from "@/lib/observability/log";
import { sendAccountabilityCheckIn, type CheckInDeps } from "./check-in";
import { dueEmailCheckIns, type EmailSchedulePrefs } from "./schedule";

export interface EmailDispatchSummary {
  usersChecked: number;
  due: number;
  sent: number;
  test: number;
  failed: number;
  skipped: number;
  duplicate: number;
}

export interface EmailDispatchOptions {
  catchUpMinutes?: number;
  /** Safety cap per run; the scheduler runs again soon for anyone left over. */
  maxUsers?: number;
  /** Limit the run to these users (tests; the cron route never sets it). */
  userIds?: string[];
}

const SCHEDULE_COLUMNS =
  "user_id, email_enabled, quiet_hours_start, quiet_hours_end, email_morning_enabled, email_morning_time, email_afternoon_enabled, email_afternoon_time, email_evening_enabled, email_evening_time";

/**
 * Cron entry point for scheduled email check-ins. Finds users with email
 * check-ins on, works out which of their slots are due in their own timezone
 * (see ./schedule.ts), and sends each through the regular check-in path —
 * which re-checks eligibility (opted in, confirmed email, not a demo), the
 * daily cap and the dedupe key. Safe to run as often as you like, and
 * concurrently: the unique (user_id, dedupe_key) on email_outbound means a
 * slot is recorded and sent at most once, even if two runs race.
 */
export async function runEmailDispatch(admin: DB, now = new Date(), opts: EmailDispatchOptions = {}, deps: CheckInDeps = {}): Promise<EmailDispatchSummary> {
  const summary: EmailDispatchSummary = { usersChecked: 0, due: 0, sent: 0, test: 0, failed: 0, skipped: 0, duplicate: 0 };

  let query = admin.from("notification_preferences").select(SCHEDULE_COLUMNS).eq("email_enabled", true);
  if (opts.userIds) query = query.in("user_id", opts.userIds);
  const { data: prefsRows, error } = await query.limit(opts.maxUsers ?? 500);
  if (error) throw new Error(`email dispatch: ${error.message}`);
  if (!prefsRows?.length) return summary;

  const userIds = prefsRows.map((p) => p.user_id as string);
  const { data: profiles } = await admin.from("profiles").select("id, timezone").in("id", userIds);
  const timezoneById = new Map((profiles ?? []).map((p) => [p.id as string, (p.timezone as string | null) ?? null]));

  for (const prefs of prefsRows as (EmailSchedulePrefs & { user_id: string })[]) {
    if (!timezoneById.has(prefs.user_id)) continue;
    summary.usersChecked++;
    const due = dueEmailCheckIns({ now, timezone: timezoneById.get(prefs.user_id), prefs, catchUpMinutes: opts.catchUpMinutes });

    for (const slot of due) {
      summary.due++;
      // Cheap pre-check so a slot that already went out doesn't cost a model call.
      // The unique key still decides if two runs get past this at the same time.
      const { data: existing } = await admin
        .from("email_outbound")
        .select("id")
        .eq("user_id", prefs.user_id)
        .eq("dedupe_key", slot.dedupeKey)
        .maybeSingle();
      if (existing) {
        summary.duplicate++;
        continue;
      }
      try {
        const outcome = await sendAccountabilityCheckIn(admin, prefs.user_id, { kind: "check_in", reason: slot.reason, dedupeKey: slot.dedupeKey }, deps);
        summary[outcome.status]++;
      } catch (err) {
        summary.failed++;
        logWarn("email", "scheduled check-in failed", { slot: slot.slot, error: (err as Error).message });
      }
    }
  }
  return summary;
}
