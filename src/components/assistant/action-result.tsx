import { Check } from "lucide-react";
import { durationLabel, previousLabel, resultHeading, whenLabel, type ActionCard, type PlanCard } from "@/lib/assistant/cards";
import { formatTime12 } from "@/lib/time";
import { cn } from "@/lib/cn";

/**
 * Structured action results in the conversation. Typography carries the
 * hierarchy: a small heading for what happened, the thing itself, then when
 * and the quieter details. A hairline panel ties it to the reply above.
 * Shared pieces (details, plan list) are reused by the confirmation card.
 */

export const panelClass = "max-w-[440px] rounded-tile bg-surface-raised px-4 py-3.5 shadow-[0_0_0_1px_var(--hairline)] sm:px-5 sm:py-4";

/** Title, time and details of a task / event / goal card. */
export function CardDetails({ card, today, showPrevious = true, className }: { card: Exclude<ActionCard, PlanCard>; today: string; showPrevious?: boolean; className?: string }) {
  const removed = card.action === "deleted";
  return (
    <div className={className}>
      <p className={cn("text-[17px] font-semibold leading-snug [overflow-wrap:anywhere]", removed && "text-muted line-through decoration-1")}>{card.title}</p>
      {card.kind !== "goal" && card.when ? <p className="type-num mt-0.5 text-[15px] leading-snug">{whenLabel(card.when, today)}</p> : null}
      {card.kind === "task" && durationLabel(card.durationMinutes) ? <p className="type-num text-[14px] leading-snug text-muted">{durationLabel(card.durationMinutes)}</p> : null}
      {card.kind === "event" && card.location ? <p className="text-[14px] leading-snug text-muted [overflow-wrap:anywhere]">{card.location}</p> : null}
      {card.kind === "goal" && card.detail ? <p className="type-num mt-0.5 text-[15px] leading-snug text-muted">{card.detail}</p> : null}
      {showPrevious && card.kind !== "goal" && card.previous ? (
        <p className="type-num mt-2 text-[13px] leading-snug text-muted">{previousLabel(card.previous, today)}</p>
      ) : null}
    </div>
  );
}

/** A day's plan as a quiet timetable: clock time, then the item. */
export function PlanItems({ card }: { card: PlanCard }) {
  if (!card.items.length) return <p className="text-[15px] text-muted">Nothing new to schedule.</p>;
  return (
    <ol className="flex flex-col" aria-label="Plan">
      {card.items.map((item, i) => (
        <li key={`${item.start}-${i}`} className="flex items-baseline gap-4 border-b border-hairline py-2 last:border-b-0">
          <span className="type-time w-[68px] shrink-0 text-[13px] text-muted">{item.start ? formatTime12(item.start) : "Anytime"}</span>
          <span className="min-w-0 flex-1 text-[15px] leading-snug [overflow-wrap:anywhere]">{item.title}</span>
          {item.durationMinutes ? <span className="type-num shrink-0 text-[13px] text-subtle">{durationLabel(item.durationMinutes)}</span> : null}
        </li>
      ))}
    </ol>
  );
}

export function PlanNotes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {notes.map((n) => (
        <li key={n} className="text-[13px] leading-snug text-muted">
          {n}
        </li>
      ))}
    </ul>
  );
}

/** A finished action, e.g. MOVED · Workout · Tomorrow · 5:30 PM · 45 min · Moved from today · 6:00 PM. */
export function ActionResult({ card, today }: { card: ActionCard; today: string }) {
  const removed = "action" in card && (card.action === "deleted" || card.action === "skipped");
  return (
    <div className={cn(panelClass, "animate-fade-in")} data-card={card.kind} data-action={card.action}>
      {/* .type-eyebrow sets its own colour; the inner span carries the state colour. */}
      <p className="type-eyebrow">
        <span className={cn("flex items-center gap-1.5", removed ? "text-muted" : "text-success")}>
          <Check className="check-pop size-3.5" strokeWidth={3} aria-hidden />
          {resultHeading(card)}
        </span>
      </p>
      {card.kind === "plan" ? (
        <div className="mt-2">
          <PlanItems card={card} />
          <PlanNotes notes={card.notes} />
        </div>
      ) : (
        <CardDetails card={card} today={today} className="mt-1.5" />
      )}
    </div>
  );
}
