"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { resendConfirmation, type AuthState } from "./actions";

/** "Resend confirmation email" for an address that hasn't been confirmed yet. Its own form, so it can sit beside another one. */
export function ResendConfirmation({ email }: { email?: string }) {
  const [state, formAction] = useActionState<AuthState, FormData>(resendConfirmation, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="email" value={email ?? ""} />
      <FormMessage tone={state.message ? "success" : "error"}>{state.message ?? state.error}</FormMessage>
      <SubmitButton variant="secondary" pendingText="Sending…">
        Resend confirmation email
      </SubmitButton>
    </form>
  );
}
