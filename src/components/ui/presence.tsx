import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

export type PresenceState = "idle" | "listening" | "thinking" | "acting" | "complete";

const SIZES = { xs: 16, sm: 24, md: 32, lg: 48, xl: 96, hero: 160 } as const;

/**
 * The AI's living mark — the product's recurring identity, independent of
 * the assistant's (or the product's) name. A theme-gradient orb that
 * breathes when idle, brightens while listening, ripples while thinking,
 * sends out a pulse while acting, and settles calmly once complete. Styles live in globals.css (.presence).
 *
 * Decorative by default; pass `label` when it stands alone (e.g. a tab).
 */
export function Presence({
  state = "idle",
  size = "md",
  label,
  className,
}: {
  state?: PresenceState;
  size?: keyof typeof SIZES | number;
  label?: string;
  className?: string;
}) {
  const px = typeof size === "number" ? size : SIZES[size];
  return (
    <span
      className={cn("presence", className)}
      data-state={state}
      style={{ "--presence-size": `${px}px` } as CSSProperties}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <span className="presence-glow" />
      <span className="presence-ring" />
      <span className="presence-ring" />
      <span className="presence-core" />
    </span>
  );
}
