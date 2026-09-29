"use client";

import { useActionState, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import type { Goal, Profile, RecurringCommitment } from "@/lib/types/domain";
import type { ActionResult } from "@/lib/actions/result";
import { createGoal, deleteGoal } from "@/lib/actions/goals";
import { advanceOnboarding, completeOnboarding, saveName } from "@/lib/actions/profile";
import { describeTarget } from "@/lib/progress";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/card";
import { GoalForm } from "@/components/goals/goal-form";
import { GoalRanker } from "@/components/goals/goal-ranker";
import { ScheduleForm } from "@/components/schedule/schedule-form";
import { CommitmentsEditor } from "@/components/schedule/commitments-editor";
import { StylePicker } from "@/components/settings/style-picker";
import { PhoneForm } from "@/components/settings/phone-form";

const TOTAL = 6;
const noopSubscribe = () => () => {};

export function OnboardingFlow({
  step,
  profile,
  goals,
  commitments,
  smsConsented,
}: {
  step: number;
  profile: Profile;
  goals: Goal[];
  commitments: RecurringCommitment[];
  smsConsented: boolean;
}) {
  const router = useRouter();
  const go = (n: number) => router.push(`/onboarding?step=${n}`);

  return (
    <div key={step} className="animate-fade-in">
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between text-sm text-muted">
          {step > 1 ? (
            <button type="button" onClick={() => go(step - 1)} className="-ml-1 inline-flex items-center gap-1 rounded-lg px-1 py-0.5 hover:text-foreground">
              <ArrowLeft className="size-4" /> Back
            </button>
          ) : (
            <span />
          )}
          <span>
            Step {step} of {TOTAL}
          </span>
        </div>
        <div className="flex gap-1.5" aria-hidden>
          {Array.from({ length: TOTAL }, (_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i < step ? "bg-accent" : "bg-surface-2"}`} />
          ))}
        </div>
      </div>

      {step === 1 && <NameStep profile={profile} onDone={() => go(2)} />}
      {step === 2 && <GoalsStep goals={goals} onDone={() => go(3)} />}
      {step === 3 && (
        <Step title="What does a typical day look like?" subtitle="This helps me plan around your real schedule. Skip anything that doesn't apply.">
          <ScheduleForm profile={profile} onboarding submitLabel="Continue" onSaved={() => go(4)} />
          <div className="mt-8">
            <h2 className="mb-1 font-semibold">Other recurring commitments</h2>
            <p className="mb-3 text-sm text-muted">Classes, pickups, standing meetings — anything I should never schedule over.</p>
            <CommitmentsEditor commitments={commitments} />
          </div>
        </Step>
      )}
      {step === 4 && (
        <Step title="What matters most to you right now?" subtitle="Put your goals in order. I'll prioritize the top ones when time is tight.">
          {goals.length > 1 ? (
            <GoalRanker goals={goals} submitLabel="Continue" onSaved={() => advanceOnboarding(5).then(() => go(5))} />
          ) : (
            <ContinueOnly note="You have one goal, so it's your top priority. You can add and reorder goals anytime." onContinue={() => advanceOnboarding(5).then(() => go(5))} />
          )}
        </Step>
      )}
      {step === 5 && (
        <Step title="How do you want me to hold you accountable?" subtitle="You can change this anytime in Settings.">
          <StylePicker current={profile.accountability_style} onboarding submitLabel="Continue" onSaved={() => go(6)} />
        </Step>
      )}
      {step === 6 && <PhoneStep phone={profile.phone} consented={smsConsented} />}
    </div>
  );
}

function Step({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {subtitle ? <p className="mb-6 mt-2 text-muted">{subtitle}</p> : <div className="mb-6" />}
      {children}
    </section>
  );
}

function ContinueOnly({ note, onContinue }: { note: string; onContinue: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">{note}</p>
      <Button disabled={pending} onClick={() => startTransition(() => onContinue())}>
        Continue
      </Button>
    </div>
  );
}

function NameStep({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const [state, action] = useActionState<ActionResult, FormData>(saveName, { ok: false });
  // Detect the browser's timezone so scheduling uses the user's real local time.
  const tz = useSyncExternalStore(
    noopSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    () => "",
  );
  const handled = useRef<ActionResult | null>(null);
  useEffect(() => {
    if (state.ok && handled.current !== state) {
      handled.current = state;
      onDone();
    }
  }, [state, onDone]);

  return (
    <Step title="What should I call you?" subtitle="I'm your accountability assistant. Let's get you set up — it takes about three minutes.">
      <form action={action} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="onboarding" value="1" />
        <input type="hidden" name="timezone" value={tz} />
        <Field label="Your name" htmlFor="display_name" error={state.fieldErrors?.display_name}>
          <Input id="display_name" name="display_name" defaultValue={profile.display_name ?? ""} autoComplete="given-name" autoFocus maxLength={80} placeholder="First name or nickname" />
        </Field>
        {tz ? <p className="text-sm text-muted">Timezone detected: {tz}</p> : null}
        <FormMessage>{state.ok ? null : state.error}</FormMessage>
        <SubmitButton size="lg" pendingText="Saving…">
          Continue
        </SubmitButton>
      </form>
    </Step>
  );
}

function GoalsStep({ goals, onDone }: { goals: Goal[]; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(goals.length === 0);

  return (
    <Step title="What are you working toward?" subtitle="Add as many goals as you like. Be as specific as you can — it helps me help you.">
      {goals.length ? (
        <ul className="mb-5 flex flex-col gap-2">
          {goals.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{g.title}</p>
                <p className="text-sm text-muted">
                  <Badge className="mr-1.5 capitalize">{g.category}</Badge>
                  {describeTarget(g)}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => void deleteGoal(g.id))}
                className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger"
                aria-label={`Remove ${g.title}`}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <GoalForm action={createGoal} submitLabel="Add goal" showTemplates onSaved={() => setAdding(false)} />
        </div>
      ) : (
        <Button variant="secondary" className="w-full" onClick={() => setAdding(true)}>
          + Add another goal
        </Button>
      )}

      <div className="mt-6">
        <Button
          size="lg"
          className="w-full"
          disabled={goals.length === 0 || pending}
          onClick={() => startTransition(() => advanceOnboarding(3).then(onDone))}
        >
          Continue
        </Button>
        {goals.length === 0 ? <p className="mt-2 text-center text-sm text-muted">Add at least one goal to continue.</p> : null}
      </div>
    </Step>
  );
}

function PhoneStep({ phone, consented }: { phone: string | null; consented: boolean }) {
  const [finishing, startTransition] = useTransition();
  const finish = () => startTransition(() => completeOnboarding());

  return (
    <Step
      title="Want me to check in by text?"
      subtitle="Proactive check-ins are the heart of how I help — a morning question, a nudge before something you planned, and an evening wrap-up you can reply to. I'll only text you if you check the box below. This step is optional."
    >
      <PhoneForm phone={phone} consented={consented} submitLabel="Save and finish" onSaved={finish} />
      <Button variant="ghost" className="mt-3 w-full" disabled={finishing} onClick={finish}>
        {finishing ? "Finishing…" : "Skip for now"}
      </Button>
    </Step>
  );
}
