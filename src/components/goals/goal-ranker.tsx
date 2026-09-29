"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { Goal } from "@/lib/types/domain";
import { saveGoalRanking } from "@/lib/actions/goals";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";

/** Keyboard- and touch-friendly ordering with up/down controls. */
export function GoalRanker({ goals, submitLabel = "Save order", onSaved }: { goals: Goal[]; submitLabel?: string; onSaved?: () => void }) {
  const [order, setOrder] = useState(goals);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const move = (index: number, delta: number) => {
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setOrder(next);
    setSaved(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-2">
        {order.map((g, i) => (
          <li key={g.id} className="flex items-center gap-3 rounded-2xl bg-surface-2/70 px-3 py-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-sm font-semibold text-accent">{i + 1}</span>
            <span className="flex-1 font-medium">{g.title}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded-lg p-2 text-muted hover:bg-surface-2 disabled:opacity-30" aria-label={`Move ${g.title} up`}>
                <ArrowUp className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === order.length - 1}
                className="rounded-lg p-2 text-muted hover:bg-surface-2 disabled:opacity-30"
                aria-label={`Move ${g.title} down`}
              >
                <ArrowDown className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <FormMessage>{error}</FormMessage>
      {saved && !onSaved ? <FormMessage tone="success">Order saved.</FormMessage> : null}
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await saveGoalRanking(order.map((g) => g.id));
            if (!res.ok) return setError(res.error ?? "Couldn't save.");
            setError(null);
            setSaved(true);
            onSaved?.();
          })
        }
      >
        {pending ? "Saving…" : submitLabel}
      </Button>
    </div>
  );
}
