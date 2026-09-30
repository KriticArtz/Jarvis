import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { googleOAuthConfig, integrationsEncryptionKey, supabaseServiceKey } from "@/lib/env";
import { buildAuthorizeUrl } from "@/lib/integrations/calendar/google";
import { OAUTH_COOKIE, OAUTH_STATE_TTL_SECONDS, startOAuth } from "@/lib/integrations/oauth-state";
import { backToSettings, googleRedirectUri, OAUTH_COOKIE_PATH } from "@/lib/integrations/google-oauth-route";
import { logInfo } from "@/lib/observability/log";

/**
 * Begin connecting Google Calendar (events scope; also used to upgrade a read-only connection). Requires a signed-in,
 * non-demo user. Sets a single-use, encrypted, httpOnly state cookie bound to
 * this user (CSRF state + PKCE verifier) and redirects to Google.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.redirect(new URL("/login?next=/settings", request.nextUrl.origin));
  if (session.isDemo) return backToSettings(request, "demo");
  const cfg = googleOAuthConfig();
  const key = integrationsEncryptionKey();
  if (!cfg || !key || !supabaseServiceKey()) return backToSettings(request, "not_configured");

  const flow = startOAuth(key, session.userId);
  const redirectUri = googleRedirectUri(request);
  logInfo("integrations", "google oauth start", { redirectUri, requestOrigin: request.nextUrl.origin, clientIdSuffix: cfg.clientId.slice(-24) });
  const res = NextResponse.redirect(buildAuthorizeUrl(cfg, { redirectUri, state: flow.state, codeChallenge: flow.codeChallenge }));
  res.cookies.set({
    name: OAUTH_COOKIE,
    value: flow.cookieValue,
    path: OAUTH_COOKIE_PATH,
    maxAge: OAUTH_STATE_TTL_SECONDS,
    httpOnly: true,
    sameSite: "lax", // sent on Google's top-level redirect back to us
    secure: request.nextUrl.protocol === "https:",
  });
  return res;
}
