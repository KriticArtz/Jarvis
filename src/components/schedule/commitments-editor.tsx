"use client";

import { useActionState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import type { RecurringCommitment } from "@/lib/types/domain";
import type { ActionResult } from "@/lib/actions/result";
import { addCommitment, deleteCommitment } from "@/lib/actions/profile";
import { WEEKDAY_OPTIONS } from "@/lib/goal-options";
import { formatTime12 } from "@/lib/time";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { WeekdayPicker } from "./weekday-picker";

function dayText(days: number[]) {
  if (days.length === 7) return "Every day";
  if (days.join() === "1,2,3,4,5") return "Weekdays";
  if (days.join() === "6,7") return "Weekends";
  return days.map((d) => WEEKDAY_OPTIONS[d - 1].label.slice(0, 3)).join(", ");
}

/** Other recurring commitments the planner must never schedule over. */
export function CommitmentsEditor({ commitments }: { commitments: RecurringCommitment[] }) {
  const [state, action] = useActionState<ActionResult, FormData>(addCommitment, { ok: false });
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      {commitments.length ? (
        <ul className="divide-y divide-hairline rounded-2xl bg-surface-2/60">
          {commitments.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium">{c.title}</p>
                <p className="text-sm text-muted">
                  {dayText(c.days_of_week)} · {formatTime12(c.start_time)}–{formatTime12(c.end_time)}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => void deleteCommitment(c.id))}
                className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger"
                aria-label={`Remove ${c.title}`}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form action={action} className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-border p-4" noValidate>
        <p className="text-sm font-medium">Add a recurring commitment</p>
        <Field label="What" htmlFor="c-title" error={state.fieldErrors?.title}>
          <Input id="c-title" name="title" placeholder="e.g. Kids' pickup, class, standing meeting" maxLength={120} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" htmlFor="c-start" error={state.fieldErrors?.start_time}>
            <Input id="c-start" name="start_time" type="time" />
          </Field>
          <Field label="To" htmlFor="c-end" error={state.fieldErrors?.end_time}>
            <Input id="c-end" name="end_time" type="time" />
          </Field>
        </div>
        <WeekdayPicker name="days_of_week" legend="Days" defaultValue={[1, 2, 3, 4, 5]} />
        <FormMessage>{state.ok ? null : state.error}</FormMessage>
        <SubmitButton variant="secondary" pendingText="Adding…">
          Add commitment
        </SubmitButton>
      </form>
    </div>
  );
}
