"use client";

import { useActionState, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ActionResult } from "@/lib/actions/result";
import { saveCheckIn } from "@/lib/actions/tasks";
import { Presence } from "@/components/ui/presence";
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

/**
 * A contextual check-in: in the morning (no intention yet) and the evening
 * (no reflection yet), one quiet line that opens into a short form. Same
 * action as before; it's simply no longer a permanent card.
 */
export function CheckInPrompt({ kind, assistantName }: { kind: "morning" | "evening"; assistantName: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult, FormData>(saveCheckIn, { ok: false });
  const [rating, setRating] = useState<number | null>(null);
  const morning = kind === "morning";
  const question = morning ? "What's the one thing you want to get done today?" : "How did today go?";

  if (state.ok) {
    return <p className="animate-fade-in px-1 text-[14px] text-muted">{morning ? `Got it — ${assistantName} will plan around it.` : "Thanks — that goes into your weekly review."}</p>;
  }

  return (
    <section aria-label={morning ? "Morning intention" : "Evening check-in"} className="rounded-panel shadow-[inset_0_0_0_1px_var(--hairline)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 rounded-panel px-4 text-left transition-colors hover:bg-surface-2/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
      >
        <Presence size="xs" />
        <span className="flex-1 text-[15px] font-medium">{question}</span>
        <ChevronRight className={cn("size-4 text-subtle transition-transform duration-(--dur-2)", open && "rotate-90")} aria-hidden />
      </button>
      {open ? (
        <form action={action} className="animate-fade-in flex flex-col gap-3 px-4 pb-4">
          <input type="hidden" name="kind" value={kind} />
          {!morning ? (
            <div role="radiogroup" aria-label="How did today go?" className="grid grid-cols-5 gap-1.5">
              {RATINGS.map(([value, label]) => (
                <label key={value} className="cursor-pointer">
                  <input type="radio" name="rating" value={value} checked={rating === value} onChange={() => setRating(value)} className="peer sr-only" />
                  <span
                    className={cn(
                      "flex min-h-11 items-center justify-center rounded-control text-[13px] font-medium transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-ring",
                      rating === value ? "bg-accent-soft text-accent shadow-[inset_0_0_0_1.5px_var(--accent)]" : "bg-surface-2 text-muted hover:text-foreground",
                    )}
                  >
                    {label}
                  </span>
                </label>
              ))}
            </div>
          ) : null}
          <label htmlFor={`checkin-${kind}`} className="sr-only">
            {question}
          </label>
          <Textarea
            id={`checkin-${kind}`}
            name="content"
            rows={2}
            maxLength={2000}
            autoFocus
            placeholder={morning ? "e.g. Send the proposal before lunch" : "What went well? What got in the way?"}
          />
          <FormMessage>{state.ok ? null : state.error}</FormMessage>
          <SubmitButton variant="secondary" pendingText="Saving…">
            Save
          </SubmitButton>
        </form>
      ) : null}
    </section>
  );
}
