import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { googleOAuthConfig, integrationsEncryptionKey } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode } from "@/lib/integrations/calendar/google";
import { saveGoogleConnection, syncGoogleCalendar } from "@/lib/integrations/calendar/sync";
import { checkOAuthState, OAUTH_COOKIE } from "@/lib/integrations/oauth-state";
import { backToSettings, googleRedirectUri } from "@/lib/integrations/google-oauth-route";
import { logWarn } from "@/lib/observability/log";

export const maxDuration = 60;

/**
 * Google redirects here after consent. The user must be the same signed-in
 * user who started the flow, `state` must match the encrypted cookie, and the
 * code is exchanged with the PKCE verifier. Tokens go straight into encrypted
 * server-only storage; the browser never sees them.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.redirect(new URL("/login?next=/settings", request.nextUrl.origin));
  if (session.isDemo) return backToSettings(request, "demo");
  const cfg = googleOAuthConfig();
  const key = integrationsEncryptionKey();
  const admin = createAdminClient();
  if (!cfg || !key || !admin) return backToSettings(request, "not_configured");

  const params = request.nextUrl.searchParams;
  const check = checkOAuthState(key, request.cookies.get(OAUTH_COOKIE)?.value, params.get("state"), session.userId);
  if (!check.ok) {
    logWarn("integrations", "google oauth callback rejected", { reason: check.reason });
    return backToSettings(request, check.reason === "expired" ? "expired" : "invalid_state");
  }
  if (params.get("error")) return backToSettings(request, params.get("error") === "access_denied" ? "denied" : "error");
  const code = params.get("code");
  if (!code) return backToSettings(request, "error");

  const exchanged = await exchangeCode(cfg, { code, codeVerifier: check.codeVerifier, redirectUri: googleRedirectUri(request) });
  if (!exchanged.ok) return backToSettings(request, "error");
  const saved = await saveGoogleConnection(admin, session.userId, exchanged.tokens);
  if (!saved.ok) return backToSettings(request, saved.reason === "scope_denied" ? "scope_denied" : "error");

  const synced = await syncGoogleCalendar(admin, session.userId);
  return backToSettings(request, synced.ok ? "connected" : "connected_sync_failed");
}
