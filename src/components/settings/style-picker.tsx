"use client";

import { useState, useTransition } from "react";
import type { AccountabilityStyle } from "@/lib/types/domain";
import { saveAccountabilityStyle } from "@/lib/actions/profile";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export const STYLES: { value: AccountabilityStyle; title: string; body: string; example: string }[] = [
  { value: "gentle", title: "Gentle", body: "Warm and encouraging. Focus on the next small step.", example: "“No stress — want to try a quick 15 minutes tonight?”" },
  { value: "balanced", title: "Balanced", body: "Friendly and honest about what slipped.", example: "“You planned to work out at 6:30. Still happening?”" },
  { value: "direct", title: "Direct", body: "Concise and candid. Pushes for a commitment.", example: "“That's two missed study sessions. When exactly are you doing it today?”" },
];

export function StylePicker({
  current,
  onboarding = false,
  submitLabel = "Save",
  onSaved,
}: {
  current: AccountabilityStyle;
  onboarding?: boolean;
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const [value, setValue] = useState<AccountabilityStyle>(current);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Accountability style" className="flex flex-col gap-2">
        {STYLES.map((s) => (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={value === s.value}
            onClick={() => setValue(s.value)}
            className={cn(
              "rounded-xl border p-4 text-left transition-colors",
              value === s.value ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-surface-2",
            )}
          >
            <span className="font-semibold">{s.title}</span>
            <span className="mt-0.5 block text-sm text-muted">{s.body}</span>
            <span className="mt-2 block text-sm italic text-foreground/80">{s.example}</span>
          </button>
        ))}
      </div>
      {msg ? <FormMessage tone={msg.ok ? "success" : "error"}>{msg.text}</FormMessage> : null}
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await saveAccountabilityStyle(value, onboarding);
            if (!res.ok) return setMsg({ ok: false, text: res.error ?? "Couldn't save." });
            if (onSaved) onSaved();
            else setMsg({ ok: true, text: "Saved." });
          })
        }
      >
        {pending ? "Saving…" : submitLabel}
      </Button>
    </div>
  );
}
