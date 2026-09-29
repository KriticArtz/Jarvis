import { cn } from "@/lib/cn";

export function ProgressBar({ value, tone = "accent", label, className }: { value: number | null; tone?: "accent" | "success" | "warning"; label: string; className?: string }) {
  const pct = value == null ? 0 : Math.round(Math.max(0, Math.min(1, value)) * 100);
  const tones = { accent: "bg-accent", success: "bg-success", warning: "bg-warning" };
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-2", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", tones[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}
