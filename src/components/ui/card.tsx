import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-[28px] bg-surface p-5 shadow-card sm:p-6", className)} {...props} />;
}

export function CardHeader({ title, action, subtitle }: { title: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[17px] font-semibold">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[14px] text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Section title that sits on the canvas, outside a card. */
export function SectionHeader({ title, action, subtitle }: { title: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 px-1">
      <div>
        <h2 className="text-[20px] font-semibold">{title}</h2>
        {subtitle ? <p className="text-[14px] text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1.5 rounded-3xl bg-surface-2/60 p-5">
      <p className="font-semibold">{title}</p>
      {body ? <p className="text-[14px] leading-relaxed text-muted">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "accent" | "success" | "warning" | "danger"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-surface-2 text-muted",
    accent: "bg-accent-soft text-accent",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium", tones[tone], className)}>{children}</span>;
}

export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-7 flex animate-fade-in flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[32px] font-bold leading-tight sm:text-[36px]">{title}</h1>
        {subtitle ? <p className="mt-1 text-[16px] text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}
