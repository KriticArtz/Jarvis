import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-[background-color,color,transform,box-shadow] duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 select-none";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground hover:bg-accent-hover shadow-[0_1px_2px_rgba(0,0,0,0.08)]",
  secondary: "bg-surface-2 text-foreground hover:bg-[color-mix(in_oklab,var(--surface-2)_85%,var(--foreground))]",
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
