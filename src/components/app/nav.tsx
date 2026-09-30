"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, Home, MessageCircle, Settings, Target } from "lucide-react";
import { cn } from "@/lib/cn";
import { usePersonalization } from "./personalization";
import { AssistantAvatar } from "./assistant-avatar";

const TODAY = { href: "/dashboard", label: "Today", icon: Home, match: ["/dashboard", "/plan"] };
const CALENDAR = { href: "/calendar", label: "Calendar", icon: CalendarDays, match: ["/calendar"] };
const GOALS = { href: "/goals", label: "Goals", icon: Target, match: ["/goals"] };
const ASSISTANT = { href: "/assistant", label: null, icon: MessageCircle, match: ["/assistant"] };
const REVIEW = { href: "/review", label: "Review", icon: BarChart3, match: ["/review"] };
const SETTINGS = { href: "/settings", label: "Settings", icon: Settings, match: ["/settings"] };

const ITEMS = [TODAY, CALENDAR, GOALS, ASSISTANT, REVIEW, SETTINGS];
/** Five tabs with the assistant in the middle; Settings is reached from the header avatar on mobile. */
const TAB_ITEMS = [TODAY, CALENDAR, ASSISTANT, GOALS, REVIEW];

function useActive() {
  const pathname = usePathname();
  return (match: string[]) => match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}

export function SidebarNav() {
  const isActive = useActive();
  const { assistantName } = usePersonalization();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {ITEMS.map((item) => {
        const active = isActive(item.match);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[15px] font-medium transition-all duration-200",
              active ? "bg-surface text-foreground shadow-card" : "text-muted hover:bg-surface/60 hover:text-foreground",
            )}
          >
            {item.label ? (
              <item.icon className={cn("size-[19px]", active && "text-accent")} strokeWidth={active ? 2.3 : 1.9} aria-hidden />
            ) : (
              <AssistantAvatar name={assistantName} className="-ml-0.5 size-[22px] text-[11px]" />
            )}
            <span className="truncate">{item.label ?? assistantName}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Mobile tab bar. The assistant sits in the middle as the raised primary
 * destination, labelled with the name the user gave it.
 */
export function BottomNav() {
  const isActive = useActive();
  const { assistantName } = usePersonalization();
  return (
    <nav
      aria-label="Main"
      className="app-bottom-nav fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {TAB_ITEMS.map((item) => {
          const active = isActive(item.match);
          const isAssistant = !item.label;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-end gap-1 pb-2 pt-2 text-[10.5px] font-medium transition-colors active:scale-95",
                  active ? "text-accent" : "text-muted",
                )}
              >
                {isAssistant ? (
                  <span
                    className={cn(
                      "-mt-5 flex size-12 items-center justify-center rounded-full bg-brand-gradient text-white shadow-[0_8px_20px_-8px_var(--grad-to)] ring-4 ring-background transition-transform",
                      active && "scale-105",
                    )}
                  >
                    <item.icon className="size-[22px]" strokeWidth={2.2} aria-hidden />
                  </span>
                ) : (
                  <item.icon className="size-[22px]" strokeWidth={active ? 2.3 : 1.8} aria-hidden />
                )}
                <span className="max-w-full truncate px-1">{item.label ?? assistantName}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
