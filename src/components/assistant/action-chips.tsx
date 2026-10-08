"use client";

import { Check, Minus, RotateCcw, X } from "lucide-react";
import { changedNothing, isRetryable, type ChatAction } from "@/lib/assistant/stream-protocol";
import { Presence } from "@/components/ui/presence";
import { Button } from "@/components/ui/button";
import { ActionResult } from "./action-result";
import { ConfirmationCard, PlanPreview } from "./confirmation-card";

/** The tool's own failure message may already say nothing changed. */
const SAYS_UNCHANGED = /nothing|didn'?t make|did not make|left it|won'?t make/i;

/**
 * What the assistant did for this reply. Finished actions with a structured
 * result show as an ActionResult; proposals as a ConfirmationCard (or a
 * PlanPreview for a new plan); running, failed and declined actions as quiet
 * lines. A failure never shows a result card.
 */
export function ActionChips({
  actions,
  today,
  onAnswer,
  busyId,
  disabled = false,
  onRetry,
  onAdjust,
}: {
  actions: ChatAction[];
  today: string;
  onAnswer?: (action: ChatAction, decision: "confirm" | "decline") => void;
  /** The confirmation being answered right now. */
  busyId?: string | null;
  /** A reply is streaming; proposals can't be answered meanwhile. */
  disabled?: boolean;
  /** Offered on failures worth trying again (only on the latest reply). */
  onRetry?: () => void;
  /** "Adjust" on a proposed plan: back to the conversation. */
  onAdjust?: () => void;
}) {
  if (!actions.length) return null;
  return (
    <ul className="flex flex-col gap-3" aria-label="What I did">
      {actions.map((a) => {
        if (a.status === "needs_confirmation") {
          const props = {
            action: a,
            today,
            onAnswer: a.confirmationId ? onAnswer : undefined,
            busy: Boolean(busyId && busyId === a.confirmationId),
            disabled: Boolean(busyId) || disabled,
          };
          return (
            <li key={a.id}>
              {a.card?.kind === "plan" ? <PlanPreview {...props} card={a.card} onAdjust={onAdjust ?? (() => {})} /> : <ConfirmationCard {...props} />}
            </li>
          );
        }
        if (a.status === "succeeded" && a.card) {
          return (
            <li key={a.id}>
              <ActionResult card={a.card} today={today} />
            </li>
          );
        }
        if (a.status === "declined") {
          const what = a.card ? (a.card.kind === "plan" ? "Today's plan stays as it was." : `“${a.card.title}” stays as it was.`) : "Nothing was changed.";
          // The reply above already says "I won't make that change"; this names what stayed put.
          return (
            <li key={a.id} className="flex animate-fade-in items-start gap-2.5 text-[14px] leading-snug text-muted" data-action-state="declined">
              <span className="mt-[1px] flex size-5 shrink-0 items-center justify-center">
                <Minus className="size-4" strokeWidth={2.4} aria-hidden />
              </span>
              <span>{what}</span>
            </li>
          );
        }
        if (a.status === "failed") {
          return (
            <li key={a.id} className="animate-fade-in" data-action-state="failed">
              <div className="flex items-start gap-2.5 text-[14px] leading-snug">
                <span className="mt-[1px] flex size-5 shrink-0 items-center justify-center">
                  <span className="flex size-[18px] items-center justify-center rounded-full bg-danger text-white">
                    <X className="size-3" strokeWidth={3.2} aria-hidden />
                  </span>
                </span>
                <span>
                  <span className="sr-only">Not done: </span>
                  <span className="whitespace-pre-line text-danger">{a.label}</span>
                  {changedNothing(a) && !SAYS_UNCHANGED.test(a.label) ? <span className="block text-muted">Nothing was changed.</span> : null}
                </span>
              </div>
              {onRetry && isRetryable(a) ? (
                <Button variant="secondary" className="mt-2.5 ml-[30px]" onClick={onRetry} disabled={disabled}>
                  <RotateCcw className="size-4" aria-hidden />
                  Try again
                </Button>
              ) : null}
            </li>
          );
        }
        return (
          <li key={a.id} className="flex animate-fade-in items-start gap-2.5 text-[14px] leading-snug">
            <span className="mt-[1px] flex size-5 shrink-0 items-center justify-center">
              {a.status === "running" ? (
                <Presence size={14} state="acting" />
              ) : (
                <span className="flex size-[18px] items-center justify-center rounded-full bg-success text-white">
                  <Check className="check-pop size-3" strokeWidth={3.2} aria-label="Done" />
                </span>
              )}
            </span>
            <span className={a.status === "running" ? "whitespace-pre-line text-muted" : "whitespace-pre-line text-foreground"}>{a.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
