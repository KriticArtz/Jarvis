"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/money", label: "Overview", exact: true },
  { href: "/money/recurring", label: "Recurring", exact: false },
  { href: "/money/transactions", label: "Transactions", exact: false },
];

/** Views inside Money: the command center, recurring payments and transactions. */
export function MoneyNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Money" className="-mx-1 mb-8 overflow-x-auto px-1 no-scrollbar">
      <ul className="inline-flex rounded-full bg-surface-2 p-1 shadow-[inset_0_0_0_1px_var(--hairline)]">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center rounded-full px-4 text-[14px] font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-(--dur-2) ease-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring",
                  active ? "bg-surface-raised text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_0_0_1px_var(--hairline)]" : "text-muted hover:text-foreground",
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
