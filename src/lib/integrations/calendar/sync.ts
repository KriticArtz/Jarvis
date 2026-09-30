import "server-only";
import { googleOAuthConfig, integrationsEncryptionKey, type GoogleOAuthConfig } from "@/lib/env";
import type { DB } from "@/lib/data/db";
import { addDays, localDate, zonedTimeToUtc } from "@/lib/time";
import { logError, logInfo } from "@/lib/observability/log";
import { seal, unseal } from "../crypto";
import { GOOGLE_CALENDAR_SCOPE, listEvents, refreshAccessToken, revokeToken, type GoogleTokens } from "./google";
import { CALENDAR_SYNC_DAYS } from "./types";

/**
 * Google Calendar connection lifecycle and sync. `admin` must be the
 * service-role client (credentials and events are server-written) and
 * `userId` must come from an authenticated session — never from input.
 */

type Fetch = typeof fetch;
export interface IntegrationDeps {
  fetch?: Fetch;
  now?: Date;
  config?: GoogleOAuthConfig | null;
  key?: Buffer | null;
}

const PROVIDER = "google_calendar";
const CALENDAR_ID = "primary";
/** Past events are kept briefly (weekly review), then pruned. */
const KEEP_PAST_DAYS = 35;

const purpose = (kind: "access" | "refresh", userId: string) => `${PROVIDER}:${kind}:${userId}`;

function resolve(deps: IntegrationDeps) {
  return {
    fetch: deps.fetch ?? fetch,
    now: deps.now ?? new Date(),
    config: deps.config === undefined ? googleOAuthConfig() : deps.config,
    key: deps.key === undefined ? integrationsEncryptionKey() : deps.key,
  };
}

export type ConnectOutcome = { ok: true } | { ok: false; reason: "not_configured" | "scope_denied" | "no_refresh_token" | "error" };

/** Store a fresh OAuth grant (after the callback verified state + PKCE). */
export async function saveGoogleConnection(admin: DB, userId: string, tokens: GoogleTokens, deps: IntegrationDeps = {}): Promise<ConnectOutcome> {
  const { key } = resolve(deps);
  if (!key) return { ok: false, reason: "not_configured" };
  if (!tokens.scopes.includes(GOOGLE_CALENDAR_SCOPE)) return { ok: false, reason: "scope_denied" };
  if (!tokens.refreshToken) return { ok: false, reason: "no_refresh_token" };

  const { data: conn, error } = await admin
    .from("integration_connections")
    .upsert(
      { user_id: userId, provider: PROVIDER, kind: "calendar", status: "connected", scopes: [GOOGLE_CALENDAR_SCOPE], last_error: null },
      { onConflict: "user_id,provider" },
    )
    .select("id")
    .single();
  if (error || !conn) return { ok: false, reason: "error" };
  const { error: credError } = await admin.from("integration_credentials").upsert(
    {
      connection_id: conn.id,
      user_id: userId,
      access_token_enc: seal(key, purpose("access", userId), tokens.accessToken),
      refresh_token_enc: seal(key, purpose("refresh", userId), tokens.refreshToken),
      expires_at: tokens.expiresAt,
    },
    { onConflict: "connection_id" },
  );
  if (credError) return { ok: false, reason: "error" };
  logInfo("integrations", "google calendar connected", { userId });
  return { ok: true };
}

async function loadConnection(admin: DB, userId: string) {
  const { data } = await admin.from("integration_connections").select("id, status, last_synced_at").eq("user_id", userId).eq("provider", PROVIDER).maybeSingle();
  return data as { id: string; status: string; last_synced_at: string | null } | null;
}

async function markNeedsReconnect(admin: DB, connectionId: string) {
  await admin.from("integration_connections").update({ status: "error", last_error: "reauth_required" }).eq("id", connectionId);
  // The grant is dead; don't keep unusable secrets around.
  await admin.from("integration_credentials").delete().eq("connection_id", connectionId);
}

