import Link from "next/link";
import { brand } from "@/config/brand";
import { cn } from "@/lib/cn";

/**
 * The Arovenna emblem: a circular crop of the supplied logo
 * (public/brand/arovenna-logo.webp) — never redrawn. Same crop as the seal
 * (see .presence-emblem in globals.css), without the ring or any motion.
 */
export function LogoMark({ className }: { className?: string }) {
  return <span className={cn("brand-mark size-8", className)} aria-hidden="true" />;
}

/**
 * The supplied AROVENNA wordmark, cropped from the logo file. It only works on
 * dark grounds (the crop carries the logo tile's dark green, blended away with
 * `lighten`), so use it on forest backgrounds only; elsewhere use <Logo>.
 */
export function Wordmark({ width = 148, className }: { width?: number; className?: string }) {
  return <span role="img" aria-label={brand.name} className={cn("brand-wordmark", className)} style={{ width, height: Math.round((width * 114) / 894) }} />;
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 font-semibold", className)}>
      <LogoMark />
      <span className="text-[18px] tracking-tight">{brand.name}</span>
    </Link>
  );
}
