import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { appUrl, vercelEnv } from "@/lib/env";
import { OAUTH_COOKIE } from "./oauth-state";

/** Callback URL registered in Google Cloud ("Authorized redirect URIs"). */
export function googleRedirectUri(request: NextRequest): string {
  return `${appUrl() ?? request.nextUrl.origin}/api/integrations/google/callback`;
}

export const OAUTH_COOKIE_PATH = "/api/integrations/google";

/** Back to Settings → Integrations with a status the page can explain. */
export function backToSettings(request: NextRequest, status: string): NextResponse {
  const url = new URL("/settings", appUrl() ?? request.nextUrl.origin);
  url.searchParams.set("calendar", status);
  url.hash = "integrations";
  const res = NextResponse.redirect(url);
  // The state cookie is single-use: always clear it.
  res.cookies.set({ name: OAUTH_COOKIE, value: "", path: OAUTH_COOKIE_PATH, maxAge: 0, httpOnly: true, sameSite: "lax", secure: url.protocol === "https:" });
  return res;
}

/*
 * In-app browsers (Instagram, Facebook, LinkedIn, X, TikTok, WeChat, Line,
 * Snapchat, Pinterest, and Android WebViews) are blocked by Google's sign-in
 * ("disallowed_useragent"): the user would land on a Google error page with no
 * way back. Only explicit markers are matched, so real browsers are never
 * turned away.
 */
const IN_APP_BROWSER = /\b(FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|TwitterAndroid|Twitter for|TikTok|musical_ly|BytedanceWebview|MicroMessenger|Line\/|Snapchat|Pinterest)\b/i;

export function isEmbeddedBrowser(userAgent: string | null): boolean {
  if (!userAgent) return false;
  if (IN_APP_BROWSER.test(userAgent)) return true;
  // Android System WebView marks itself with "; wv)".
  return /Android/.test(userAgent) && /;\s*wv\)/.test(userAgent);
}

/**
 * On production, OAuth must run on the canonical host (NEXT_PUBLIC_APP_URL):
 * the session and the OAuth state cookie belong to one host, and Google
 * returns to the canonical callback. A request that arrives on another host
 * (e.g. the bare domain instead of www) is sent to the canonical one first.
 */
export function canonicalStartUrl(request: NextRequest): string | null {
  const base = appUrl();
  if (!base || vercelEnv() !== "production") return null;
  if (new URL(base).origin === request.nextUrl.origin) return null;
  return `${base}/api/integrations/google/start${request.nextUrl.search}`;
}
