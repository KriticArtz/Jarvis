"use client";

import { useActionState, useState } from "react";
import type { ActionResult } from "@/lib/actions/result";
import { saveCheckIn } from "@/lib/actions/tasks";
import { Card, CardHeader } from "@/components/ui/card";
import { FormMessage, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";

const RATINGS = [
  [1, "Rough"],
  [2, "Meh"],
  [3, "Okay"],
  [4, "Good"],
  [5, "Great"],
] as const;

export function CheckInCard({ kind, existing }: { kind: "morning" | "evening"; existing: { rating: number | null; content: string | null } | null }) {
  const [state, action] = useActionState<ActionResult, FormData>(saveCheckIn, { ok: false });
  const [rating, setRating] = useState<number | null>(existing?.rating ?? null);
  const morning = kind === "morning";

  return (
    <Card>
      <CardHeader
        title={morning ? "Morning intention" : "Evening check-in"}
        subtitle={morning ? "What's the #1 thing you want to accomplish today?" : "How'd today go? Your assistant uses this in your weekly review."}
      />
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="kind" value={kind} />
        {!morning ? (
          <div role="radiogroup" aria-label="How did today go?" className="grid grid-cols-5 gap-1.5">
            {RATINGS.map(([value, label]) => (
              <label key={value} className="cursor-pointer">
                <input type="radio" name="rating" value={value} checked={rating === value} onChange={() => setRating(value)} className="peer sr-only" />
                <span
                  className={cn(
                    "block rounded-lg border px-1 py-2 text-center text-xs font-medium transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
                    rating === value ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:bg-surface-2",
                  )}
                >
                  {label}
                </span>
              </label>
            ))}
          </div>
        ) : null}
        <label htmlFor={`checkin-${kind}`} className="sr-only">
          {morning ? "Your #1 thing today" : "Reflection"}
        </label>
        <Textarea
          id={`checkin-${kind}`}
          name="content"
          defaultValue={existing?.content ?? ""}
          rows={2}
          maxLength={2000}
          placeholder={morning ? "e.g. Submit the WGU task before lunch" : "What went well? What got in the way?"}
        />
        <FormMessage tone={state.ok ? "success" : "error"}>{state.ok ? state.message : state.error}</FormMessage>
        <SubmitButton variant="secondary" pendingText="Saving…">
          {existing ? "Update" : "Save"}
        </SubmitButton>
      </form>
    </Card>
  );
}
