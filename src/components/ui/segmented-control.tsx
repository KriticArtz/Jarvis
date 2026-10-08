"use client";

import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { nextIndex } from "@/lib/ui/roving";

export interface Segment<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

/**
 * A few mutually exclusive options in one pill (Light / Dark / System,
 * Day / Week). A raised indicator slides to the selected segment. Keyboard:
 * arrows move and select, like a radio group.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "md",
  ...aria
}: {
  options: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
  "aria-label": string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  const onKeyDown = (e: KeyboardEvent) => {
    const next = nextIndex(index, e.key, options.length);
    if (next == null) return;
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      onKeyDown={onKeyDown}
      className={cn("relative grid rounded-full bg-surface-2 p-1 shadow-[inset_0_0_0_1px_var(--hairline)]", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } as CSSProperties}
      {...aria}
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-full bg-surface-raised shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_12px_-6px_rgba(0,0,0,0.18),inset_0_0_0_1px_var(--hairline)] transition-transform duration-(--dur-3) ease-spring"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={i === index}
          tabIndex={i === index ? 0 : -1}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative z-10 inline-flex items-center justify-center gap-1.5 rounded-full px-3 font-medium transition-colors duration-(--dur-2)",
            "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring",
            size === "sm" ? "h-8 text-[13px]" : "h-9 text-[14px]",
            i === index ? "text-foreground" : "text-muted hover:text-foreground",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
