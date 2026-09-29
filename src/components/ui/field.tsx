import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-2xl border border-transparent bg-surface-2 px-4 text-[16px] text-foreground placeholder:text-muted/70 transition-[background-color,box-shadow,border-color] duration-200 focus:border-accent/40 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-ring disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-soft/40";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-12", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 py-3 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, "h-12 appearance-auto pr-8", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormMessage({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  if (!children) return null;
  const tones = {
    error: "bg-danger-soft text-danger",
    success: "bg-success-soft text-success",
    info: "bg-accent-soft text-foreground",
  };
  return (
    <p role={tone === "error" ? "alert" : "status"} className={cn("animate-fade-in rounded-2xl px-4 py-3 text-sm", tones[tone])}>
      {children}
    </p>
  );
}
