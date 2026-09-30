import "server-only";
import { PERSONA_COLUMNS, type PersonalizationSource } from "@/lib/personalization";
import type { DB } from "@/lib/data/db";
import { localDate } from "@/lib/time";
import type { NotificationPreferences, Profile, Task } from "@/lib/types/domain";
import { deliverNotification } from "./service";
import { dueNotifications } from "./scheduler";

export interface DispatchSummary {
  usersChecked: number;
  due: number;
  sent: number;
  test: number;
  failed: number;
  skipped: number;
}

/**
 * Cron entry point: find consenting users and send whatever is due for them
 * right now in their own timezone.
 */
export async function runDispatch(admin: DB, now = new Date(), windowMinutes = 15): Promise<DispatchSummary> {
  const summary: DispatchSummary = { usersChecked: 0, due: 0, sent: 0, test: 0, failed: 0, skipped: 0 };

  const { data: prefsRows, error } = await admin
    .from("notification_preferences")
    .select("*")
    .eq("sms_enabled", true)
    .not("sms_consent_at", "is", null)
    .is("sms_opted_out_at", null)
    .limit(1000);
  if (error) throw new Error(`dispatch: ${error.message}`);
  if (!prefsRows?.length) return summary;

  const userIds = prefsRows.map((p) => p.user_id as string);
  const { data: profiles } = await admin
    .from("profiles")
    .select(`id, phone, phone_verified_at, timezone, display_name, ${PERSONA_COLUMNS}`)
    .in("id", userIds)
    .not("phone", "is", null);
  // (deliverNotification enforces REQUIRE_PHONE_VERIFICATION for each send.)
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p as Pick<Profile, "id" | "phone" | "timezone" | "display_name"> & PersonalizationSource]));

  for (const prefs of prefsRows as NotificationPreferences[]) {
    const profile = byId.get(prefs.user_id);
    if (!profile) continue;
    summary.usersChecked++;

    const today = localDate(profile.timezone || "UTC", now);
    const { data: tasks } = await admin
      .from("tasks")
      .select("id, title, scheduled_start, status, is_priority")
      .eq("user_id", prefs.user_id)
      .eq("task_date", today);

    const due = dueNotifications({
      now,
      windowMinutes,
      profile,
      prefs,
      todayTasks: (tasks ?? []).map((t) => ({ ...t, scheduled_start: t.scheduled_start ? String(t.scheduled_start).slice(0, 5) : null })) as Pick<
        Task,
        "id" | "title" | "scheduled_start" | "status" | "is_priority"
      >[],
    });

    for (const n of due) {
      summary.due++;
      const outcome = await deliverNotification(admin, {
        userId: prefs.user_id,
        kind: n.kind,
        body: n.body,
        dedupeKey: n.dedupeKey,
        relatedTaskId: n.relatedTaskId,
      });
      if (outcome.status === "sent") summary.sent++;
      else if (outcome.status === "test") summary.test++;
      else if (outcome.status === "failed") summary.failed++;
      else summary.skipped++;
    }
  }
  return summary;
}
