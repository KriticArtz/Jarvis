import { cn } from "@/lib/cn";

export function ProgressBar({ value, tone = "accent", label, className }: { value: number | null; tone?: "accent" | "success" | "warning"; label: string; className?: string }) {
  const pct = value == null ? 0 : Math.round(Math.max(0, Math.min(1, value)) * 100);
  const tones = { accent: "bg-brand-gradient", success: "bg-success", warning: "bg-warning" };
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", tones[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Circular progress. The track is subtle; the arc uses the brand gradient. */
export function ProgressRing({
  value,
  size = 64,
  stroke = 7,
  label,
  tone = "accent",
  children,
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  label: string;
  tone?: "accent" | "success" | "warning";
  children?: React.ReactNode;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const id = `ring-${label.replace(/[^a-z0-9]/gi, "")}-${size}`;
  const color = tone === "success" ? "var(--success)" : tone === "warning" ? "var(--warning)" : `url(#${id})`;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--grad-from)" />
            <stop offset="100%" stopColor="var(--grad-to)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.2,0.7,0.2,1)" }}
        />
      </svg>
      {children ? <div className="absolute inset-0 flex items-center justify-center">{children}</div> : null}
    </div>
  );
}
