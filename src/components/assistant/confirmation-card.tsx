"use client";

import { confirmLabel, isDestructive, whenLabel, type ActionCard, type PlanCard } from "@/lib/assistant/cards";
import type { ChatAction } from "@/lib/assistant/stream-protocol";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { CardDetails, panelClass, PlanItems, PlanNotes } from "./action-result";

/**
 * A change that needs the user's OK before it happens. Approve / Not now run
 * the existing confirmation path (`answerProposal`, the same rules as
 * replying "yes"); nothing here changes what needs confirming.
 */

interface AnswerProps {
  action: ChatAction;
  today: string;
  /** Absent when the proposal can't be answered from here (then: reply "yes"). */
  onAnswer?: (action: ChatAction, decision: "confirm" | "decline") => void;
  /** This proposal is being answered right now. */
  busy: boolean;
  /** Another answer (or a reply) is in progress. */
  disabled: boolean;
}

function Before({ card, today }: { card: Exclude<ActionCard, PlanCard>; today: string }) {
  if (card.kind === "goal" || !card.previous || !card.when) return <CardDetails card={card} today={today} showPrevious={false} className="mt-1.5" />;
  return (
    <div className="mt-1.5">
      <p className="text-[17px] font-semibold leading-snug [overflow-wrap:anywhere]">{card.title}</p>
      <dl className="type-num mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[15px] leading-snug">
        <dt className="text-[13px] leading-[22px] text-muted">From</dt>
        <dd className="text-muted">{whenLabel(card.previous, today)}</dd>
        <dt className="text-[13px] leading-[22px] text-muted">To</dt>
        <dd className="font-medium">{whenLabel(card.when, today)}</dd>
      </dl>
    </div>
  );
}

function Answer({ action, onAnswer, busy, disabled, approve, destructive, secondary }: Omit<AnswerProps, "today"> & { approve: string; destructive?: boolean; secondary: { label: string; onClick: () => void } }) {
  if (!onAnswer) return <p className="mt-3 text-[13px] text-muted">Reply “yes” to confirm.</p>;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button variant={destructive ? "danger" : "primary"} disabled={disabled} onClick={() => onAnswer(action, "confirm")}>
        {busy ? "Working…" : approve}
      </Button>
      <Button variant="ghost" disabled={disabled} onClick={secondary.onClick}>
        {secondary.label}
      </Button>
    </div>
  );
}

export function ConfirmationCard({ action, today, onAnswer, busy, disabled }: AnswerProps) {
  const card = action.card && action.card.kind !== "plan" ? action.card : null;
  return (
    <div className={cn(panelClass, "animate-fade-in")} data-card="confirmation">
      <p className="type-eyebrow">
        <span className="text-warning">Needs your OK</span>
      </p>
      {card ? (
        <>
          <Before card={card} today={today} />
          {card.kind === "event" && card.notes.length ? <PlanNotes notes={card.notes} /> : null}
        </>
      ) : (
        <p className="mt-1.5 whitespace-pre-line text-[15px] leading-snug [overflow-wrap:anywhere]">{action.label}</p>
      )}
      <Answer
        action={action}
        onAnswer={onAnswer}
        busy={busy}
        disabled={disabled}
        approve={confirmLabel(card)}
        destructive={isDestructive(card)}
        secondary={{ label: "Not now", onClick: () => onAnswer?.(action, "decline") }}
      />
    </div>
  );
}

/**
 * A proposed plan for today. "Use this plan" approves it through the same
 * confirmation path; "Adjust" just hands the conversation back (the proposal
 * stays open and nothing is applied).
 */
export function PlanPreview({ action, card, today, onAnswer, onAdjust, busy, disabled }: AnswerProps & { card: PlanCard; onAdjust: () => void }) {
  return (
    <div className={cn(panelClass, "animate-fade-in")} data-card="plan-preview">
      <div className="flex items-baseline justify-between gap-3">
        <p className="type-eyebrow">
          <span className="text-foreground">{card.date === today ? "Your day" : "Your plan"}</span>
        </p>
        <p className="text-[12px] text-warning">Needs your OK</p>
      </div>
      <div className="mt-2">
        <PlanItems card={card} />
        <PlanNotes notes={card.notes} />
      </div>
      <Answer action={action} onAnswer={onAnswer} busy={busy} disabled={disabled} approve="Use this plan" secondary={{ label: "Adjust", onClick: onAdjust }} />
    </div>
  );
}
