import Link from "next/link";
import { brand } from "@/config/brand";
import { cn } from "@/lib/cn";

/**
 * Simple original mark (a rising arc). The gradient is a CSS background rather
 * than an SVG <linearGradient>: SVG gradient ids are page-global, and Chrome
 * won't paint one defined inside a hidden element (e.g. the desktop sidebar on
 * mobile). Swap the SVG to rebrand.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-[30%] bg-brand-gradient", className)} aria-hidden="true">
      <svg viewBox="0 0 32 32" className="size-full">
        <path d="M9 21.5c2.2-5.6 5.6-9 11.5-11" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        <circle cx="22" cy="10" r="2.6" fill="#fff" />
      </svg>
    </span>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 font-semibold", className)}>
      <LogoMark />
      <span className="text-[18px] tracking-tight">{brand.name}</span>
    </Link>
  );
}
