import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/env";
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
