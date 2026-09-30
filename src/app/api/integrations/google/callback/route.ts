import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { appUrl, googleOAuthConfig, integrationsEncryptionKey } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode, GOOGLE_CALENDAR_SCOPE } from "@/lib/integrations/calendar/google";
import { saveGoogleConnection, syncGoogleCalendar } from "@/lib/integrations/calendar/sync";
import { checkOAuthState, OAUTH_COOKIE } from "@/lib/integrations/oauth-state";
import { backToSettings, googleRedirectUri } from "@/lib/integrations/google-oauth-route";
import { errorInfo, logError, logInfo, logWarn } from "@/lib/observability/log";

export const maxDuration = 60;

/**
 * Google redirects here after consent. The user must be the same signed-in
 * user who started the flow, `state` must match the encrypted cookie, and the
 * code is exchanged with the PKCE verifier. Tokens go straight into encrypted
 * server-only storage; the browser never sees them.
 *
 * Every outcome is logged once as "google oauth callback" with a request id
 * (`rid`) and a `step`, so a failed connection can be traced in the server
 * logs. Logs never contain the code, state, cookie, tokens or secrets.
 */
export async function GET(request: NextRequest) {
  const rid = randomBytes(4).toString("hex");
  const trace = (level: "info" | "warn" | "error", step: string, context: Record<string, unknown> = {}) =>
    (level === "error" ? logError : level === "warn" ? logWarn : logInfo)("integrations", "google oauth callback", { rid, step, ...context });
  const done = (status: string, step: string, context: Record<string, unknown> = {}) => {
    trace(status === "connected" ? "info" : status === "connected_sync_failed" || status === "denied" ? "warn" : "error", step, { redirectStatus: status, ...context });
    return backToSettings(request, status);
  };

  const params = request.nextUrl.searchParams;
  const configuredBase = appUrl();
  trace("info", "received", {
    hasCode: params.has("code"),
    hasState: params.has("state"),
    hasStateCookie: Boolean(request.cookies.get(OAUTH_COOKIE)?.value),
    googleErrorParam: params.get("error"),
    requestOrigin: request.nextUrl.origin,
    appUrlSet: Boolean(configuredBase),
    // Mismatch means the browser may have started the flow on another host (cookie not sent back).
    appUrlMatchesRequestOrigin: configuredBase ? configuredBase === request.nextUrl.origin : null,
  });

  try {
    const session = await getSessionUser();
    if (!session) {
      trace("warn", "no_session", { redirect: "/login" });
      return NextResponse.redirect(new URL("/login?next=/settings", request.nextUrl.origin));
    }
    if (session.isDemo) return done("demo", "demo_user");
    const cfg = googleOAuthConfig();
    const key = integrationsEncryptionKey();
    const admin = createAdminClient();
    if (!cfg || !key || !admin) return done("not_configured", "config", { hasGoogleConfig: Boolean(cfg), hasEncryptionKey: Boolean(key), hasServiceClient: Boolean(admin) });

    const check = checkOAuthState(key, request.cookies.get(OAUTH_COOKIE)?.value, params.get("state"), session.userId);
    if (!check.ok) return done(check.reason === "expired" ? "expired" : "invalid_state", "state_check", { reason: check.reason });
    if (params.get("error")) return done(params.get("error") === "access_denied" ? "denied" : "error", "google_error_param", { googleError: params.get("error") });
    const code = params.get("code");
    if (!code) return done("error", "missing_code");

    const redirectUri = googleRedirectUri(request);
    const exchanged = await exchangeCode(cfg, { code, codeVerifier: check.codeVerifier, redirectUri });
    if (!exchanged.ok) {
      return done("error", "token_exchange", {
        reason: exchanged.reason,
        ...exchanged.detail,
        // Must be byte-identical to the URI used on /start and registered in Google Cloud.
        redirectUri,
        clientIdSuffix: cfg.clientId.slice(-24),
      });
    }
    trace("info", "token_exchange_ok", {
      grantedScopes: exchanged.tokens.scopes,
      hasCalendarScope: exchanged.tokens.scopes.includes(GOOGLE_CALENDAR_SCOPE),
      hasRefresh: Boolean(exchanged.tokens.refreshToken),
      expiresAt: exchanged.tokens.expiresAt,
    });

    const saved = await saveGoogleConnection(admin, session.userId, exchanged.tokens);
    if (!saved.ok) {
      return done(saved.reason === "scope_denied" ? "scope_denied" : "error", "save_connection", { reason: saved.reason, ...saved.detail });
    }

    const synced = await syncGoogleCalendar(admin, session.userId);
    if (!synced.ok) return done("connected_sync_failed", "initial_sync", { reason: synced.reason });
    return done("connected", "complete", { upserted: synced.upserted });
  } catch (err) {
    // Unchanged behavior (the error still propagates); logged so it can be found.
    trace("error", "exception", errorInfo(err));
    throw err;
  }
}
