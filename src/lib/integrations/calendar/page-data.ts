import "server-only";
import type { DB } from "@/lib/data/db";
import { addDays, zonedTimeToUtc } from "@/lib/time";
import { createAdminClient } from "@/lib/supabase/admin";
import { logWarn } from "@/lib/observability/log";
import { groupByLocalDay, type CalendarDay, type CalendarEventRow } from "./local";
import { hasCalendarWriteAccess } from "./scopes";
import { PROVIDER, syncGoogleCalendar } from "./sync";
import { CALENDAR_SYNC_DAYS } from "./types";

export type CalendarPageState = "not_connected" | "reauth_required" | "read_only" | "writable";

export interface CalendarPageData {
  state: CalendarPageState;
  lastSyncedAt: string | null;
  days: CalendarDay[];
}

const COLUMNS = "id, title, starts_at, ends_at, all_day, start_date, end_date, location, status, is_busy, color_id, recurring_event_id, is_organizer, attendee_count";

/**
 * Events for the Calendar page (`days` local days from `from`), read with the
 * user's session client (RLS + explicit user filter). Tokens never leave the
 * server; the page only gets titles, times and small metadata.
 *
 * The regular background sync covers today + CALENDAR_SYNC_DAYS. When the
 * page shows dates outside that window (past weeks, later months) and the
 * connection is healthy, that range is pulled from Google first so the page
 * is accurate. Demo users never reach Google.
 */
export async function loadCalendarPage(
  db: DB,
  userId: string,
  opts: { tz: string; today: string; from: string; days: number; isDemo: boolean },
): Promise<CalendarPageData> {
  const { data: conn } = await db
    .from("integration_connections")
    .select("status, scopes, last_synced_at")
    .eq("user_id", userId)
    .eq("provider", PROVIDER)
    .maybeSingle();

  const state: CalendarPageState = !conn
    ? "not_connected"
    : conn.status !== "connected"
      ? "reauth_required"
      : hasCalendarWriteAccess((conn.scopes as string[] | null) ?? [])
        ? "writable"
        : "read_only";

  if (!conn) return { state, lastSyncedAt: null, days: groupByLocalDay([], opts.tz, opts.from, opts.days) };

  const end = addDays(opts.from, opts.days);
  const outsideWindow = opts.from < opts.today || end > addDays(opts.today, CALENDAR_SYNC_DAYS);
  if (outsideWindow && conn.status === "connected" && !opts.isDemo) {
    const admin = createAdminClient();
    if (admin) {
      const res = await syncGoogleCalendar(admin, userId, {}, { from: opts.from, days: opts.days }).catch(() => null);
      if (!res?.ok) logWarn("integrations", "calendar range sync skipped", { userId, reason: res && !res.ok ? res.reason : "exception" });
    }
  }

  const { data: rows } = await db
    .from("calendar_events")
    .select(COLUMNS)
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .lt("starts_at", zonedTimeToUtc(end, "00:00", opts.tz).toISOString())
    .gt("ends_at", zonedTimeToUtc(opts.from, "00:00", opts.tz).toISOString())
    .order("starts_at")
    .limit(600);

  // A range sync may have just changed the connection (e.g. revoked access).
  const { data: fresh } = await db.from("integration_connections").select("status, last_synced_at").eq("user_id", userId).eq("provider", PROVIDER).maybeSingle();
  return {
    state: fresh && fresh.status !== "connected" ? "reauth_required" : state,
    lastSyncedAt: (fresh?.last_synced_at as string | null | undefined) ?? (conn.last_synced_at as string | null),
    days: groupByLocalDay((rows ?? []) as CalendarEventRow[], opts.tz, opts.from, opts.days),
  };
}
