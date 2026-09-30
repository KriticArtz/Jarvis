import "server-only";
import { googleTestBaseUrl, type GoogleOAuthConfig } from "@/lib/env";
import { zonedTimeToUtc } from "@/lib/time";
import type { CalendarEventStatus, NormalizedCalendarEvent } from "./types";

/**
 * Google Calendar over plain REST (no SDK). Read-only: the only scope
 * requested is calendar.events.readonly, and only the user's primary
 * calendar is read.
 */
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";

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

export interface GoogleEvent {
  id?: string;
  status?: string;
  summary?: string;
  location?: string;
  transparency?: string;
  start?: GoogleEventDate;
  end?: GoogleEventDate;
}

export type NormalizedOrCancelled = { kind: "event"; event: NormalizedCalendarEvent } | { kind: "cancelled"; providerEventId: string };

/**
 * Map one Google event to the normalized model. Only what the assistant needs
 * is kept: no description, attendees, links or conferencing data.
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
