import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

/*
 * Pill buttons. Primary carries the accent (the one thing to do here);
 * secondary is a quiet filled surface; ghost is text-weight. Press feedback
 * is a short spring scale; focus uses the accent ring.
 */
const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap select-none transition-[background-color,color,transform,box-shadow,opacity] duration-(--dur-2) ease-soft active:scale-[0.96] active:duration-(--dur-1) focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45";
const variants: Record<Variant, string> = {
  // Depth lives in .btn-primary / .btn-secondary (globals.css, components layer) so a page's own shadow-* class can override it.
  primary: "btn-primary bg-accent text-accent-foreground hover:bg-accent-hover",
  secondary: "btn-secondary bg-surface-2 text-foreground hover:bg-[color-mix(in_oklab,var(--surface-2)_88%,var(--foreground))]",
  ghost: "text-accent hover:bg-accent-soft",
  danger: "bg-danger-soft text-danger hover:bg-[color-mix(in_oklab,var(--danger-soft)_85%,var(--danger))]",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-[15px]",
  lg: "h-[52px] px-7 text-[16px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/** Round icon-only button (close, more, back). Always pass an aria-label. */
export function IconButton({ className, type = "button", ...props }: ComponentProps<"button"> & { "aria-label": string }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition-[background-color,color,transform] duration-(--dur-2) ease-soft hover:bg-surface-2 hover:text-foreground active:scale-[0.92] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45",
        className,
      )}
      {...props}
    />
  );
}
