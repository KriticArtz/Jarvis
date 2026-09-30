import type { DB } from "@/lib/data/db";
import { addDays, zonedTimeToUtc } from "@/lib/time";
import { PROVIDER_LABEL, type IntegrationProvider } from "../connections";
import { groupByLocalDay, type CalendarDay, type CalendarEventRow } from "./local";
import { CALENDAR_SYNC_DAYS } from "./types";
import { hasCalendarWriteAccess } from "./scopes";

export interface CalendarContext {
  provider: string;
  lastSyncedAt: string | null;
  days: CalendarDay[];
  /** True when the grant allows creating/changing events (calendar.events scope). */
  writable: boolean;
}

const EVENT_COLUMNS = "id, title, starts_at, ends_at, all_day, start_date, end_date, location, status, is_busy, color_id, recurring_event_id, is_organizer, attendee_count";

/**
 * The user's calendar for `days` local days starting `from`, or null when no
 * calendar is connected (or it needs reconnecting — stale data isn't used).
 * Read-only; works with the user's session client (RLS) or the service role
 * (explicit user filter). Safe before the integrations migration exists.
 */
export async function loadCalendar(db: DB, userId: string, opts: { tz: string; from: string; days: number }): Promise<CalendarContext | null> {
  const { data: conns, error } = await db
    .from("integration_connections")
    .select("provider, status, last_synced_at, scopes")
    .eq("user_id", userId)
    .eq("kind", "calendar")
    .eq("status", "connected");
  if (error || !conns?.length) return null;
  const days = Math.max(1, Math.min(opts.days, CALENDAR_SYNC_DAYS));
  const start = zonedTimeToUtc(opts.from, "00:00", opts.tz).toISOString();
  const end = zonedTimeToUtc(addDays(opts.from, days), "00:00", opts.tz).toISOString();
  const { data: rows } = await db
    .from("calendar_events")
    .select(EVENT_COLUMNS)
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .lt("starts_at", end)
    .gt("ends_at", start)
    .order("starts_at")
    .limit(300);
  const latest = conns.map((c) => c.last_synced_at as string | null).sort().at(-1) ?? null;
  return {
    provider: conns.map((c) => PROVIDER_LABEL[c.provider as IntegrationProvider] ?? String(c.provider)).join(", "),
    lastSyncedAt: latest,
    days: groupByLocalDay((rows ?? []) as CalendarEventRow[], opts.tz, opts.from, days),
    writable: conns.some((c) => hasCalendarWriteAccess((c.scopes as string[] | null) ?? [])),
  };
}
