import "server-only";
import type { DB } from "@/lib/data/db";
import { logInfo, logWarn } from "@/lib/observability/log";
import {
  deleteEvent,
  eventIdFor,
  getEvent,
  insertEvent,
  normalizeGoogleEvent,
  patchEvent,
  toGoogleEventBody,
  type EventWriteInput,
  type GoogleEvent,
  type WriteFailure,
  type WriteResult,
} from "./google";
import { hasCalendarWriteAccess } from "./scopes";
import { accessToken, CALENDAR_ID, eventRow, loadConnection, markNeedsReconnect, PROVIDER, resolve, type IntegrationDeps } from "./sync";

/**
 * Calendar writes (create / update / reschedule / delete) and on-demand event
 * details. Every function takes the user id from the caller's authenticated
 * session and only ever touches that user's connection and events:
 *  - the event is looked up by our own id AND user_id (explicit filter, in
 *    addition to RLS on user-facing reads), so another user's event id is
 *    simply "not found";
 *  - only events the user organizes can be changed;
 *  - tokens are decrypted server-side and never returned or logged;
 *  - a Phase 1 read-only grant can't write (needs_write_access).
 * `admin` is the service-role client (calendar_events is server-written).
 * Confirmation for assistant-initiated changes happens BEFORE these run (see
 * the calendar tools); UI changes are explicit user actions.
 */

export type CalendarWriteError =
  | "not_configured"
  | "not_connected"
  | "needs_write_access"
  | "reauth_required"
  | "not_found"
  | "not_editable"
  | "error";

export const WRITE_ERROR_MESSAGE: Record<CalendarWriteError, string> = {
  not_configured: "Calendar isn't configured on this server yet.",
  not_connected: "Google Calendar isn't connected. Connect it in Settings.",
  needs_write_access: "Google Calendar is connected read-only. Reconnect it in Settings and allow editing to make changes.",
  reauth_required: "Google access was revoked or expired. Reconnect Google Calendar in Settings.",
  not_found: "That event doesn't exist anymore — it may have been deleted in Google Calendar.",
  not_editable: "That event belongs to someone else's invitation, so it can only be changed by the organizer.",
  error: "Google Calendar didn't accept that change. Please try again in a moment.",
};

export interface StoredEvent {
  id: string;
  provider_event_id: string;
  calendar_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  start_date: string | null;
  end_date: string | null;
  timezone: string | null;
  location: string | null;
  status: "confirmed" | "tentative" | "cancelled";
  is_busy: boolean;
  color_id: string | null;
  recurring_event_id: string | null;
  is_organizer: boolean;
  attendee_count: number;
}

export const STORED_EVENT_COLUMNS =
  "id, provider_event_id, calendar_id, title, starts_at, ends_at, all_day, start_date, end_date, timezone, location, status, is_busy, color_id, recurring_event_id, is_organizer, attendee_count";

/** One of the user's own (non-cancelled) events by our id, or null. */
export async function loadOwnEvent(db: DB, userId: string, id: string): Promise<StoredEvent | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db
    .from("calendar_events")
    .select(STORED_EVENT_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .eq("provider", PROVIDER)
    .neq("status", "cancelled")
    .maybeSingle();
  return (data as StoredEvent | null) ?? null;
}

type Outcome<T> = ({ ok: true } & T) | { ok: false; reason: CalendarWriteError };

/**
 * Run a Google call with the user's token: refresh once on 401, mark the
 * connection for reconnection when access is gone, and require the write
 * scope when `write` is set.
 */
