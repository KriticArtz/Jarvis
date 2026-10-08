"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CircleUserRound, Sprout, Sun, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { brand } from "@/config/brand";
import { LogoMark } from "@/components/logo";
import { Presence } from "@/components/ui/presence";
import { isActivePath, NAV, type NavKey } from "@/lib/ui/navigation";
import { usePersonalization } from "./personalization";

/*
 * Primary navigation: Today | Calendar | Assistant | Progress | You.
 * Quiet by design — neutral icons and labels, no colored tiles. Today leads;
 * the assistant is the Presence orb at the center; the rest are supporting
 * spaces. Existing URLs stay as they are: Progress gathers /goals and
 * /review, You is /settings.
 */
interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon | null;
}

/** null = the assistant: drawn as the Presence and labelled with the name the user gave it. */
const ICONS: Record<NavKey, LucideIcon | null> = { today: Sun, calendar: CalendarDays, assistant: null, progress: Sprout, you: CircleUserRound };

function useNav() {
  const pathname = usePathname();
  const { assistantName } = usePersonalization();
  return NAV.map((n) => ({
    href: n.href,
    icon: ICONS[n.key],
    label: n.key === "assistant" ? assistantName : n.label,
    active: isActivePath(pathname, n.match),
  }));
}

/** Desktop and tablet: a slim rail, icons over small labels. */
export function NavRail({ offsetTop = false }: { offsetTop?: boolean }) {
  const items = useNav();
  return (
    <nav
      aria-label="Main"
      className={cn(
        "fixed bottom-0 left-0 z-30 hidden w-[84px] flex-col items-center border-r border-hairline bg-background/70 pb-6 backdrop-blur-xl md:flex",
        offsetTop ? "top-10" : "top-0",
      )}
    >
      <Link
        href="/dashboard"
        aria-label={`${brand.name} — Today`}
        className="mt-6 mb-8 rounded-[30%] transition-transform duration-(--dur-2) ease-soft hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
      >
        <LogoMark className="size-9" />
      </Link>
      <ul className="flex flex-col items-center gap-2">
        {items.map((item) => (
          <li key={item.href}>
            <RailLink {...item} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function RailLink({ href, label, icon: Icon, active }: NavItem & { active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="group flex w-[72px] flex-col items-center gap-1 rounded-tile py-1.5 focus-visible:outline-none"
    >
      {Icon ? (
        <span
          className={cn(
            "flex h-9 w-12 items-center justify-center rounded-full transition-[background-color,color] duration-(--dur-2) ease-soft",
            "group-focus-visible:ring-4 group-focus-visible:ring-ring",
            active ? "bg-[color-mix(in_oklab,var(--foreground)_8%,transparent)] text-foreground" : "text-subtle group-hover:bg-surface-2 group-hover:text-foreground",
          )}
        >
          <Icon className="size-[20px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
        </span>
      ) : (
        <span className="flex h-12 items-center justify-center rounded-full group-focus-visible:ring-4 group-focus-visible:ring-ring">
          <Presence size={active ? 38 : 34} state={active ? "listening" : "idle"} className="transition-[width,height] duration-(--dur-3) ease-soft" />
        </span>
      )}
      <span
        className={cn(
          "max-w-full truncate px-1 text-[11px] leading-tight transition-colors duration-(--dur-2)",
          active ? "font-semibold text-foreground" : "font-medium text-muted group-hover:text-foreground",
        )}
      >
        {label}
      </span>
    </Link>
  );
}

/** Phones: a bottom tab bar with the Presence raised in the middle. */
export function TabBar() {
  const items = useNav();
  return (
    <nav
      aria-label="Main"
      className="app-bottom-nav fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-background/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map(({ href, label, icon: Icon, active }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className="group flex h-[60px] flex-col items-center justify-end gap-1 pb-2 focus-visible:outline-none"
            >
              {Icon ? (
                <span
                  className={cn(
                    "flex h-7 w-11 items-center justify-center rounded-full transition-[color,transform] duration-(--dur-2) ease-soft group-active:scale-90",
                    "group-focus-visible:ring-4 group-focus-visible:ring-ring",
                    active ? "text-foreground" : "text-subtle",
                  )}
                >
                  <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                </span>
              ) : (
                <span className="-mt-5 flex size-[52px] items-center justify-center rounded-full bg-background shadow-[0_0_0_1px_var(--hairline)] transition-transform duration-(--dur-2) ease-soft group-active:scale-90 group-focus-visible:ring-4 group-focus-visible:ring-ring">
                  <Presence size={40} state={active ? "listening" : "idle"} />
                </span>
              )}
              <span
                className={cn(
                  "max-w-full truncate px-1 text-[10.5px] leading-none transition-colors duration-(--dur-2)",
                  active ? "font-semibold text-foreground" : "font-medium text-muted",
                )}
              >
                {label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
