import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { ArovennaSymbol } from "@/components/logo";

export type PresenceState = "idle" | "listening" | "thinking" | "acting" | "complete";

const SIZES = { xs: 16, sm: 24, md: 32, lg: 48, xl: 96, hero: 160 } as const;

/**
 * The Arovenna seal — the assistant's mark, independent of the name the user
 * gave it. The Arovenna symbol on a forest face inside a fine gold ring.
 *
 * Still when idle. Motion only while something is really happening:
 * listening (the user is typing to it), thinking (a reply is streaming),
 * acting (an action is running), complete (once, as it finishes). Reduced
 * motion removes all of it; each state stays distinct without motion.
 * Callers pass the real state; never use a state to decorate. Styles live in
 * globals.css (.presence).
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
      <span className="presence-halo" />
      <span className="presence-impression" />
      <svg className="presence-ring" viewBox="0 0 100 100" aria-hidden>
        <circle className="presence-track" cx="50" cy="50" r="49" />
        {/* The arc starts at 12 o'clock; thinking turns the circle itself. */}
        <g transform="rotate(-90 50 50)">
          <circle className="presence-arc" cx="50" cy="50" r="49" pathLength={100} />
        </g>
      </svg>
      <span className="presence-face">
        <ArovennaSymbol className="presence-emblem" />
        <span className="presence-sheen" />
      </span>
    </span>
  );
}