async function withGoogle<T extends { ok: boolean }>(
  admin: DB,
  userId: string,
  deps: IntegrationDeps,
  opts: { write: boolean },
  run: (token: string, connectionId: string) => Promise<T | { ok: false; reason: WriteFailure; httpStatus: number | null }>,
): Promise<{ ok: true; value: T; connectionId: string } | { ok: false; reason: CalendarWriteError; failure?: WriteFailure }> {
  const r = resolve(deps);
  if (!r.key || !r.config) return { ok: false, reason: "not_configured" };
  const conn = await loadConnection(admin, userId);
  if (!conn) return { ok: false, reason: "not_connected" };
  if (conn.status !== "connected") return { ok: false, reason: "reauth_required" };
  if (opts.write && !hasCalendarWriteAccess(conn.scopes ?? [])) return { ok: false, reason: "needs_write_access" };

  let token = await accessToken(admin, userId, conn.id, r);
  if (!token.ok) {
    if (token.reason === "reauth_required") await markNeedsReconnect(admin, conn.id);
    return { ok: false, reason: token.reason === "not_configured" ? "not_configured" : token.reason === "reauth_required" ? "reauth_required" : "error" };
  }
  let res = await run(token.token, conn.id);
  if (!res.ok && "reason" in res && res.reason === "unauthorized") {
    token = await accessToken(admin, userId, conn.id, r, true);
    if (token.ok) res = await run(token.token, conn.id);
    if (!token.ok || (!res.ok && "reason" in res && res.reason === "unauthorized")) {
      await markNeedsReconnect(admin, conn.id);
      return { ok: false, reason: "reauth_required" };
    }
  }
  if (!res.ok && "reason" in res) {
    const failure = res.reason as WriteFailure;
    if (failure === "insufficient_scope") {
      // Google says this grant can't write: record it so the UI offers "Reconnect to enable editing".
      await admin.from("integration_connections").update({ scopes: (conn.scopes ?? []).filter((s) => !s.endsWith("/calendar.events")) }).eq("id", conn.id);
      return { ok: false, reason: "needs_write_access", failure };
    }
    logWarn("integrations", "google calendar request failed", { userId, failure, httpStatus: (res as { httpStatus?: number | null }).httpStatus ?? null });
    return { ok: false, reason: failure === "not_found" ? "not_found" : failure === "forbidden" ? "not_editable" : "error", failure };
  }
  return { ok: true, value: res as T, connectionId: conn.id };
}

async function storeFromGoogle(admin: DB, userId: string, connectionId: string, event: GoogleEvent, tz: string): Promise<StoredEvent | null> {
  const n = normalizeGoogleEvent(event, CALENDAR_ID, tz);
  if (!n || n.kind !== "event") return null;
  const { data } = await admin
    .from("calendar_events")
    .upsert(eventRow(n.event, userId, connectionId, new Date().toISOString()), { onConflict: "user_id,provider,calendar_id,provider_event_id" })
    .select(STORED_EVENT_COLUMNS)
    .single();
  return (data as StoredEvent | null) ?? null;
}

async function userTimezone(admin: DB, userId: string): Promise<string> {
  const { data } = await admin.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  return (data?.timezone as string | undefined) || "UTC";
}

export interface CreateEventInput extends EventWriteInput {
  title: string;
  times: NonNullable<EventWriteInput["times"]>;
}

/**
 * Create an event. `idempotencyKey` (e.g. the confirmed proposal id or a plan
 * item) derives the Google event id, so repeating the same create is a no-op.
 */
export async function createCalendarEvent(
  admin: DB,
  userId: string,
  input: CreateEventInput,
  opts: { idempotencyKey: string },
  deps: IntegrationDeps = {},
): Promise<Outcome<{ event: StoredEvent }>> {
  const tz = await userTimezone(admin, userId);
  const googleId = await eventIdFor(`${userId}:${opts.idempotencyKey}`);
  const res = await withGoogle(admin, userId, deps, { write: true }, async (token) => {
    const inserted = await insertEvent(token, CALENDAR_ID, toGoogleEventBody(input, { forInsert: true, id: googleId }), resolve(deps).fetch);
    // Already created by an earlier attempt: return that event instead of a duplicate.
    if (!inserted.ok && inserted.reason === "conflict") return getEvent(token, CALENDAR_ID, googleId, resolve(deps).fetch);
    return inserted;
  });
  if (!res.ok) return { ok: false, reason: res.reason };
  const stored = await storeFromGoogle(admin, userId, res.connectionId, (res.value as Extract<WriteResult, { ok: true }>).event, tz);
  if (!stored) return { ok: false, reason: "error" };
  logInfo("integrations", "calendar event created", { userId });
  return { ok: true, event: stored };
}

