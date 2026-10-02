"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/result";
import { sendTestCheckIn, setEmailAccountability } from "@/lib/actions/email";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
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
