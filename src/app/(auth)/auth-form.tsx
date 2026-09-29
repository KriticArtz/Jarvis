"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { AuthState } from "./actions";

type Mode = "login" | "signup" | "forgot" | "reset";

const copy: Record<Mode, { submit: string; pending: string }> = {
  login: { submit: "Log in", pending: "Logging in…" },
  signup: { submit: "Create account", pending: "Creating account…" },
  forgot: { submit: "Send reset link", pending: "Sending…" },
  reset: { submit: "Update password", pending: "Updating…" },
};

export function AuthForm({
  mode,
  action,
  next,
  initialError,
}: {
  mode: Mode;
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  next?: string;
  initialError?: string;
}) {
  const [state, formAction] = useActionState(action, { error: initialError });

  if (state.message && (mode === "signup" || mode === "forgot")) {
    return <FormMessage tone="success">{state.message}</FormMessage>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {mode !== "reset" ? (
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} inputMode="email" />
        </Field>
      ) : null}
      {mode !== "forgot" ? (
        <Field
          label={mode === "reset" ? "New password" : "Password"}
          htmlFor="password"
          hint={mode === "signup" || mode === "reset" ? "At least 8 characters." : undefined}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "login" ? undefined : 8}
          />
        </Field>
      ) : null}
      {mode === "reset" ? (
        <Field label="Confirm new password" htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>
      ) : null}
      {mode === "login" ? (
        <Link href="/forgot-password" className="-mt-1 self-end text-sm text-muted hover:text-foreground">
          Forgot password?
        </Link>
      ) : null}
      <FormMessage>{state.error}</FormMessage>
      <SubmitButton size="lg" pendingText={copy[mode].pending}>
        {copy[mode].submit}
      </SubmitButton>
    </form>
  );
}
