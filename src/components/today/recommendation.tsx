"use client";

import { useState, useTransition } from "react";
import { ArrowUp, Check } from "lucide-react";
import type { Recommendation } from "@/lib/dashboard/day";
import { setTaskStatus } from "@/lib/actions/tasks";
import { Presence, type PresenceState } from "@/components/ui/presence";
import { Button, ButtonLink } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { usePlanSheet } from "./plan-sheet";

/**
 * "What to do first" — the one raised surface on Today. Shows the best
 * candidate; "Not now" moves to the next one (for this visit). Acting on a
 * task marks it done in place; the rest of Today refreshes from the server.
 */
export function RecommendationCard({ candidates, assistantName, bare = false }: { candidates: Recommendation[]; assistantName: string; /** Inside a panel that already frames it (Today's console): no card of its own. */ bare?: boolean }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const openPlan = usePlanSheet();
  const toast = useToast();

  const rec = candidates.find((c) => !dismissed.includes(c.key)) ?? candidates[candidates.length - 1];
  const done = doneKey === rec.key;
  const presence: PresenceState = pending ? "acting" : "idle";
  const canSkip = rec.kind !== "empty" && candidates.some((c) => c.key !== rec.key && !dismissed.includes(c.key));
  const notNow = () => setDismissed((d) => [...d, rec.key]);

  const complete = (taskId: string, title: string) =>
    startTransition(async () => {
      const res = await setTaskStatus(taskId, "done");
      if (!res.ok) {
        toast({ title: "Couldn't mark that done", description: "Nothing was changed.", tone: "danger" });
        return;
      }
      setDoneKey(rec.key);
      toast({ title: `Done: ${title}`, tone: "success" });
      window.setTimeout(() => setDismissed((d) => [...d, rec.key]), 900);
    });

  return (
    <section
      aria-labelledby="rec-title"
      aria-live="polite"
      className={cn("animate-rise relative [animation-delay:120ms]", !bare && "bg-assistant rounded-panel p-5 shadow-lift sm:p-7")}
    >
      <div className="flex items-center gap-2.5">
        {bare ? null : <Presence size="sm" state={presence} />}
        <p className="type-eyebrow text-foreground/70">{rec.eyebrow}</p>
      </div>

      <div key={rec.key} className="animate-fade-in">
        <h2 id="rec-title" className={cn("type-display mt-4 text-[30px] leading-[1.08] transition-opacity sm:text-[36px]", done && "text-muted line-through decoration-2")}>
          {rec.title}
        </h2>
        <p className="mt-2.5 max-w-[56ch] text-[16px] leading-relaxed text-muted sm:text-[17px]">{rec.reason}</p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {rec.kind === "task" ? (
            done ? (
              <span className="inline-flex h-11 items-center gap-2 rounded-full bg-success-soft px-5 text-[15px] font-medium text-success">
                <Check className="check-pop size-4" strokeWidth={3} aria-hidden /> Done
              </span>
            ) : (
              <>
                <Button onClick={() => complete(rec.taskId, rec.title)} disabled={pending}>
                  <Check className="size-4" strokeWidth={2.6} aria-hidden /> {pending ? "Marking done…" : "Mark done"}
                </Button>
                {rec.eyebrow === "Still on?" ? (
                  <ButtonLink href={rec.askHref} variant="secondary">
                    Move it
                  </ButtonLink>
                ) : null}
              </>
            )
          ) : rec.kind === "confirm" ? (
            <ButtonLink href={rec.href}>Review</ButtonLink>
          ) : rec.kind === "goal" ? (
            <>
              <Button onClick={openPlan}>Make room today</Button>
              <ButtonLink href={`/goals/${rec.goalId}`} variant="secondary">
                See goal
              </ButtonLink>
            </>
          ) : rec.kind === "intention" ? (
            <Button onClick={openPlan}>Plan around it</Button>
          ) : rec.kind === "done" ? (
            <Button variant="secondary" onClick={openPlan}>
              Plan the rest of today
            </Button>
          ) : (
            <Button onClick={openPlan}>Plan my day</Button>
          )}
          {canSkip && !done ? (
            <Button variant="ghost" onClick={notNow}>
              Not now
            </Button>
          ) : null}
        </div>
      </div>

      <form action="/assistant" method="get" className="mt-6 flex items-center gap-2 rounded-full bg-surface-raised/80 p-1.5 pl-4 shadow-[inset_0_0_0_1px_var(--hairline)] transition-shadow focus-within:ring-4 focus-within:ring-ring">
        <label htmlFor="ask-assistant" className="sr-only">
          Ask {assistantName}
        </label>
        <input
          id="ask-assistant"
          name="q"
          required
          maxLength={4000}
          autoComplete="off"
          placeholder={rec.kind === "empty" ? "What do you want to get done?" : `Ask ${assistantName} anything…`}
          className="min-h-11 min-w-0 flex-1 bg-transparent text-[16px] placeholder:text-muted focus:outline-none"
        />
        <button
          type="submit"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform duration-(--dur-1) active:scale-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
          aria-label={`Send to ${assistantName}`}
        >
          <ArrowUp className="size-5" aria-hidden />
        </button>
      </form>
    </section>
  );
}

/** A quiet "Plan my day" trigger for the page header. */
export function PlanButton({ replan }: { replan: boolean }) {
  const openPlan = usePlanSheet();
  return (
    <Button variant="secondary" onClick={openPlan}>
      {replan ? "Re-plan" : "Plan my day"}
    </Button>
  );
}
