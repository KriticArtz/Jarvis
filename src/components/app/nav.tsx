"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Home, MessageCircle, Settings, Target } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/dashboard", label: "Today", icon: Home, match: ["/dashboard", "/plan"] },
  { href: "/goals", label: "Goals", icon: Target, match: ["/goals"] },
  { href: "/assistant", label: "Assistant", icon: MessageCircle, match: ["/assistant"] },
  { href: "/review", label: "Review", icon: BarChart3, match: ["/review"] },
  { href: "/settings", label: "Settings", icon: Settings, match: ["/settings"] },
];

function useActive() {
  const pathname = usePathname();
  return (match: string[]) => match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}

export function SidebarNav() {
  const isActive = useActive();
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
              "flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[15px] font-medium transition-all duration-200",
              active ? "bg-surface text-foreground shadow-card" : "text-muted hover:bg-surface/60 hover:text-foreground",
            )}
          >
            <item.icon className={cn("size-[19px]", active && "text-accent")} strokeWidth={active ? 2.3 : 1.9} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const isActive = useActive();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {ITEMS.map((item) => {
          const active = isActive(item.match);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 pb-2 pt-2.5 text-[10.5px] font-medium transition-colors active:scale-95",
                  active ? "text-accent" : "text-muted",
                )}
              >
                <item.icon className="size-[22px]" strokeWidth={active ? 2.3 : 1.8} aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
