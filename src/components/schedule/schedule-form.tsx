"use client";

import { useActionState, useEffect, useRef } from "react";
import type { Profile } from "@/lib/types/domain";
import type { ActionResult } from "@/lib/actions/result";
import { saveSchedule } from "@/lib/actions/profile";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { WeekdayPicker } from "./weekday-picker";

const t = (v: string | null) => (v ? v.slice(0, 5) : "");

/** Wake/sleep and work/school hours. Every field can be left blank. */
export function ScheduleForm({
  profile,
  onboarding = false,
  submitLabel = "Save schedule",
  onSaved,
}: {
  profile: Pick<Profile, "wake_time" | "sleep_time" | "work_start" | "work_end" | "work_days" | "work_label">;
  onboarding?: boolean;
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(saveSchedule, { ok: false });
  const handled = useRef<ActionResult | null>(null);
  useEffect(() => {
    if (state.ok && handled.current !== state) {
      handled.current = state;
      onSaved?.();
    }
  }, [state, onSaved]);
  const err = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {onboarding ? <input type="hidden" name="onboarding" value="1" /> : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Usually wake up" htmlFor="wake_time" error={err.wake_time}>
          <Input id="wake_time" name="wake_time" type="time" defaultValue={t(profile.wake_time)} />
        </Field>
        <Field label="Usually go to sleep" htmlFor="sleep_time" error={err.sleep_time}>
          <Input id="sleep_time" name="sleep_time" type="time" defaultValue={t(profile.sleep_time)} />
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_1fr] gap-3 sm:grid-cols-3">
        <Field label="Work or school?" htmlFor="work_label" className="col-span-2 sm:col-span-1">
          <Select id="work_label" name="work_label" defaultValue={profile.work_label || "Work"}>
            <option value="Work">Work</option>
            <option value="School">School</option>
            <option value="Work/School">Both</option>
          </Select>
        </Field>
        <Field label="Starts" htmlFor="work_start" error={err.work_start}>
          <Input id="work_start" name="work_start" type="time" defaultValue={t(profile.work_start)} />
        </Field>
        <Field label="Ends" htmlFor="work_end" error={err.work_end}>
          <Input id="work_end" name="work_end" type="time" defaultValue={t(profile.work_end)} />
        </Field>
      </div>
      <WeekdayPicker name="work_days" legend="On these days" defaultValue={profile.work_days} />
      <p className="text-sm text-muted">Leave anything blank that doesn&apos;t apply — you can change it later in Settings.</p>
      <FormMessage tone={state.ok ? "success" : "error"}>{state.ok ? (onboarding ? null : state.message) : state.error}</FormMessage>
      <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
    </form>
  );
}
