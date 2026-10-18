import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { logAuthError } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/routes";

/** Where password recovery links land once the session is established. */
const RESET_PASSWORD_PATH = "/reset-password";

/**
 * Handles links from Supabase auth emails (signup confirmation, password
 * recovery). Supports both the PKCE `code` flow and `token_hash` links.
 *
 * A failed recovery link sends the user to /forgot-password to request a new
 * one; any other failure goes to /login. Only the Supabase error code/message
 * is logged, never the token, code or link.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNextPath(url.searchParams.get("next"), "/dashboard");
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const isRecovery = type === "recovery" || next === RESET_PASSWORD_PATH;

  const supabase = await createClient();
  let ok = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) logAuthError("authCallback", error);
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) logAuthError("authCallback", error);
    ok = !error;
  }

  if (!ok) {
    const failure = isRecovery ? "/forgot-password?error=link_expired" : "/login?error=auth_callback";
    return NextResponse.redirect(new URL(failure, url.origin));
  }
  return NextResponse.redirect(new URL(isRecovery ? RESET_PASSWORD_PATH : next, url.origin));
}
