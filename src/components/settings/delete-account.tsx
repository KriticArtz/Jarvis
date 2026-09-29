"use client";

import { useActionState, useState } from "react";
import type { ActionResult } from "@/lib/actions/result";
import { deleteAccount } from "@/lib/actions/account";
import { DELETE_CONFIRMATION, DELETED_DATA } from "@/lib/account/deletion";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function DeleteAccount({ requiresPassword }: { requiresPassword: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult, FormData>(deleteAccount, { ok: false });

  if (!open) {
    return (
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete account…
      </Button>
    );
  }

  return (
    <form action={action} className="flex animate-fade-in flex-col gap-4 rounded-2xl bg-danger-soft/40 p-4" noValidate>
      <div>
        <p className="font-semibold text-danger">Permanently delete your account</p>
        <p className="mt-1 text-[14px] text-muted">This can&apos;t be undone. It immediately deletes:</p>
        <ul className="mt-2 list-disc pl-5 text-[14px] text-foreground/85">
          {DELETED_DATA.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <Field label={`Type ${DELETE_CONFIRMATION} to confirm`} htmlFor="delete-confirmation">
        <Input id="delete-confirmation" name="confirmation" autoComplete="off" autoCapitalize="characters" />
      </Field>
      {requiresPassword ? (
        <Field label="Your password" htmlFor="delete-password">
          <Input id="delete-password" name="password" type="password" autoComplete="current-password" />
        </Field>
      ) : null}
      <FormMessage>{state.ok ? null : state.error}</FormMessage>
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="danger" pendingText="Deleting…">
          Delete my account
        </SubmitButton>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
