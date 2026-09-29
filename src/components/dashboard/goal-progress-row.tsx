"use client";

import { useState } from "react";
import Link from "next/link";
import type { GoalProgressSummary } from "@/lib/progress";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/card";
import { LogProgressForm } from "@/components/goals/log-progress-form";

const PACE: Record<GoalProgressSummary["pace"], { label: string; tone: "success" | "accent" | "warning" | "neutral" } | null> = {
  done: { label: "Done", tone: "success" },
  ahead: { label: "Ahead", tone: "success" },
  on_track: { label: "On track", tone: "accent" },
  behind: { label: "Behind", tone: "warning" },
  not_applicable: null,
};

export function GoalProgressRow({ id, title, summary }: { id: string; title: string; summary: GoalProgressSummary }) {
  const [logging, setLogging] = useState(false);
  const pace = PACE[summary.pace];
  const unit = summary.unit ?? "times";
  const defaultAmount = unit === "minutes" ? 30 : unit === "hours" ? 1 : 1;

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/goals/${id}`} className="min-w-0 truncate font-medium hover:underline">
          {title}
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          {pace ? <Badge tone={pace.tone}>{pace.label}</Badge> : null}
          <button type="button" onClick={() => setLogging((v) => !v)} className="rounded-lg px-2 py-1 text-sm font-medium text-accent hover:bg-accent-soft" aria-expanded={logging}>
            {logging ? "Close" : "Log"}
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <ProgressBar value={summary.ratio} label={`${title} progress`} tone={summary.pace === "behind" ? "warning" : summary.pace === "done" ? "success" : "accent"} />
        <span className="shrink-0 text-sm tabular-nums text-muted">{summary.label}</span>
      </div>
      {logging ? (
        <div className="mt-3">
          <LogProgressForm goalId={id} unit={unit} defaultAmount={defaultAmount} onLogged={() => setLogging(false)} />
        </div>
      ) : null}
    </li>
  );
}
