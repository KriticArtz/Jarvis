import type { CookieOptions } from "@supabase/ssr";

/**
 * Options for the Supabase session cookies (sign-in and PKCE verifier).
 *
 * @supabase/ssr defaults to `path=/; SameSite=Lax; Max-Age=400 days` with no
 * `Secure` flag. When the request reached us over HTTPS (every Vercel
 * deployment) the cookies are also marked `Secure`, so a browser never sends
 * the session over plain HTTP. Local development over http:// is unchanged.
 *
 * `HttpOnly` stays off, which is the library default: these cookies hold the
 * session the Supabase client reads, and changing that is not done here.
 */
export function sessionCookieOptions(isHttps: boolean): CookieOptions | undefined {
  return isHttps ? { secure: true } : undefined;
}

/** True when the original request used HTTPS (first `x-forwarded-proto` value, or the URL's own protocol). */
export function isHttpsRequest(forwardedProto: string | null | undefined, urlProtocol?: string): boolean {
  const first = forwardedProto?.split(",")[0]?.trim().toLowerCase();
  if (first) return first === "https";
  return urlProtocol === "https:";
}
