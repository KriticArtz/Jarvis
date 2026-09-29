/** Route groups shared by the proxy and layouts. */
export const PUBLIC_PATHS = ["/", "/login", "/signup", "/forgot-password", "/auth"];
// Authenticated by Twilio signature / CRON_SECRET instead of a user session.
export const API_PUBLIC_PATHS = ["/api/sms", "/api/cron"];

export function isPublicPath(pathname: string): boolean {
  if (API_PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  return PUBLIC_PATHS.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
}

/** Only allow same-site relative redirects (prevents open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