/** Update fields and/or times of one of the user's own events (a single occurrence for recurring events). */
export async function updateCalendarEvent(admin: DB, userId: string, id: string, patch: EventWriteInput, deps: IntegrationDeps = {}): Promise<Outcome<{ event: StoredEvent; before: StoredEvent }>> {
  const before = await loadOwnEvent(admin, userId, id);
  if (!before) return { ok: false, reason: "not_found" };
  if (!before.is_organizer) return { ok: false, reason: "not_editable" };
  const tz = await userTimezone(admin, userId);
  const res = await withGoogle(admin, userId, deps, { write: true }, (token) => patchEvent(token, before.calendar_id, before.provider_event_id, toGoogleEventBody(patch), resolve(deps).fetch));
  if (!res.ok) {
    // Deleted in Google since the last sync: drop our stale copy.
    if (res.reason === "not_found") await admin.from("calendar_events").delete().eq("id", id).eq("user_id", userId);
    return { ok: false, reason: res.reason };
  }
  const stored = await storeFromGoogle(admin, userId, res.connectionId, (res.value as Extract<WriteResult, { ok: true }>).event, tz);
  if (!stored) return { ok: false, reason: "error" };
  logInfo("integrations", "calendar event updated", { userId });
  return { ok: true, event: stored, before };
}

/** Delete (cancel) one of the user's own events. Already-deleted counts as done. */
export async function deleteCalendarEvent(admin: DB, userId: string, id: string, deps: IntegrationDeps = {}): Promise<Outcome<{ event: StoredEvent }>> {
  const ev = await loadOwnEvent(admin, userId, id);
  if (!ev) return { ok: false, reason: "not_found" };
  if (!ev.is_organizer) return { ok: false, reason: "not_editable" };
  const res = await withGoogle(admin, userId, deps, { write: true }, (token) => deleteEvent(token, ev.calendar_id, ev.provider_event_id, resolve(deps).fetch));
  if (!res.ok) return { ok: false, reason: res.reason };
  await admin.from("calendar_events").delete().eq("id", id).eq("user_id", userId);
  logInfo("integrations", "calendar event deleted", { userId });
  return { ok: true, event: ev };
}

export interface EventDetails {
  description: string | null;
  attendees: { name: string; responseStatus: string | null; organizer: boolean; self: boolean }[];
  organizer: string | null;
  htmlLink: string | null;
  recurring: boolean;
}

/** Strip markup from Google's (HTML) descriptions; the UI renders plain text only. */
export function plainText(html: string | undefined, max = 4000): string | null {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? text.slice(0, max) : null;
}

/**
 * Description, guests and link for one event, fetched from Google when the
 * user opens it (never stored). Works with a read-only grant.
 */
export async function getCalendarEventDetails(admin: DB, userId: string, id: string, deps: IntegrationDeps = {}): Promise<Outcome<{ event: StoredEvent; details: EventDetails }>> {
  const ev = await loadOwnEvent(admin, userId, id);
  if (!ev) return { ok: false, reason: "not_found" };
  const res = await withGoogle(admin, userId, deps, { write: false }, (token) => getEvent(token, ev.calendar_id, ev.provider_event_id, resolve(deps).fetch));
  if (!res.ok) {
    if (res.reason === "not_found") await admin.from("calendar_events").delete().eq("id", id).eq("user_id", userId);
    return { ok: false, reason: res.reason };
  }
  const g = (res.value as Extract<WriteResult, { ok: true }>).event;
  const htmlLink = g.htmlLink && /^https:\/\/(www\.)?google\.com\/calendar\//.test(g.htmlLink) ? g.htmlLink : null;
  return {
    ok: true,
    event: ev,
    details: {
      description: plainText(g.description),
      attendees: (g.attendees ?? [])
        .filter((a) => !a.resource)
        .slice(0, 50)
        .map((a) => ({ name: (a.displayName || a.email || "Guest").slice(0, 120), responseStatus: a.responseStatus ?? null, organizer: Boolean(a.organizer), self: Boolean(a.self) })),
      organizer: g.organizer?.self ? "You" : (g.organizer?.displayName || g.organizer?.email || null),
      htmlLink,
      recurring: Boolean(g.recurringEventId || g.recurrence?.length),
    },
  };
}

/** Can this user write to their connected calendar right now? (For UI and tools.) */
export async function calendarWriteState(db: DB, userId: string): Promise<"not_connected" | "reauth_required" | "read_only" | "writable"> {
  const { data } = await db.from("integration_connections").select("status, scopes").eq("user_id", userId).eq("provider", PROVIDER).maybeSingle();
  if (!data) return "not_connected";
  if (data.status !== "connected") return "reauth_required";
  return hasCalendarWriteAccess((data.scopes as string[] | null) ?? []) ? "writable" : "read_only";
}
