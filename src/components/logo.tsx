import Link from "next/link";
import { brand } from "@/config/brand";
import { cn } from "@/lib/cn";

/** Simple wordmark with a compass-like mark. Swap the SVG to rebrand. */
export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
        <rect width="32" height="32" rx="9" className="fill-accent" />
        <path d="M16 7l5 14-5-3-5 3z" className="fill-accent-foreground" />
      </svg>
      <span className="text-[17px]">{brand.name}</span>
    </Link>
  );
}
