import { cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/*
 * Inputs sit in a quiet filled well with a hairline edge; focus lifts them to
 * the raised surface with the accent ring. 16px text avoids iOS zoom.
 */
const control =
  "w-full rounded-control border border-hairline bg-surface-2 px-4 text-[16px] text-foreground placeholder:text-muted transition-[background-color,box-shadow,border-color] duration-(--dur-2) ease-soft hover:border-border focus:border-accent/50 focus:bg-surface-raised focus:outline-none focus:ring-4 focus:ring-ring disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-soft/40";

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
  return <label className={cn("text-[14px] font-medium text-foreground", className)} {...props} />;
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
  // Tie the hint or error to the control so screen readers announce it with the field.
  const noteId = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;
  let control = children;
  if (noteId && isValidElement(children)) {
    const el = children as ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: unknown }>;
    if (el.props.id === htmlFor) {
      const describedBy = [el.props["aria-describedby"], noteId].filter(Boolean).join(" ");
      control = cloneElement(el, {
        "aria-describedby": describedBy,
        ...(error && el.props["aria-invalid"] === undefined ? { "aria-invalid": true } : {}),
      });
    }
  }
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {control}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-muted">
          {hint}
        </p>
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
    <p role={tone === "error" ? "alert" : "status"} className={cn("animate-fade-in rounded-control px-4 py-3 text-sm", tones[tone])}>
      {children}
    </p>
  );
}
