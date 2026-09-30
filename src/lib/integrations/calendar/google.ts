import "server-only";
import { googleTestBaseUrl, type GoogleOAuthConfig } from "@/lib/env";
import { zonedTimeToUtc } from "@/lib/time";
import type { CalendarEventStatus, NormalizedCalendarEvent } from "./types";

/**
 * Google Calendar over plain REST (no SDK), on the user's primary calendar.
 *
 * Scopes: new connections request `calendar.events` — read and write EVENTS
 * only (no calendar settings, sharing/ACLs or calendar management). Phase 1
 * connections granted `calendar.events.readonly`; those keep syncing, and
 * writing asks the user to reconnect (see hasCalendarWriteAccess).
 */
import { GOOGLE_CALENDAR_EVENTS_SCOPE } from "./scopes";
export { GOOGLE_CALENDAR_EVENTS_SCOPE, GOOGLE_CALENDAR_READONLY_SCOPE } from "./scopes";
/** The scope requested when connecting (read + write events). */
export const GOOGLE_CALENDAR_SCOPE = GOOGLE_CALENDAR_EVENTS_SCOPE;

type Fetch = typeof fetch;

function endpoints() {
  const test = googleTestBaseUrl();
  return {
    authorize: test ? `${test}/o/oauth2/v2/auth` : "https://accounts.google.com/o/oauth2/v2/auth",
    token: test ? `${test}/token` : "https://oauth2.googleapis.com/token",
    revoke: test ? `${test}/revoke` : "https://oauth2.googleapis.com/revoke",
    calendar: test ? `${test}/calendar/v3` : "https://www.googleapis.com/calendar/v3",
  };
}

export function buildAuthorizeUrl(cfg: GoogleOAuthConfig, opts: { redirectUri: string; state: string; codeChallenge: string }): string {
  const url = new URL(endpoints().authorize);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: "offline", // refresh token for background sync
    prompt: "consent", // always return a refresh token, even on reconnect
    include_granted_scopes: "false",
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scopes: string[];
}

/**
 * Why a token request failed, safe to log: HTTP status and Google's error code
 * and description (e.g. "invalid_client", "Malformed auth code."). Never the
 * request body, code, secret or tokens.
 */
export interface TokenFailureDetail {
  httpStatus: number | null;
  googleError: string | null;
  googleErrorDescription: string | null;
  missingAccess?: boolean;
  network?: boolean;
}

export type TokenResult = { ok: true; tokens: GoogleTokens } | { ok: false; reason: "invalid_grant" | "error"; detail: TokenFailureDetail };

async function tokenRequest(params: Record<string, string>, fetchImpl: Fetch, now: number): Promise<TokenResult> {
  try {
    const res = await fetchImpl(endpoints().token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });
    const json = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !json.access_token) {
      return {
        ok: false,
        reason: json.error === "invalid_grant" ? "invalid_grant" : "error",
        detail: {
          httpStatus: res.status,
          googleError: typeof json.error === "string" ? json.error.slice(0, 100) : null,
          googleErrorDescription: typeof json.error_description === "string" ? json.error_description.slice(0, 200) : null,
          missingAccess: res.ok && !json.access_token,
        },
      };
    }
    return {
      ok: true,
      tokens: {
        accessToken: json.access_token,
        refreshToken: json.refresh_token ?? null,
        expiresAt: new Date(now + Math.max(60, json.expires_in ?? 3600) * 1000).toISOString(),
        scopes: (json.scope ?? "").split(" ").filter(Boolean),
      },
    };
  } catch {
    return { ok: false, reason: "error", detail: { httpStatus: null, googleError: null, googleErrorDescription: null, network: true } };
  }
}

export function exchangeCode(cfg: GoogleOAuthConfig, opts: { code: string; codeVerifier: string; redirectUri: string }, fetchImpl: Fetch = fetch, now = Date.now()) {
  return tokenRequest(
    { grant_type: "authorization_code", code: opts.code, code_verifier: opts.codeVerifier, redirect_uri: opts.redirectUri, client_id: cfg.clientId, client_secret: cfg.clientSecret },
    fetchImpl,
    now,
  );
}

export function refreshAccessToken(cfg: GoogleOAuthConfig, refreshToken: string, fetchImpl: Fetch = fetch, now = Date.now()) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret }, fetchImpl, now);
}

