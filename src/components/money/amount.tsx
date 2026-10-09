import { money } from "@/lib/money/format";
import { cn } from "@/lib/cn";

/**
 * A money amount as it should read in a list: money in is green with a "+",
 * money out stays in ink (spending isn't an alarm). Tabular figures so
 * columns line up.
 */
export function Amount({ value, cents = true, className }: { value: number; cents?: boolean; className?: string }) {
  return <span className={cn("type-num whitespace-nowrap", value > 0 ? "text-money-in" : "text-foreground", className)}>{money(value, { cents, sign: value > 0 })}</span>;
}

/** Small uppercase label over a figure. */
export function Figure({ label, value, hint, className, size = "md" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; className?: string; size?: "md" | "lg" }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="type-eyebrow">{label}</p>
      <p className={cn("type-num mt-1 font-semibold tracking-[-0.02em]", size === "lg" ? "text-[26px] leading-tight" : "text-[20px] leading-tight")}>{value}</p>
      {hint ? <p className="mt-0.5 text-[13px] leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}
