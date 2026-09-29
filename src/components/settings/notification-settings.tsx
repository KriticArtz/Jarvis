"use client";

import { useActionState, useState, useTransition } from "react";
import type { NotificationPreferences } from "@/lib/types/domain";
import type { ActionResult } from "@/lib/actions/result";
import { revokeSmsConsent, saveNotificationPreferences, sendCheckInNow, sendTestMessage } from "@/lib/actions/notifications";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

const t = (v: string | null) => (v ? v.slice(0, 5) : "");

export function NotificationPrefsForm({ prefs }: { prefs: NotificationPreferences }) {
  const [state, action] = useActionState<ActionResult, FormData>(saveNotificationPreferences, { ok: false });
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Toggle name="morning_checkin_enabled" label="Morning check-in" defaultChecked={prefs.morning_checkin_enabled}>
        <Input aria-label="Morning check-in time" name="morning_checkin_time" type="time" defaultValue={t(prefs.morning_checkin_time)} className="h-10 w-32" />
      </Toggle>
      <Toggle name="task_reminders_enabled" label="Reminders before timed priority tasks" defaultChecked={prefs.task_reminders_enabled} />
      <Toggle name="evening_checkin_enabled" label="Evening check-in" defaultChecked={prefs.evening_checkin_enabled}>
        <Input aria-label="Evening check-in time" name="evening_checkin_time" type="time" defaultValue={t(prefs.evening_checkin_time)} className="h-10 w-32" />
      </Toggle>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quiet hours from" htmlFor="quiet_hours_start" error={err.quiet_hours_start}>
          <Input id="quiet_hours_start" name="quiet_hours_start" type="time" defaultValue={t(prefs.quiet_hours_start)} />
        </Field>
        <Field label="Until" htmlFor="quiet_hours_end" error={err.quiet_hours_end}>
          <Input id="quiet_hours_end" name="quiet_hours_end" type="time" defaultValue={t(prefs.quiet_hours_end)} />
        </Field>
      </div>
      <FormMessage tone={state.ok ? "success" : "error"}>{state.ok ? state.message : state.error}</FormMessage>
      <SubmitButton variant="secondary" pendingText="Saving…">
        Save message settings
      </SubmitButton>
    </form>
  );
}

function Toggle({ name, label, defaultChecked, children }: { name: string; label: string; defaultChecked: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="flex items-center gap-3 text-[15px]">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4 accent-[var(--accent)]" />
        {label}
      </label>
      {children}
    </div>
  );
}

export function SmsActions({ canSend }: { canSend: boolean }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<ActionResult | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending || !canSend} onClick={() => startTransition(async () => setMsg(await sendCheckInNow()))}>
          Send a check-in now
        </Button>
        <Button size="sm" variant="secondary" disabled={pending || !canSend} onClick={() => startTransition(async () => setMsg(await sendTestMessage()))}>
          Send a test message
        </Button>
        <Button size="sm" variant="danger" disabled={pending || !canSend} onClick={() => startTransition(async () => setMsg(await revokeSmsConsent()))}>
          Stop all texts
        </Button>
      </div>
      {msg ? <FormMessage tone={msg.ok ? "success" : "error"}>{msg.ok ? msg.message : msg.error}</FormMessage> : null}
    </div>
  );
}
