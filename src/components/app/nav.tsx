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
    <nav aria-label="Main" className="flex flex-col gap-1">
      {ITEMS.map((item) => {
        const active = isActive(item.match);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors",
              active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <item.icon className="size-[18px]" aria-hidden />
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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {ITEMS.map((item) => {
          const active = isActive(item.match);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium", active ? "text-accent" : "text-muted")}
              >
                <item.icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
