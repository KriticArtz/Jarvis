import type { NotificationKind, NotificationPreferences, Profile, Task } from "@/lib/types/domain";
import { localDate, localMinutesNow, timeToMinutes } from "@/lib/time";
import { eveningMessage, morningMessage, taskReminderMessage } from "./templates";

export interface DueNotification {
  kind: NotificationKind;
  body: string;
  dedupeKey: string;
  relatedTaskId: string | null;
}

/** Is `minute` within quiet hours (which may wrap past midnight)? */
export function inQuietHours(minute: number, start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === e) return false;
  return s < e ? minute >= s && minute < e : minute >= s || minute < e;
}

/** true if `target` falls in the half-open window (from, to], handling midnight wrap. */
function inWindow(target: number, from: number, to: number): boolean {
  if (from < 0) return target > from + 1440 || target <= to;
  if (to >= 1440) return target > from || target <= to - 1440;
  return target > from && target <= to;
}

/**
 * Pure scheduling rules for proactive messages. The cron dispatcher calls
 * this every `windowMinutes` for each consenting user; dedupe keys make
 * repeated or overlapping runs safe.
 *
 *  - Morning check-in at the user's chosen local time
 *  - Task reminders shortly before a planned, timed priority task
 *  - Evening check-in at the user's chosen local time
 *  - Nothing during quiet hours
 */
export function dueNotifications(input: {
  now: Date;
  windowMinutes: number;
  profile: Pick<Profile, "timezone" | "display_name" | "accountability_style">;
  prefs: NotificationPreferences;
  todayTasks: Pick<Task, "id" | "title" | "scheduled_start" | "status" | "is_priority">[];
}): DueNotification[] {
  const { profile, prefs, windowMinutes } = input;
  const tz = profile.timezone || "UTC";
  const today = localDate(tz, input.now);
  const nowMin = localMinutesNow(tz, input.now);
  const out: DueNotification[] = [];

  if (inQuietHours(nowMin, prefs.quiet_hours_start, prefs.quiet_hours_end)) return out;

  if (prefs.morning_checkin_enabled && inWindow(timeToMinutes(prefs.morning_checkin_time), nowMin - windowMinutes, nowMin)) {
    out.push({
      kind: "morning_checkin",
      body: morningMessage(profile.display_name, profile.accountability_style),
      dedupeKey: `morning:${today}`,
      relatedTaskId: null,
    });
  }

  if (prefs.task_reminders_enabled) {
    for (const t of input.todayTasks) {
      if (t.status !== "pending" || !t.is_priority || !t.scheduled_start) continue;
      const start = timeToMinutes(t.scheduled_start);
      // Remind when the task starts within the next window.
      if (start > nowMin && start <= nowMin + windowMinutes) {
        out.push({
          kind: "task_reminder",
          body: taskReminderMessage(t.title, t.scheduled_start, profile.accountability_style),
          dedupeKey: `task:${t.id}`,
          relatedTaskId: t.id,
        });
      }
    }
  }

  if (prefs.evening_checkin_enabled && inWindow(timeToMinutes(prefs.evening_checkin_time), nowMin - windowMinutes, nowMin)) {
    const planned = input.todayTasks.filter((t) => t.status !== "skipped").length;
    const completed = input.todayTasks.filter((t) => t.status === "done").length;
    out.push({
      kind: "evening_checkin",
      body: eveningMessage(completed, planned, profile.accountability_style),
      dedupeKey: `evening:${today}`,
      relatedTaskId: null,
    });
  }

  return out;
}

/**
 * A user may receive SMS only with a phone, explicit consent, and no opt-out —
 * and, when phone verification is required, a verified number.
 */
export function canReceiveSms(
  profile: Pick<Profile, "phone"> & Partial<Pick<Profile, "phone_verified_at">>,
  prefs: Pick<NotificationPreferences, "sms_enabled" | "sms_consent_at" | "sms_opted_out_at"> | null,
  opts: { requireVerified?: boolean } = {},
): boolean {
  if (opts.requireVerified && !profile.phone_verified_at) return false;
  return Boolean(profile.phone && prefs?.sms_enabled && prefs.sms_consent_at && !prefs.sms_opted_out_at);
}