/** Best-effort revocation at Google (disconnect / account deletion). */
export async function revokeToken(token: string, fetchImpl: Fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(endpoints().revoke, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

interface GoogleEventDate {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GoogleAttendee {
  email?: string;
  displayName?: string;
  responseStatus?: string;
  self?: boolean;
  organizer?: boolean;
  resource?: boolean;
}

export interface GoogleEvent {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  transparency?: string;
  colorId?: string;
  recurringEventId?: string;
  recurrence?: string[];
  htmlLink?: string;
  organizer?: { email?: string; displayName?: string; self?: boolean };
  attendees?: GoogleAttendee[];
  start?: GoogleEventDate;
  end?: GoogleEventDate;
}

export type NormalizedOrCancelled = { kind: "event"; event: NormalizedCalendarEvent } | { kind: "cancelled"; providerEventId: string };

/**
 * Map one Google event to the normalized model. Only what the app needs to
 * store is kept: no description, attendee names/emails, links or
 * conferencing data (those are fetched on demand when an event is opened).
 */
export function normalizeGoogleEvent(e: GoogleEvent, calendarId: string, fallbackTz: string): NormalizedOrCancelled | null {
  if (!e.id) return null;
  const status: CalendarEventStatus = e.status === "cancelled" ? "cancelled" : e.status === "tentative" ? "tentative" : "confirmed";
  const start = e.start;
  const end = e.end;
  if (!start || !end || (!start.date && !start.dateTime)) {
    // Deleted instances often come back with only an id and status.
    return status === "cancelled" ? { kind: "cancelled", providerEventId: e.id } : null;
  }
  const timezone = start.timeZone ?? fallbackTz;
  const allDay = Boolean(start.date);
  let startsAt: Date;
  let endsAt: Date;
  if (allDay) {
    startsAt = zonedTimeToUtc(start.date as string, "00:00", timezone);
    endsAt = zonedTimeToUtc(end.date ?? (start.date as string), "00:00", timezone);
  } else {
    startsAt = new Date(start.dateTime as string);
    endsAt = new Date(end.dateTime ?? (start.dateTime as string));
  }
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return null;
  if (endsAt < startsAt) endsAt = startsAt;
  return {
    kind: "event",
    event: {
      providerEventId: e.id.slice(0, 1024),
      calendarId,
      title: (e.summary?.trim() || "Busy").slice(0, 300),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      allDay,
      startDate: allDay ? (start.date as string) : null,
      endDate: allDay ? (end.date ?? null) : null,
      timezone: timezone.slice(0, 64),
      location: e.location?.trim().slice(0, 300) || null,
      status,
      isBusy: e.transparency !== "transparent",
      colorId: e.colorId && /^\d{1,2}$/.test(e.colorId) ? e.colorId : null,
      recurringEventId: e.recurringEventId ? e.recurringEventId.slice(0, 1024) : null,
      // Missing organizer info = the user's own event (e.g. created on their primary calendar).
      isOrganizer: e.organizer?.self !== false,
      attendeeCount: Math.min(10000, (e.attendees ?? []).filter((a) => !a.self && !a.resource).length),
    },
  };
}

export type ListResult =
  | { ok: true; items: NormalizedOrCancelled[]; complete: boolean }
  | { ok: false; reason: "unauthorized" | "error" };

const MAX_PAGES = 4;

/** Events in [timeMin, timeMax) on one calendar, recurring events expanded, deletions included. */
export async function listEvents(
  accessToken: string,
  opts: { calendarId: string; timeMin: Date; timeMax: Date; fallbackTz: string },
  fetchImpl: Fetch = fetch,
): Promise<ListResult> {
  const items: NormalizedOrCancelled[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${endpoints().calendar}/calendars/${encodeURIComponent(opts.calendarId)}/events`);
    url.search = new URLSearchParams({
      timeMin: opts.timeMin.toISOString(),
      timeMax: opts.timeMax.toISOString(),
      singleEvents: "true",
      showDeleted: "true",
      orderBy: "startTime",
      maxResults: "250",
      ...(pageToken ? { pageToken } : {}),
    }).toString();
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    } catch {
      return { ok: false, reason: "error" };
    }
    if (res.status === 401 || res.status === 403) return { ok: false, reason: "unauthorized" };
    if (!res.ok) return { ok: false, reason: "error" };
    const json = (await res.json().catch(() => null)) as { items?: GoogleEvent[]; nextPageToken?: string; timeZone?: string } | null;
    if (!json) return { ok: false, reason: "error" };
    for (const e of json.items ?? []) {
      const n = normalizeGoogleEvent(e, opts.calendarId, json.timeZone ?? opts.fallbackTz);
      if (n) items.push(n);
    }
    pageToken = json.nextPageToken;
    if (!pageToken) return { ok: true, items, complete: true };
  }
  return { ok: true, items, complete: false };
}

// --- Writes (require GOOGLE_CALENDAR_EVENTS_SCOPE) -----------------------------------

/** When an event happens, in the form the API accepts. */
export type EventTimes =
  | { allDay: false; startsAt: string; endsAt: string; timeZone: string }
  | { allDay: true; startDate: string; endDate: string; timeZone: string };

export interface EventWriteInput {
  title?: string;
  location?: string | null;
  description?: string | null;
  colorId?: string | null;
  times?: EventTimes;
}

/**
 * Google event body for insert/patch. Timed events are sent as absolute UTC
 * instants plus the user's IANA time zone (DST-safe); all-day events as dates
 * (end exclusive). Explicit nulls switch an event between timed and all-day.
 */
export function toGoogleEventBody(input: EventWriteInput, opts: { forInsert?: boolean; id?: string } = {}): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (opts.id) body.id = opts.id;
  if (input.title !== undefined) body.summary = input.title;
  if (input.location !== undefined) body.location = input.location ?? "";
  if (input.description !== undefined) body.description = input.description ?? "";
  if (input.colorId !== undefined) body.colorId = input.colorId ?? (opts.forInsert ? undefined : null);
  if (input.times) {
    const t = input.times;
    if (t.allDay) {
      body.start = { date: t.startDate, ...(opts.forInsert ? {} : { dateTime: null }), timeZone: t.timeZone };
      body.end = { date: t.endDate, ...(opts.forInsert ? {} : { dateTime: null }), timeZone: t.timeZone };
    } else {
      body.start = { dateTime: t.startsAt, ...(opts.forInsert ? {} : { date: null }), timeZone: t.timeZone };
      body.end = { dateTime: t.endsAt, ...(opts.forInsert ? {} : { date: null }), timeZone: t.timeZone };
    }
  }
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
  return body;
}

/**
 * Deterministic Google event id (base32hex: a–v, 0–9) so retrying the same
 * create can never make a duplicate — Google rejects a second insert with the
 * same id (409), which we treat as "already created".
 */
export async function eventIdFor(seed: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return `jv${createHash("sha256").update(seed).digest("hex").slice(0, 40)}`;
}

export type WriteFailure = "unauthorized" | "insufficient_scope" | "forbidden" | "not_found" | "conflict" | "error";
export type WriteResult = { ok: true; event: GoogleEvent } | { ok: false; reason: WriteFailure; httpStatus: number | null };

async function classify(res: Response): Promise<WriteFailure> {
  if (res.status === 401) return "unauthorized";
  if (res.status === 404 || res.status === 410) return "not_found";
  if (res.status === 409) return "conflict";
  if (res.status === 403) {
    const json = (await res.json().catch(() => null)) as { error?: { errors?: { reason?: string }[]; details?: { reason?: string }[] } } | null;
    const reasons = [...(json?.error?.errors ?? []), ...(json?.error?.details ?? [])].map((e) => e?.reason ?? "").join(" ");
    // Only an explicit scope error means "this grant can't write" (other 403s, e.g. not the organizer, are not).
    if (/insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/.test(reasons)) return "insufficient_scope";
    if (/rateLimit|quota/i.test(reasons)) return "error";
    return "forbidden";
  }
  return "error";
}

async function call(method: string, path: string, accessToken: string, fetchImpl: Fetch, body?: unknown, query: Record<string, string> = {}): Promise<WriteResult | { ok: true; event: null }> {
  const url = new URL(`${endpoints().calendar}${path}`);
  url.search = new URLSearchParams(query).toString();
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    return { ok: false, reason: "error", httpStatus: null };
  }
  if (!res.ok) return { ok: false, reason: await classify(res), httpStatus: res.status };
  if (res.status === 204) return { ok: true, event: null };
  const json = (await res.json().catch(() => null)) as GoogleEvent | null;
  return json ? { ok: true, event: json } : { ok: false, reason: "error", httpStatus: res.status };
}

const eventPath = (calendarId: string, eventId?: string) =>
  `/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}`;

export async function getEvent(accessToken: string, calendarId: string, eventId: string, fetchImpl: Fetch = fetch): Promise<WriteResult> {
  const r = await call("GET", eventPath(calendarId, eventId), accessToken, fetchImpl);
  return r.ok && !r.event ? { ok: false, reason: "error", httpStatus: 204 } : (r as WriteResult);
}

export async function insertEvent(accessToken: string, calendarId: string, body: Record<string, unknown>, fetchImpl: Fetch = fetch): Promise<WriteResult> {
  const r = await call("POST", eventPath(calendarId), accessToken, fetchImpl, body, { sendUpdates: "all" });
  return r.ok && !r.event ? { ok: false, reason: "error", httpStatus: 204 } : (r as WriteResult);
}

export async function patchEvent(accessToken: string, calendarId: string, eventId: string, body: Record<string, unknown>, fetchImpl: Fetch = fetch): Promise<WriteResult> {
  const r = await call("PATCH", eventPath(calendarId, eventId), accessToken, fetchImpl, body, { sendUpdates: "all" });
  return r.ok && !r.event ? { ok: false, reason: "error", httpStatus: 204 } : (r as WriteResult);
}

/** Deleting an already-deleted event counts as success. */
export async function deleteEvent(accessToken: string, calendarId: string, eventId: string, fetchImpl: Fetch = fetch): Promise<{ ok: true } | { ok: false; reason: WriteFailure; httpStatus: number | null }> {
  const r = await call("DELETE", eventPath(calendarId, eventId), accessToken, fetchImpl, undefined, { sendUpdates: "all" });
  if (r.ok) return { ok: true };
  if (r.reason === "not_found") return { ok: true };
  return r;
}
