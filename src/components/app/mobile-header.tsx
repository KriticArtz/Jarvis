"use client";

import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";

/** Pages that open with their own title on phones (no brand header above it). */
const TITLED = ["/dashboard", "/assistant"];

/** Compact brand header on phones; Today opens straight on its greeting instead. */
export function MobileHeader() {
  const pathname = usePathname();
  if (TITLED.includes(pathname)) return null;
  return (
    <header className="flex items-center px-5 pt-[max(1.25rem,env(safe-area-inset-top))] md:hidden">
      <Logo href="/dashboard" />
    </header>
  );
}
