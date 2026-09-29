"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Sparkles, Trash2 } from "lucide-react";
import type { DailyPlan, PlanItem } from "@/lib/types/domain";
import { acceptPlan, discardPlan, generatePlan, type PlanActionResult } from "@/lib/actions/plan";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

interface Props {
  draft: DailyPlan | null;
  hasAcceptedPlan: boolean;
  knowsWakingHours: boolean;
  goals: { id: string; title: string }[];
  aiConfigured: boolean;
}

export function PlanBuilder({ draft, hasAcceptedPlan, knowsWakingHours, goals, aiConfigured }: Props) {
  const [state, action] = useActionState<PlanActionResult, FormData>(generatePlan, { ok: false });
  const question = state.result?.status === "needs_info" ? state.result.question : null;
  const plan = state.result?.status === "ok" ? state.result.plan : draft;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title={plan ? "Want a different plan?" : "Tell me about today"}
          subtitle={
            knowsWakingHours
              ? "I'll plan around your schedule and commitments. Adding your free time makes it more accurate."
              : "I don't know your waking hours yet, so tell me when you're free today."
          }
        />
        <form action={action} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Free from" htmlFor="availableStart" hint={knowsWakingHours ? "Optional" : undefined}>
              <Input id="availableStart" name="availableStart" type="time" required={!knowsWakingHours} />
            </Field>
            <Field label="Until" htmlFor="availableEnd" hint={knowsWakingHours ? "Optional" : undefined}>
              <Input id="availableEnd" name="availableEnd" type="time" required={!knowsWakingHours} />
            </Field>
          </div>
          <Field label="Anything I should know?" htmlFor="note" hint="Optional — energy level, deadlines, things that came up.">
            <Textarea id="note" name="note" rows={2} maxLength={1000} placeholder="e.g. Tired today, and I have an exam Friday." />
          </Field>
          {question ? <FormMessage tone="info">{question}</FormMessage> : null}
          <FormMessage>{state.ok ? null : state.error}</FormMessage>
          <SubmitButton size="lg" pendingText="Planning…">
            <Sparkles className="size-4" /> {plan ? "Build a new plan" : "Build my plan"}
          </SubmitButton>
          {!aiConfigured ? <p className="text-xs text-muted">AI is not configured, so plans use simple rules based on your goal ranking and free time.</p> : null}
        </form>
      </Card>

      {plan && plan.status === "draft" ? <PlanEditor key={plan.id} plan={plan} goals={goals} replacesAccepted={hasAcceptedPlan} /> : null}
    </div>
  );
}

function PlanEditor({ plan, goals, replacesAccepted }: { plan: DailyPlan; goals: { id: string; title: string }[]; replacesAccepted: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<PlanItem[]>(plan.proposal.items);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (i: number, patch: Partial<PlanItem>) => setItems((all) => all.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const total = items.reduce((s, i) => s + (Number(i.duration_minutes) || 0), 0);

  return (
    <Card className="animate-fade-in">
      <CardHeader title="Proposed plan" subtitle={`${items.length} item${items.length === 1 ? "" : "s"} · ${Math.round(total)} min`} />
      {plan.summary ? <p className="mb-4 leading-relaxed">{plan.summary}</p> : null}

      {plan.proposal.warnings.length ? (
        <div className="mb-4 rounded-xl bg-warning-soft p-3 text-sm text-warning">
          <p className="mb-1 flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-4" /> Adjusted to fit your schedule
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {plan.proposal.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="text-sm text-muted">No items. Add one below, or build a new plan.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((item, i) => (
            <li key={i} className="rounded-xl border border-border p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <label className="sr-only" htmlFor={`item-title-${i}`}>
                    Title
                  </label>
                  <Input id={`item-title-${i}`} value={item.title} onChange={(e) => update(i, { title: e.target.value })} maxLength={200} className="h-10 font-medium" />
                </div>
                <button type="button" onClick={() => setItems((all) => all.filter((_, idx) => idx !== i))} className="rounded-lg p-2.5 text-muted hover:bg-surface-2 hover:text-danger" aria-label={`Remove ${item.title}`}>
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Start
                  <Input type="time" value={item.start_time ?? ""} onChange={(e) => update(i, { start_time: e.target.value || null })} className="h-10" />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Minutes
                  <Input type="number" min={5} max={720} value={item.duration_minutes} onChange={(e) => update(i, { duration_minutes: Number(e.target.value) })} className="h-10" />
                </label>
                <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
                  Goal
                  <Select value={item.goal_id ?? ""} onChange={(e) => update(i, { goal_id: e.target.value || null })} className="h-10">
                    <option value="">None</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={item.is_priority} onChange={(e) => update(i, { is_priority: e.target.checked })} className="size-4 accent-[var(--accent)]" />
                Priority
              </label>
              {item.rationale ? <p className="mt-2 text-sm text-muted">{item.rationale}</p> : null}
            </li>
          ))}
        </ol>
      )}

      <button
        type="button"
        onClick={() => setItems((all) => [...all, { task_id: null, title: "", goal_id: null, start_time: null, duration_minutes: 30, is_priority: false, rationale: null }])}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
      >
        <Plus className="size-4" /> Add item
      </button>

      {replacesAccepted ? <p className="mt-4 text-sm text-muted">Accepting adds these to today&apos;s tasks alongside what&apos;s already there.</p> : null}
      <FormMessage>{error}</FormMessage>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button
          size="lg"
          disabled={pending || items.length === 0 || items.some((i) => !i.title.trim())}
          onClick={() =>
            startTransition(async () => {
              const res = await acceptPlan({ planId: plan.id, items });
              if (!res.ok) return setError(res.error ?? "Couldn't save the plan.");
              router.push("/dashboard");
            })
          }
        >
          {pending ? "Saving…" : "Accept plan"}
        </Button>
        <Button
          size="lg"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await discardPlan(plan.id);
              router.refresh();
            })
          }
        >
          Discard
        </Button>
      </div>
    </Card>
  );
}
