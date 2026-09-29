"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/actions/result";
import { saveName } from "@/lib/actions/profile";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function ProfileForm({ name, email, timezone, timezones }: { name: string; email: string | null; timezone: string; timezones: string[] }) {
  const [state, action] = useActionState<ActionResult, FormData>(saveName, { ok: false });
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field label="Name" htmlFor="display_name" error={state.fieldErrors?.display_name}>
        <Input id="display_name" name="display_name" defaultValue={name} maxLength={80} autoComplete="given-name" />
      </Field>
      <Field label="Email" htmlFor="email" hint="Used to log in.">
        <Input id="email" value={email ?? ""} disabled readOnly />
      </Field>
      <Field label="Timezone" htmlFor="timezone" hint="All planning and check-in times use this timezone.">
        <Select id="timezone" name="timezone" defaultValue={timezone}>
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replaceAll("_", " ")}
            </option>
          ))}
        </Select>
      </Field>
      <FormMessage tone={state.ok ? "success" : "error"}>{state.ok ? state.message : state.error}</FormMessage>
      <SubmitButton pendingText="Saving…">Save profile</SubmitButton>
    </form>
  );
}
