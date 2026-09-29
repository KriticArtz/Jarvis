"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ActionResult } from "@/lib/actions/result";
import { savePhoneAndConsent } from "@/lib/actions/notifications";
import { SMS_CONSENT_TEXT } from "@/lib/notifications/consent";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import Link from "next/link";

/**
 * Phone number + explicit SMS consent. The consent checkbox is never
 * pre-checked, and its exact wording is stored with the consent timestamp.
 */
export function PhoneForm({
  phone,
  consented,
  submitLabel = "Save",
  onSaved,
}: {
  phone: string | null;
  consented: boolean;
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(savePhoneAndConsent, { ok: false });
  const handled = useRef<ActionResult | null>(null);
  useEffect(() => {
    if (state.ok && handled.current !== state) {
      handled.current = state;
      onSaved?.();
    }
  }, [state, onSaved]);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field label="Mobile number" htmlFor="phone" error={state.fieldErrors?.phone} hint="US numbers can be entered as 10 digits. Include + and country code otherwise.">
        <Input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" defaultValue={phone ?? ""} placeholder="+1 555 123 4567" aria-invalid={!!state.fieldErrors?.phone} />
      </Field>
      <label className="flex items-start gap-3 rounded-2xl bg-surface-2/70 p-4 text-sm leading-relaxed">
        <input type="checkbox" name="sms_consent" defaultChecked={consented} className="mt-1 size-4 shrink-0 accent-[var(--accent)]" />
        <span>{SMS_CONSENT_TEXT}</span>
      </label>
      <p className="-mt-2 text-[13px] text-muted">
        See our{" "}
        <Link href="/terms" target="_blank" className="font-medium text-accent hover:underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" target="_blank" className="font-medium text-accent hover:underline">
          Privacy Policy
        </Link>{" "}
        for how texts and your number are handled.
      </p>
      <FormMessage tone={state.ok ? "success" : "error"}>{state.ok ? (onSaved ? null : state.message) : state.error}</FormMessage>
      <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
    </form>
  );
}
