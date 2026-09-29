import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-xl border border-border bg-surface px-3.5 text-[15px] text-foreground placeholder:text-muted/70 transition-colors focus:border-accent focus:outline-none focus:ring-4 focus:ring-ring disabled:opacity-60 aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, "h-11 appearance-auto pr-8", className)} {...props} />;
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
    <p role={tone === "error" ? "alert" : "status"} className={cn("rounded-xl px-3.5 py-2.5 text-sm", tones[tone])}>
      {children}
    </p>
  );
}
