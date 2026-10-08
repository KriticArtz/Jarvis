"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { isActivePath } from "@/lib/ui/navigation";

const TABS = [
  { href: "/goals", label: "Goals", match: ["/goals"] },
  { href: "/review", label: "Weekly review", match: ["/review"] },
];

/**
 * Sub-navigation inside Progress: goals and the weekly review are two views
 * of the same space. Plain links (each keeps its own URL), styled as a quiet
 * segmented pill.
 */
export function ProgressNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Progress" className="mb-6">
      <ul className="inline-flex rounded-full bg-surface-2 p-1 shadow-[inset_0_0_0_1px_var(--hairline)]">
        {TABS.map((t) => {
          const active = isActivePath(pathname, t.match);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-full px-4 text-[14px] font-medium transition-[background-color,color,box-shadow] duration-(--dur-2) ease-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring",
                  active
                    ? "bg-surface-raised text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_0_0_1px_var(--hairline)]"
                    : "text-muted hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
