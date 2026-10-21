import type { NotificationPreferences } from "@/lib/types/domain";
import { inQuietHours } from "@/lib/notifications/scheduler";
import { addDays, isValidTimeZone, localDate, localMinutesNow, timeToMinutes } from "@/lib/time";

/**
 * Pure scheduling rules for automated email check-ins (unit-tested; no I/O).
 *
 * Each enabled slot (morning / afternoon / evening) is due once per local day,
 * at the user's chosen time in their own timezone. A slot stays due for
 * `catchUpMinutes` after its time, so a late or skipped scheduler run still
 * sends it; the per-day dedupe key ("check_in:<slot's local date>:<slot>")
 * makes every later run, retry or overlapping run a no-op. Nothing is due
 * during quiet hours, or when email check-ins are off.
 */

export type EmailSlot = "morning" | "afternoon" | "evening";

export const EMAIL_SLOTS: readonly EmailSlot[] = ["morning", "afternoon", "evening"];

/** How long after its time a slot may still be sent (covers late or missed scheduler runs). */
export const DEFAULT_CATCH_UP_MINUTES = 60;

/** What each check-in is about; steers the drafted email (server-provided only). */
export const SLOT_REASON: Record<EmailSlot, string> = {
  morning: "Morning check-in: help them start the day: their plan and top priority for today",
  afternoon: "Afternoon check-in: how the plan is going so far, and what is next for the rest of the day",
  evening: "Evening wrap-up: what got done today, acknowledge progress, and what should carry over to tomorrow",
};

export type EmailSchedulePrefs = Pick<
  NotificationPreferences,
  | "email_enabled"
  | "quiet_hours_start"
  | "quiet_hours_end"
  | "email_morning_enabled"
  | "email_morning_time"
  | "email_afternoon_enabled"
  | "email_afternoon_time"
  | "email_evening_enabled"
  | "email_evening_time"
>;

export interface DueEmailCheckIn {
  slot: EmailSlot;
  /** The user's local date the slot belongs to (YYYY-MM-DD). */
  date: string;
  dedupeKey: string;
  reason: string;
}

export function emailCheckInDedupeKey(date: string, slot: EmailSlot): string {
  return `check_in:${date}:${slot}`;
}

function slotSetting(prefs: EmailSchedulePrefs, slot: EmailSlot): { enabled: boolean; time: string | null } {
  switch (slot) {
    case "morning":
      return { enabled: prefs.email_morning_enabled, time: prefs.email_morning_time };
    case "afternoon":
      return { enabled: prefs.email_afternoon_enabled, time: prefs.email_afternoon_time };
    case "evening":
      return { enabled: prefs.email_evening_enabled, time: prefs.email_evening_time };
  }
}

export function dueEmailCheckIns(input: {
  now: Date;
  timezone: string | null | undefined;
  prefs: EmailSchedulePrefs;
  catchUpMinutes?: number;
}): DueEmailCheckIn[] {
  const { prefs, now } = input;
  if (!prefs.email_enabled) return [];
  const tz = input.timezone && isValidTimeZone(input.timezone) ? input.timezone : "UTC";
  const catchUp = Math.max(1, Math.min(input.catchUpMinutes ?? DEFAULT_CATCH_UP_MINUTES, 180));
  const nowMin = localMinutesNow(tz, now);
  if (inQuietHours(nowMin, prefs.quiet_hours_start, prefs.quiet_hours_end)) return [];

  const today = localDate(tz, now);
  const out: DueEmailCheckIn[] = [];
  for (const slot of EMAIL_SLOTS) {
    const { enabled, time } = slotSetting(prefs, slot);
    if (!enabled || !time) continue;
    const slotMin = timeToMinutes(time.slice(0, 5));
    // Minutes since the slot's most recent occurrence (yesterday's, if it's later in the day than now).
    const sinceToday = nowMin - slotMin;
    const since = sinceToday >= 0 ? sinceToday : sinceToday + 1440;
    if (since >= catchUp) continue;
    const date = sinceToday >= 0 ? today : addDays(today, -1);
    out.push({ slot, date, dedupeKey: emailCheckInDedupeKey(date, slot), reason: SLOT_REASON[slot] });
  }
  return out;
}
