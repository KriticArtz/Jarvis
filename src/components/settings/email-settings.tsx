"use client";

import { useActionState, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/result";
import { saveEmailSchedule, sendTestCheckIn, setEmailAccountability } from "@/lib/actions/email";
import type { NotificationPreferences } from "@/lib/types/domain";
import { Button } from "@/components/ui/button";
import { FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";

/**
 * Email accountability: on/off (default off) and a test check-in that goes
 * to the account's own email. The address isn't editable here — it's the
 * sign-in email.
 */
export function EmailSettings({ email, enabled, canSend, assistantName }: { email: string | null; enabled: boolean; canSend: boolean; assistantName: string }) {
  const [on, setOn] = useState(enabled);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<ActionResult | null>(null);

  const toggle = () =>
    startTransition(async () => {
      const next = !on;
      const res = await setEmailAccountability(next);
      if (res.ok) setOn(next);
      setMsg(res);
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p id="email-toggle-label" className="text-[15px] font-medium">
            Email check-ins
          </p>
          <p className="truncate text-sm text-muted">{email ? `Sent to ${email}` : "Your account has no email address."}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="email-toggle-label"
          disabled={pending || !email}
          onClick={toggle}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50",
            on ? "bg-accent" : "bg-surface-2 ring-1 ring-inset ring-[var(--hairline)]",
          )}
        >
          <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-6" : "translate-x-1")} />
        </button>
      </div>
      <p className="text-[15px] leading-relaxed text-muted">
        When it&apos;s on, {assistantName} can email you a short check-in — and you can just reply. It reads your answer with everything it knows
        about your plan and can update it for you. Anything that needs your OK waits for you to reply YES. Turn it off here or from any email.
      </p>
      <div>
        <Button size="sm" variant="secondary" disabled={pending || !on || !canSend} onClick={() => startTransition(async () => setMsg(await sendTestCheckIn()))}>
          Send me a test check-in
        </Button>
      </div>
      {msg ? <FormMessage tone={msg.ok ? "success" : "error"}>{msg.ok ? msg.message : msg.error}</FormMessage> : null}
    </div>
  );
}

export type EmailSchedule = Pick<
  NotificationPreferences,
  "email_morning_enabled" | "email_morning_time" | "email_afternoon_enabled" | "email_afternoon_time" | "email_evening_enabled" | "email_evening_time"
>;

const hhmm = (v: string | null | undefined) => (v ? v.slice(0, 5) : "");

/**
 * Which scheduled email check-ins the user wants, and when (their own
 * timezone). All start unticked: nothing is scheduled until the user picks
 * slots. Quiet hours (shared with texts) always win, and nothing is sent while
 * email check-ins are off.
 */
export function EmailScheduleForm({ schedule, quietHours }: { schedule: EmailSchedule; quietHours: string | null }) {
  const [state, action] = useActionState<ActionResult, FormData>(saveEmailSchedule, { ok: false });
  const err = state.fieldErrors ?? {};
  const slots = [
    { key: "morning", label: "Morning check-in", enabled: schedule.email_morning_enabled, time: schedule.email_morning_time },
    { key: "afternoon", label: "Afternoon check-in", enabled: schedule.email_afternoon_enabled, time: schedule.email_afternoon_time },
    { key: "evening", label: "Evening wrap-up", enabled: schedule.email_evening_enabled, time: schedule.email_evening_time },
  ] as const;
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <p className="text-sm text-muted">
        Scheduled check-ins are off until you choose them. Tick the ones you want and save; nothing is scheduled otherwise.
      </p>
      {slots.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-3">
          <label className="flex min-w-0 items-center gap-3 text-[15px]">
            <input type="checkbox" name={`email_${s.key}_enabled`} defaultChecked={s.enabled} className="size-4 shrink-0 accent-[var(--accent)]" />
            {s.label}
          </label>
          <div className="w-36 shrink-0">
            <Input
              aria-label={`${s.label} time`}
              name={`email_${s.key}_time`}
              type="time"
              defaultValue={hhmm(s.time)}
              aria-invalid={!!err[`email_${s.key}_time`]}
              className="h-10"
            />
          </div>
        </div>
      ))}
      <p className="text-sm text-muted">
        Times are in your timezone (Profile below).{quietHours ? ` Nothing is sent during quiet hours (${quietHours}).` : ""}
      </p>
      <FormMessage tone={state.ok ? "success" : "error"}>{state.ok ? state.message : state.error}</FormMessage>
      <div>
        <SubmitButton size="sm" variant="secondary" pendingText="Saving…">
          Save check-in times
        </SubmitButton>
      </div>
    </form>
  );
}
