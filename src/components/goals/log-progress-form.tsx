"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ActionResult } from "@/lib/actions/result";
import { logProgress } from "@/lib/actions/goals";
import { FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function LogProgressForm({
  goalId,
  unit,
  defaultAmount = 1,
  showNote = false,
  onLogged,
}: {
  goalId: string;
  unit: string | null;
  defaultAmount?: number;
  showNote?: boolean;
  onLogged?: () => void;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(logProgress, { ok: false });
  const handled = useRef<ActionResult | null>(null);
  useEffect(() => {
    if (state.ok && handled.current !== state) {
      handled.current = state;
      onLogged?.();
    }
  }, [state, onLogged]);

  return (
    <form action={action} className="flex flex-col gap-2" noValidate>
      <input type="hidden" name="goal_id" value={goalId} />
      <div className="flex items-center gap-2">
        <label htmlFor={`amount-${goalId}`} className="sr-only">
          Amount
        </label>
        <Input id={`amount-${goalId}`} name="amount" type="number" inputMode="decimal" min="0" step="any" defaultValue={defaultAmount} className="h-10 w-24" />
        <span className="text-sm text-muted">{unit ?? "times"}</span>
        <SubmitButton size="sm" className="ml-auto" pendingText="Logging…">
          Log
        </SubmitButton>
      </div>
      {showNote ? (
        <>
          <label htmlFor={`note-${goalId}`} className="sr-only">
            Note
          </label>
          <Input id={`note-${goalId}`} name="note" placeholder="Note (optional)" maxLength={500} className="h-10" />
          <label htmlFor={`date-${goalId}`} className="text-sm text-muted">
            Date (defaults to today)
          </label>
          <Input id={`date-${goalId}`} name="logged_for" type="date" className="h-10" />
        </>
      ) : null}
      {!state.ok && state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.ok && state.message && !onLogged ? <FormMessage tone="success">{state.message}</FormMessage> : null}
    </form>
  );
}
