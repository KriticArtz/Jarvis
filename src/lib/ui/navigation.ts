/**
 * The five primary destinations and which existing URLs belong to each.
 * Existing routes are kept: Progress gathers /goals and /review (and the
 * /progress entry point); You is /settings; Today includes /plan.
 */
export type NavKey = "today" | "calendar" | "assistant" | "progress" | "you";

export const NAV: { key: NavKey; href: string; label: string; match: string[] }[] = [
  { key: "today", href: "/dashboard", label: "Today", match: ["/dashboard", "/plan"] },
  { key: "calendar", href: "/calendar", label: "Calendar", match: ["/calendar"] },
  { key: "assistant", href: "/assistant", label: "Assistant", match: ["/assistant"] },
  { key: "progress", href: "/goals", label: "Progress", match: ["/progress", "/goals", "/review"] },
  { key: "you", href: "/settings", label: "You", match: ["/settings"] },
];

export function isActivePath(pathname: string, match: string[]): boolean {
  return match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}

/** The destination a pathname belongs to, or null (e.g. a public page). */
export function activeNav(pathname: string): NavKey | null {
  return NAV.find((n) => isActivePath(pathname, n.match))?.key ?? null;
}