type TokenOutcome = { ok: true; token: string } | { ok: false; reason: "reauth_required" | "error" | "not_configured" };

async function accessToken(admin: DB, userId: string, connectionId: string, r: ReturnType<typeof resolve>, force = false): Promise<TokenOutcome> {
  if (!r.key || !r.config) return { ok: false, reason: "not_configured" };
  const { data: cred } = await admin
    .from("integration_credentials")
    .select("access_token_enc, refresh_token_enc, expires_at")
    .eq("connection_id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!cred) return { ok: false, reason: "reauth_required" };
  const access = unseal(r.key, purpose("access", userId), cred.access_token_enc as string);
  const fresh = cred.expires_at && new Date(cred.expires_at as string).getTime() - r.now.getTime() > 60_000;
  if (access && fresh && !force) return { ok: true, token: access };

  const refresh = unseal(r.key, purpose("refresh", userId), cred.refresh_token_enc as string | null);
  if (!refresh) return { ok: false, reason: "reauth_required" };
  const refreshed = await refreshAccessToken(r.config, refresh, r.fetch, r.now.getTime());
  if (!refreshed.ok) return { ok: false, reason: refreshed.reason === "invalid_grant" ? "reauth_required" : "error" };
  await admin
    .from("integration_credentials")
    .update({
      access_token_enc: seal(r.key, purpose("access", userId), refreshed.tokens.accessToken),
      expires_at: refreshed.tokens.expiresAt,
      ...(refreshed.tokens.refreshToken ? { refresh_token_enc: seal(r.key, purpose("refresh", userId), refreshed.tokens.refreshToken) } : {}),
    })
    .eq("connection_id", connectionId);
  return { ok: true, token: refreshed.tokens.accessToken };
}

export type SyncOutcome =
  | { ok: true; upserted: number; cancelled: number; removed: number }
  | { ok: false; reason: "not_configured" | "not_connected" | "reauth_required" | "error" };

/**
 * Pull the next CALENDAR_SYNC_DAYS days (from the start of the user's today)
 * and make calendar_events match: upsert by provider event id (idempotent),
 * mark cancellations, and remove events in the window that no longer exist.
 */
export async function syncGoogleCalendar(admin: DB, userId: string, deps: IntegrationDeps = {}): Promise<SyncOutcome> {
  const r = resolve(deps);
  if (!r.key || !r.config) return { ok: false, reason: "not_configured" };
  const conn = await loadConnection(admin, userId);
  if (!conn) return { ok: false, reason: "not_connected" };

  const { data: profile } = await admin.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  const tz = (profile?.timezone as string | undefined) || "UTC";
  const today = localDate(tz, r.now);
  const timeMin = zonedTimeToUtc(today, "00:00", tz);
  const timeMax = zonedTimeToUtc(addDays(today, CALENDAR_SYNC_DAYS), "00:00", tz);

  let token = await accessToken(admin, userId, conn.id, r);
  if (!token.ok) {
    if (token.reason === "reauth_required") await markNeedsReconnect(admin, conn.id);
    return { ok: false, reason: token.reason };
  }
  let list = await listEvents(token.token, { calendarId: CALENDAR_ID, timeMin, timeMax, fallbackTz: tz }, r.fetch);
  if (!list.ok && list.reason === "unauthorized") {
    // Access token revoked or expired early: refresh once and retry.
    token = await accessToken(admin, userId, conn.id, r, true);
    if (token.ok) list = await listEvents(token.token, { calendarId: CALENDAR_ID, timeMin, timeMax, fallbackTz: tz }, r.fetch);
    if (!token.ok || (!list.ok && list.reason === "unauthorized")) {
      await markNeedsReconnect(admin, conn.id);
      return { ok: false, reason: "reauth_required" };
    }
  }
  if (!list.ok) {
    await admin.from("integration_connections").update({ last_error: "sync_failed" }).eq("id", conn.id);
    return { ok: false, reason: "error" };
  }

  const syncedAt = r.now.toISOString();
  const events = list.items.flatMap((i) => (i.kind === "event" ? [i.event] : []));
  const cancelledIds = list.items.flatMap((i) => (i.kind === "cancelled" ? [i.providerEventId] : []));

  if (events.length) {
    const { error } = await admin.from("calendar_events").upsert(
      events.map((e) => ({
        user_id: userId,
        connection_id: conn.id,
        provider: PROVIDER,
        provider_event_id: e.providerEventId,
        calendar_id: e.calendarId,
        title: e.title,
        starts_at: e.startsAt,
        ends_at: e.endsAt,
        all_day: e.allDay,
        start_date: e.startDate,
        end_date: e.endDate,
        timezone: e.timezone,
        location: e.location,
        status: e.status,
        is_busy: e.isBusy,
        last_synced_at: syncedAt,
      })),
      { onConflict: "user_id,provider,calendar_id,provider_event_id" },
    );
    if (error) {
      logError("integrations", "calendar upsert failed", { userId, code: error.code });
      return { ok: false, reason: "error" };
    }
  }
  if (cancelledIds.length) {
    await admin
      .from("calendar_events")
      .update({ status: "cancelled", last_synced_at: syncedAt })
      .eq("user_id", userId)
      .eq("provider", PROVIDER)
      .in("provider_event_id", cancelledIds);
  }

  let removed = 0;
  if (list.complete) {
    // Anything in the window we didn't see this time was deleted (or moved out).
    const { data: gone } = await admin
      .from("calendar_events")
      .delete()
      .eq("connection_id", conn.id)
      .gte("starts_at", timeMin.toISOString())
      .lt("starts_at", timeMax.toISOString())
      .lt("last_synced_at", syncedAt)
      .select("id");
    removed = gone?.length ?? 0;
  }
  await admin
    .from("calendar_events")
    .delete()
    .eq("connection_id", conn.id)
    .lt("ends_at", new Date(r.now.getTime() - KEEP_PAST_DAYS * 86_400_000).toISOString());

  await admin.from("integration_connections").update({ status: "connected", last_error: null, last_synced_at: syncedAt }).eq("id", conn.id);
  return { ok: true, upserted: events.length, cancelled: cancelledIds.length, removed };
}

/** Revoke at Google (best effort), then delete tokens, events and the connection. */
export async function disconnectGoogleCalendar(admin: DB, userId: string, deps: IntegrationDeps = {}): Promise<{ ok: boolean; revoked: boolean }> {
  const r = resolve(deps);
  const conn = await loadConnection(admin, userId);
  if (!conn) return { ok: true, revoked: false };
  let revoked = false;
  if (r.key) {
    const { data: cred } = await admin
      .from("integration_credentials")
      .select("access_token_enc, refresh_token_enc")
      .eq("connection_id", conn.id)
      .eq("user_id", userId)
      .maybeSingle();
    const token =
      unseal(r.key, purpose("refresh", userId), cred?.refresh_token_enc as string | null) ?? unseal(r.key, purpose("access", userId), cred?.access_token_enc as string | null);
    if (token) revoked = await revokeToken(token, r.fetch);
  }
  const { error } = await admin.from("integration_connections").delete().eq("id", conn.id).eq("user_id", userId);
  if (error) return { ok: false, revoked };
  logInfo("integrations", "google calendar disconnected", { userId, revoked });
  return { ok: true, revoked };
}

/** Sync in the background when the last sync is older than `maxAgeMinutes`. */
export async function syncIfStale(admin: DB, userId: string, maxAgeMinutes = 60, deps: IntegrationDeps = {}): Promise<void> {
  const conn = await loadConnection(admin, userId);
  if (!conn || conn.status !== "connected") return;
  const age = conn.last_synced_at ? Date.now() - new Date(conn.last_synced_at).getTime() : Infinity;
  if (age < maxAgeMinutes * 60_000) return;
  await syncGoogleCalendar(admin, userId, deps);
}
