"use client";

import { Check } from "lucide-react";
import { usePersonalization } from "@/components/app/personalization";

export interface RecentAction {
  id: string;
  summary: string | null;
  created_at: string;
}

/** Changes the assistant actually made (from the Phase 2 action log). */
export function RecentActions({ actions }: { actions: RecentAction[] }) {
  const { assistantName } = usePersonalization();
  return (
    <section aria-labelledby="recent-actions-title">
      <h2 id="recent-actions-title" className="mb-2.5 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
        Done by {assistantName}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <li key={a.id} className="inline-flex max-w-full items-start gap-1.5 rounded-2xl bg-success-soft px-3 py-1.5 text-[13px] leading-snug text-success">
            <Check className="mt-[2px] size-3.5 shrink-0" strokeWidth={3} aria-hidden />
            <span className="min-w-0">{a.summary}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
