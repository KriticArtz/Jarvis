"use client";

import { useActionState, useState, useTransition } from "react";
import { BadgeCheck } from "lucide-react";
import { confirmVerificationCode, sendVerificationCode, type VerificationActionResult } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Phone verification status + flow. Only rendered when verification is
 * enabled, required, or already done (see Settings page).
 */
export function PhoneVerification({ verified, mode, required }: { verified: boolean; mode: "off" | "test"; required: boolean }) {
  const [sent, setSent] = useState<VerificationActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [state, confirm] = useActionState<VerificationActionResult, FormData>(confirmVerificationCode, { ok: false });

  if (verified || state.ok) {
    return (
      <p className="flex items-center gap-2 text-[14px] font-medium text-success">
        <BadgeCheck className="size-4" aria-hidden /> Phone number verified
      </p>
    );
  }

  if (mode === "off") {
    return required ? (
      <FormMessage tone="info">Texts start once your number is verified. Verification will be available soon.</FormMessage>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface-2/70 p-4">
      <p className="text-[14px]">
        <span className="font-medium">Verify your number.</span>{" "}
        <span className="text-muted">{required ? "Texts start once it's verified." : "This confirms the number belongs to you."}</span>
      </p>
      {sent?.ok ? (
        <>
          {sent.devCode ? (
            <FormMessage tone="info">
              Development test mode — no text was sent. Your code is <strong className="font-mono">{sent.devCode}</strong>.
            </FormMessage>
          ) : (
            <FormMessage tone="success">{sent.message}</FormMessage>
          )}
          <form action={confirm} className="flex gap-2" noValidate>
            <label htmlFor="verification-code" className="sr-only">
              Verification code
            </label>
            <Input id="verification-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" className="h-11" />
            <SubmitButton size="md" pendingText="Checking…">
              Verify
            </SubmitButton>
          </form>
          <FormMessage>{state.ok ? null : state.error}</FormMessage>
        </>
      ) : null}
      {!sent?.ok ? <FormMessage>{sent?.error}</FormMessage> : null}
      <Button
        size="sm"
        variant="secondary"
        className="self-start"
        disabled={pending}
        onClick={() => startTransition(async () => setSent(await sendVerificationCode()))}
      >
        {pending ? "Sending…" : sent?.ok ? "Send a new code" : "Send verification code"}
      </Button>
    </div>
  );
}
