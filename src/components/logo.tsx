import Link from "next/link";
import { brand } from "@/config/brand";
import { cn } from "@/lib/cn";

/*
 * The Arovenna mark: two slanted bars over an open triangle, all edges at one
 * angle. Flat, one colour, no fine detail, so it reads from 16 px up. It draws
 * in currentColor; the tile (LogoMark) is champagne gold on forest green.
 */
const SYMBOL =
  "M27.86 11.61L45.18 11.61L10.89 68.75L2.2 54.32ZM72.14 11.61L54.82 11.61L89.11 68.75L97.8 54.32ZM50 27.68L80.86 79.11L75.36 88.39L24.64 88.39L19.14 79.11ZM50 52.68L64.89 77.5L35.11 77.5Z";

/** The bare symbol, in currentColor. Corners are softened by a hairline stroke in the same colour. */
export function ArovennaSymbol({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false">
      <path d={SYMBOL} fill="currentColor" fillRule="evenodd" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/** The app mark: the symbol in champagne gold on a forest-green tile. Works on light and dark grounds. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("brand-mark size-8", className)} aria-hidden="true">
      <ArovennaSymbol className="brand-mark-symbol" />
    </span>
  );
}

/*
 * AROVENNA, traced from the supplied wordmark (the A drawn without a crossbar,
 * thick and thin strokes). In currentColor; size it by height.
 */
const WORDMARK =
  "M241,856 L248,856 L209,930 L203,930 Z M241,856 L248,856 L286,930 L274,930 Z M335,856 L346,856 L346,930 L335,930 Z M346,856 L362,856 C380,856 386,866 386,876 C386,887 379,896 362,896 L346,896 L346,891 L360,891 C371,891 375,884 375,876 C375,867 370,861 360,861 L346,861 Z M357,896 L368,896 L389,930 L377,930 Z M473,855.5 A40,37.5 0 1 0 473.01,855.5 Z M473,860.5 A29,32.5 0 1 1 472.99,860.5 Z M550,856 L562,856 L590,930 L582,930 Z M614,856 L620,856 L590,930 L583,930 Z M666,856 L677,856 L677,930 L666,930 Z M677,856 L713,856 L713,861 L677,861 Z M677,889 L703,889 L703,894 L677,894 Z M677,925 L714,925 L714,930 L677,930 Z M764,856 L770,856 L770,930 L764,930 Z M818,856 L824,856 L824,930 L818,930 Z M764,856 L776,856 L824,930 L812,930 Z M878,856 L884,856 L884,930 L878,930 Z M932,856 L938,856 L938,930 L932,930 Z M878,856 L890,856 L938,930 L926,930 Z M1010,856 L1017,856 L983,930 L977,930 Z M1010,856 L1017,856 L1051,930 L1038,930 Z";

export function Wordmark({ className }: { className?: string }) {
  return (
    <svg viewBox="196 850 862 86" className={cn("h-3 w-auto", className)} role="img" aria-label={brand.name}>
      <path d={WORDMARK} fill="currentColor" />
    </svg>
  );
}

/** Small mark and an understated wordmark. */
export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} aria-label={`${brand.name} home`} className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-7" />
      <Wordmark className="h-[11px]" />
    </Link>
  );
}
