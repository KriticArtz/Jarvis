"use client";

import { createContext, useActionState, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import type { DailyPlan, PlanItem } from "@/lib/types/domain";
import { acceptPlan, discardPlan, generatePlan, type PlanActionResult } from "@/lib/actions/plan";
import { formatTime12, timeToMinutes } from "@/lib/time";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Presence } from "@/components/ui/presence";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { PlanEditor } from "@/components/plan/plan-builder";

export interface PlanSheetData {
  draft: DailyPlan | null;
  calendarWritable: boolean;
  hasAcceptedPlan: boolean;
  knowsWakingHours: boolean;
  goals: { id: string; title: string }[];
  aiConfigured: boolean;
  assistantName: string;
}

const PlanSheetContext = createContext<() => void>(() => {});

/** Opens "Plan my day" over Today. */
export function usePlanSheet() {
  return useContext(PlanSheetContext);
}

/**
 * Plan My Day as a sheet over Today, using the same planner and actions as
 * /plan. Also opens for /dashboard?plan=1 (deep links into planning).
 */
export function PlanSheetProvider({ data, children }: { data: PlanSheetData; children: ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(params.get("plan") === "1");
  const value = useMemo(() => () => setOpen(true), []);

  const close = () => {
    setOpen(false);
    if (params.get("plan")) router.replace("/dashboard", { scroll: false });
  };

  return (
    <PlanSheetContext.Provider value={value}>
      {children}
      <Sheet open={open} onClose={close} title="Plan my day" description={`${data.assistantName} plans around your calendar, commitments and goals.`} size="md">
        <PlanFlow data={data} onDone={close} />
      </Sheet>
    </PlanSheetContext.Provider>
  );
}

function sortItems(items: PlanItem[]) {
  return [...items].sort((a, b) => (a.start_time ? timeToMinutes(a.start_time) : 1e4) - (b.start_time ? timeToMinutes(b.start_time) : 1e4));
}

function PlanFlow({ data, onDone }: { data: PlanSheetData; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<"review" | "adjust">("review");
  const [cleared, setCleared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [accepting, startAccept] = useTransition();
  const [state, action, generating] = useActionState<PlanActionResult, FormData>(async (prev, formData) => {
    const res = await generatePlan(prev, formData);
    // A fresh plan: review it from the top, and let Today pick up the draft too.
    setMode("review");
    setCleared(false);
    if (res.result?.status === "ok") router.refresh();
    return res;
  }, { ok: false });

  const question = state.result?.status === "needs_info" ? state.result.question : null;
  const plan = cleared ? null : state.result?.status === "ok" ? state.result.plan : data.draft?.status === "draft" ? data.draft : null;

  const finish = () => {
    toast({ title: "Your plan is on Today", tone: "success" });
    router.refresh();
    onDone();
  };

  if (generating) return <Assembling name={data.assistantName} />;

  if (plan && mode === "adjust") {
    return (
      <PlanEditor
        key={plan.id}
        bare
        plan={plan}
        goals={data.goals}
        replacesAccepted={data.hasAcceptedPlan}
        calendarWritable={data.calendarWritable}
        onAccepted={finish}
        onDiscarded={() => setCleared(true)}
      />
    );
  }

  if (plan) {
    const items = sortItems(plan.proposal.items);
    return (
      <div className="flex flex-col">
        <p className="type-eyebrow">Your day</p>
        <ol className="relative mt-4 flex flex-col">
          {items.map((item, i) => (
            <li key={i} className="animate-rise grid grid-cols-[4.75rem_1fr] gap-x-3 pb-4" style={{ animationDelay: `${120 + i * 90}ms` }}>
              <span className="type-time pt-0.5 text-right text-[13px] text-muted">{item.start_time ? formatTime12(item.start_time) : "Anytime"}</span>
              <span className="relative min-w-0 border-l border-line pl-4">
                <span aria-hidden className="absolute -left-[4.5px] top-[7px] size-2 rounded-full bg-[var(--presence-b)]" />
                <span className="block text-[16px] font-medium leading-snug">{item.title}</span>
                <span className="type-num block text-[13px] text-muted">
                  {[`${item.duration_minutes} min`, item.is_priority ? "Priority" : null].filter(Boolean).join(" · ")}
                </span>
                {item.rationale ? <span className="mt-0.5 block text-[13px] leading-snug text-muted">{item.rationale}</span> : null}
              </span>
            </li>
          ))}
        </ol>
        <div className="animate-fade-in flex items-start gap-2.5 pt-1" style={{ animationDelay: `${200 + items.length * 90}ms` }}>
          <Presence size="xs" className="mt-1" />
          <div className="text-[15px] leading-relaxed">
            {plan.summary ? <p>{plan.summary}</p> : <p>This fits around your existing commitments.</p>}
            {plan.proposal.warnings.length ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[14px] text-muted">
                {plan.proposal.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        {data.hasAcceptedPlan ? <p className="mt-3 text-[13px] text-muted">Using it adds these to today alongside what&apos;s already there.</p> : null}
        <FormMessage>{error}</FormMessage>
        {warning ? (
          <div className="mt-3 flex flex-col gap-2">
            <FormMessage tone="info">{warning}</FormMessage>
            <Button variant="secondary" onClick={finish}>
              Back to Today
            </Button>
          </div>
        ) : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button
            size="lg"
            className="sm:flex-1"
            disabled={accepting || Boolean(warning) || items.length === 0}
            onClick={() =>
              startAccept(async () => {
                setError(null);
                const res = await acceptPlan({ planId: plan.id, items: plan.proposal.items, calendarItems: [] });
                if (!res.ok) return setError(res.error ?? "Couldn't save the plan.");
                if (res.calendarWarning) return setWarning(res.calendarWarning);
                finish();
              })
            }
          >
            {accepting ? "Saving…" : "Use this plan"}
          </Button>
          <Button size="lg" variant="secondary" disabled={accepting} onClick={() => setMode("adjust")}>
            Adjust
          </Button>
        </div>
        <button
          type="button"
          disabled={accepting}
          onClick={() =>
            startAccept(async () => {
              await discardPlan(plan.id);
              setCleared(true);
              router.refresh();
            })
          }
          className="mt-2 min-h-11 self-center text-[14px] font-medium text-muted hover:text-foreground"
        >
          Start over
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Free from" htmlFor="ps-start" hint={data.knowsWakingHours ? "Optional" : undefined}>
          <Input id="ps-start" name="availableStart" type="time" required={!data.knowsWakingHours} />
        </Field>
        <Field label="Until" htmlFor="ps-end" hint={data.knowsWakingHours ? "Optional" : undefined}>
          <Input id="ps-end" name="availableEnd" type="time" required={!data.knowsWakingHours} />
        </Field>
      </div>
      <Field label="Anything I should know?" htmlFor="ps-note" hint="Energy, deadlines, things that came up.">
        <Textarea id="ps-note" name="note" rows={2} maxLength={1000} placeholder="e.g. Low energy today; the report is due Friday." />
      </Field>
      {question ? <FormMessage tone="info">{question}</FormMessage> : null}
      <FormMessage>{state.ok ? null : state.error}</FormMessage>
      <SubmitButton size="lg" pendingText="Planning…">
        <Sparkles className="size-4" aria-hidden /> Build my plan
      </SubmitButton>
      {!data.aiConfigured ? <p className="text-[13px] text-muted">AI isn&apos;t configured, so the plan uses simple rules: your goal ranking and free time.</p> : null}
    </form>
  );
}

function Assembling({ name }: { name: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-start py-2">
      <div className="flex items-center gap-3">
        <Presence size="md" state="thinking" />
        <p className="text-[16px] font-medium">{name} is building your day…</p>
      </div>
      <div className="mt-6 flex w-full flex-col gap-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="grid grid-cols-[4.75rem_1fr] gap-x-3" style={{ opacity: 1 - i * 0.18 }}>
            <Skeleton className="ml-auto h-3.5 w-12" />
            <div>
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="mt-2 h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
