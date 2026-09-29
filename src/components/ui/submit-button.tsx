"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { Button } from "./button";
import { Spinner } from "./spinner";

/** Submit button that shows a pending state while its parent <form> action runs. */
export function SubmitButton({
  children,
  pendingText,
  ...props
}: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? (
        <>
          <Spinner />
          {pendingText ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
