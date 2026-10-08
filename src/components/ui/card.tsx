import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/*
 * Surfaces. The redesign uses far fewer cards: group with type, hairlines and
 * space, and raise a surface only for things you act on.
 *   raised — (default) an elevated panel
 *   plain  — same shape, no elevation (sits on a raised parent)
 *   ai     — authored by the assistant: a faint presence wash
 */
type CardVariant = "raised" | "plain" | "ai";

const CARD: Record<CardVariant, string> = {
  raised: "bg-surface-raised shadow-card",
  plain: "bg-surface-2/70",
  ai: "bg-assistant shadow-lift",
};

export function Card({ className, variant = "raised", ...props }: ComponentProps<"section"> & { variant?: CardVariant }) {
  // A page's own padding (e.g. p-0 for an edge-to-edge list) replaces the default instead of competing with it.
  const customPadding = /(^|\s)p-/.test(className ?? "");
  return <section className={cn("rounded-panel", !customPadding && "p-5 sm:p-6", CARD[variant], className)} {...props} />;
}

export function CardHeader({ title, action, subtitle }: { title: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[17px] font-semibold tracking-[-0.012em]">{title}</h2>
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
        <h2 className="text-title font-semibold">{title}</h2>
        {subtitle ? <p className="text-[14px] text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1.5 rounded-tile bg-surface-2/60 p-5">
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
        <h1 className="type-display text-[32px] leading-tight sm:text-[36px]">{title}</h1>
        {subtitle ? <p className="mt-1 text-[16px] text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}
