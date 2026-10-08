"use client";

import { cn } from "@/lib/cn";

/**
 * On/off switch (role="switch"). The thumb travels with a slight spring; the
 * track fills with the accent. Label it with `aria-label` or
 * `aria-labelledby`. With `name`, a hidden input submits "on" in forms.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  name,
  className,
  ...aria
}: {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  name?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}) {
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange?.(!checked)}
        className={cn(
          "relative inline-flex h-[30px] w-[50px] shrink-0 items-center rounded-full p-[3px] transition-[background-color,box-shadow] duration-(--dur-3) ease-soft",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-45",
          checked ? "bg-accent" : "bg-[color-mix(in_oklab,var(--foreground)_14%,transparent)]",
          className,
        )}
        {...aria}
      >
        <span
          aria-hidden
          className={cn(
            "block size-6 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.18),0_3px_8px_-2px_rgba(0,0,0,0.2)] transition-transform duration-(--dur-3) ease-spring",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
      {name && checked ? <input type="hidden" name={name} value="on" /> : null}
    </>
  );
}
