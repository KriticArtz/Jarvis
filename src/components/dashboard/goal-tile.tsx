"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import type { GoalProgressSummary } from "@/lib/progress";
import { ProgressRing } from "@/components/ui/progress-bar";
import { LogProgressForm } from "@/components/goals/log-progress-form";
import { cn } from "@/lib/cn";

const PACE: Record<GoalProgressSummary["pace"], { label: string; className: string } | null> = {
  done: { label: "Done", className: "text-success" },
  ahead: { label: "Ahead", className: "text-success" },
  on_track: { label: "On track", className: "text-accent" },
  behind: { label: "Behind", className: "text-warning" },
  not_applicable: null,
};

export function GoalTile({ id, title, category, summary }: { id: string; title: string; category: string; summary: GoalProgressSummary }) {
  const [logging, setLogging] = useState(false);
  const pace = PACE[summary.pace];
  const unit = summary.unit ?? "times";
  const pct = summary.ratio != null ? Math.round(summary.ratio * 100) : null;

  return (
    <div className={cn("flex flex-col rounded-[24px] bg-surface p-4 shadow-card transition-shadow duration-300 hover:shadow-lift", logging && "col-span-2 sm:col-span-1")}>
      <div className="flex items-start justify-between gap-2">
        <ProgressRing value={summary.ratio} size={58} stroke={6.5} label={`${title} progress`} tone={summary.pace === "done" ? "success" : "accent"}>
          <span className="text-[13px] font-semibold tabular-nums">{pct != null ? `${pct}%` : "—"}</span>
        </ProgressRing>
        <button
          type="button"
          onClick={() => setLogging((v) => !v)}
          aria-expanded={logging}
          aria-label={logging ? `Close logging for ${title}` : `Log progress for ${title}`}
          className="flex size-8 items-center justify-center rounded-full bg-surface-2 text-foreground transition-all hover:bg-accent-soft hover:text-accent active:scale-90"
        >
          {logging ? <X className="size-4" /> : <Plus className="size-4" />}
        </button>
      </div>
      <Link href={`/goals/${id}`} className="mt-3 block min-w-0">
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted">{category}</p>
        <p className="mt-0.5 line-clamp-2 text-[16px] font-semibold leading-snug">{title}</p>
        <p className="mt-1 text-[13px] text-muted">
          <span className="tabular-nums">{summary.label}</span>
          {pace ? <span className={cn("font-medium", pace.className)}> · {pace.label}</span> : null}
        </p>
      </Link>
      {logging ? (
        <div className="mt-3 animate-fade-in border-t border-hairline pt-3">
          <LogProgressForm goalId={id} unit={unit} defaultAmount={unit === "minutes" ? 30 : 1} onLogged={() => setLogging(false)} />
        </div>
      ) : null}
    </div>
  );
}
