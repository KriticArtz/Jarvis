"use client";

import { Check, CircleAlert, Clock, X } from "lucide-react";
import type { ChatAction } from "@/lib/assistant/stream-protocol";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/spinner";

/**
 * Subtle status of actions the assistant took for this reply. A change that
 * needs the user's OK shows its summary (e.g. "Move “Dentist” / Current: … /
 * New: …") with Confirm and Cancel buttons when `onAnswer` is provided.
 */
export function ActionChips({
  actions,
  onAnswer,
  busyId,
}: {
  actions: ChatAction[];
  onAnswer?: (action: ChatAction, decision: "confirm" | "decline") => void;
  /** The confirmation being answered right now. */
  busyId?: string | null;
}) {
  if (!actions.length) return null;
  return (
    <ul className="mb-1.5 flex max-w-[86%] flex-col items-start gap-1" aria-label="Actions">
      {actions.map((a) => {
        const answerable = a.status === "needs_confirmation" && a.confirmationId && onAnswer;
        const busy = Boolean(busyId && busyId === a.confirmationId);
        return (
          <li
            key={a.id}
            className={cn(
              "inline-flex max-w-full animate-fade-in flex-col rounded-2xl px-3 py-1.5 text-[13px] leading-snug",
              a.status === "running" && "bg-surface-2 text-muted",
              a.status === "succeeded" && "bg-success-soft text-success",
              a.status === "failed" && "bg-danger-soft text-danger",
              a.status === "needs_confirmation" && "bg-warning-soft text-warning",
              answerable && "py-2.5",
            )}
          >
            <span className="inline-flex items-start gap-1.5">
              <span className="mt-[2px] shrink-0">
                {a.status === "running" ? (
                  <Spinner className="size-3" label="Working" />
                ) : a.status === "succeeded" ? (
                  <Check className="size-3.5" strokeWidth={3} aria-label="Done" />
                ) : a.status === "failed" ? (
                  <X className="size-3.5" strokeWidth={3} aria-label="Not done" />
                ) : a.status === "needs_confirmation" ? (
                  <Clock className="size-3.5" aria-label="Waiting for your OK" />
                ) : (
                  <CircleAlert className="size-3.5" />
                )}
              </span>
              <span className="whitespace-pre-line">{a.status === "needs_confirmation" ? `Waiting for your OK: ${a.label}` : a.label}</span>
            </span>
            {answerable ? (
              <span className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={Boolean(busyId)}
                  onClick={() => onAnswer(a, "confirm")}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-semibold text-accent-foreground transition-all active:scale-95 disabled:opacity-50"
                >
                  {busy ? <Spinner className="size-3.5" label="Confirming" /> : <Check className="size-4" aria-hidden />} Confirm
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyId)}
                  onClick={() => onAnswer(a, "decline")}
                  className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-[14px] font-semibold text-foreground shadow-card transition-all active:scale-95 disabled:opacity-50"
                >
                  Cancel
                </button>
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
