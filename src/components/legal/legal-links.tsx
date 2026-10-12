import Link from "next/link";
import { brand } from "@/config/brand";
import { cn } from "@/lib/cn";

/** Every public policy page, in footer order. Tests check each one exists and is linked. */
export const LEGAL_PAGES = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/subscriptions", label: "Subscription & Refunds" },
  { href: "/cookies", label: "Cookie Policy" },
  { href: "/accessibility", label: "Accessibility" },
  { href: "/privacy-requests", label: "Data Deletion & Privacy Requests" },
] as const;

/** Footer links to the policies, cookie preferences and support. Wraps on narrow screens. */
export function LegalLinks({ className }: { className?: string }) {
  const link = "inline-flex min-h-6 items-center hover:text-foreground hover:underline";
  return (
    <nav aria-label="Legal and support" className={cn("block w-full", className)}>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2 sm:justify-start">
        {LEGAL_PAGES.map((p) => (
          <li key={p.href}>
            <Link href={p.href} className={link}>
              {p.label}
            </Link>
          </li>
        ))}
        <li>
          <Link href="/cookies#preferences" className={link}>
            Cookie Preferences
          </Link>
        </li>
        <li>
          <a href={`mailto:${brand.supportEmail}`} className={link}>
            Contact Support
          </a>
        </li>
      </ul>
    </nav>
  );
}
