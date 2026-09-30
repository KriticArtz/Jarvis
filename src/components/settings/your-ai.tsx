"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import {
  ASSISTANT_NAME_MAX,
  ASSISTANT_NAME_SUGGESTIONS,
  PERSONALITY_OPTIONS,
  THEME_OPTIONS,
  assistantNameSchema,
  type Personality,
  type Theme,
} from "@/lib/personalization";
import { savePersonalization } from "@/lib/actions/profile";
import { usePersonalization } from "@/components/app/personalization";
import { AssistantAvatar } from "@/components/app/assistant-avatar";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";

/**
 * Name + personality for the user's assistant. Used in Settings and as the
 * "Your AI" onboarding step. Saved to the profile (server-side), so it
 * reaches every AI prompt and SMS.
 */
export function AssistantIdentityForm({
  name: initialName,
  personality: initialPersonality,
  onboarding = false,
  submitLabel = "Save",
  onSaved,
}: {
  name: string;
  personality: Personality;
  onboarding?: boolean;
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [personality, setPersonality] = useState<Personality>(initialPersonality);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const preview = assistantNameSchema.safeParse(name);

  const save = () =>
    startTransition(async () => {
      setMsg(null);
      const check = assistantNameSchema.safeParse(name);
      if (!check.success) {
        setNameError(check.error.issues[0].message);
        return;
      }
      setNameError(null);
      const res = await savePersonalization({ assistant_name: check.data, assistant_personality: personality }, { onboarding });
      if (!res.ok) {
        if (res.fieldErrors?.assistant_name) setNameError(res.fieldErrors.assistant_name);
        setMsg({ ok: false, text: res.error ?? "Couldn't save. Please try again." });
        return;
      }
      if (onSaved) onSaved();
      else {
        setMsg({ ok: true, text: `Saved. Say hi to ${check.data}.` });
        router.refresh();
      }
    });

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div>
        <Field label="Assistant name" htmlFor="assistant-name" error={nameError ?? undefined}>
          <div className="flex items-center gap-3">
            <AssistantAvatar name={preview.success ? preview.data : "?"} className="size-11 text-[18px]" />
            <Input
              id="assistant-name"
              name="assistant_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={ASSISTANT_NAME_MAX + 8}
              autoComplete="off"
              placeholder="e.g. Nova"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? "assistant-name-error assistant-name-hint" : "assistant-name-hint"}
            />
          </div>
        </Field>
        <p id="assistant-name-hint" className="mt-2 text-[13px] text-muted">
          Pick anything that feels right — or try one of these:
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ASSISTANT_NAME_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setName(s)}
              aria-pressed={name.trim() === s}
              className={cn(
                "min-h-9 rounded-full px-3.5 text-[14px] font-medium transition-colors",
                name.trim() === s ? "bg-accent text-accent-foreground" : "bg-surface-2 text-foreground hover:bg-accent-soft hover:text-accent",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <fieldset>
        <legend className="mb-1 text-[15px] font-medium">Personality</legend>
        <p className="mb-3 text-[13px] text-muted">How {preview.success ? preview.data : "your assistant"} talks to you. It never changes what&apos;s true or safe.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {PERSONALITY_OPTIONS.map((p) => (
            <label key={p.value} className="group cursor-pointer">
              <input
                type="radio"
                name="assistant_personality"
                value={p.value}
                checked={personality === p.value}
                onChange={() => setPersonality(p.value)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "flex h-full flex-col rounded-[20px] border-2 p-4 transition-all duration-200 peer-focus-visible:ring-4 peer-focus-visible:ring-ring",
                  personality === p.value ? "border-accent bg-accent-soft" : "border-transparent bg-surface-2 group-hover:bg-surface-2/70",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{p.title}</span>
                  {personality === p.value ? <Check className="size-4 text-accent" strokeWidth={3} aria-hidden /> : null}
                </span>
                <span className="mt-0.5 text-[14px] text-muted">{p.body}</span>
                <span className="mt-2 text-[13px] italic text-foreground/75">{p.example}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {msg ? <FormMessage tone={msg.ok ? "success" : "error"}>{msg.text}</FormMessage> : null}
      <Button type="submit" size={onboarding ? "lg" : "md"} disabled={pending} className={onboarding ? "w-full" : "self-start"}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

/** Theme swatches. Applies instantly, then saves to the profile. */
export function ThemePicker({ current }: { current: Theme }) {
  const router = useRouter();
  const { previewTheme } = usePersonalization();
  const [selected, setSelected] = useState<Theme>(current);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const choose = (theme: Theme) => {
    const previous = selected;
    setSelected(theme);
    previewTheme(theme);
    setStatus(null);
    startTransition(async () => {
      const res = await savePersonalization({ theme });
      if (!res.ok) {
        setSelected(previous);
        previewTheme(previous);
        setStatus({ ok: false, text: "Couldn't save your theme. Please try again." });
        return;
      }
      setStatus({ ok: true, text: "Theme saved." });
      router.refresh();
    });
  };

  return (
    <fieldset>
      <legend className="mb-3 text-[15px] font-medium">Appearance</legend>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        {THEME_OPTIONS.map((t) => (
          <label key={t.value} className="group cursor-pointer">
            <input type="radio" name="theme" value={t.value} checked={selected === t.value} onChange={() => choose(t.value)} className="peer sr-only" />
            <span
              className={cn(
                "flex flex-col items-center gap-2 rounded-[18px] border-2 px-2 py-3 text-center transition-all peer-focus-visible:ring-4 peer-focus-visible:ring-ring",
                selected === t.value ? "border-accent bg-accent-soft" : "border-transparent bg-surface-2 group-hover:bg-surface-2/70",
              )}
            >
              <span
                className="relative flex size-9 items-center justify-center rounded-full shadow-card"
                style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }}
                aria-hidden
              >
                {selected === t.value ? <Check className="size-4 text-white" strokeWidth={3} /> : null}
              </span>
              <span className="text-[13px] font-medium leading-tight">{t.title}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-3 min-h-5" aria-live="polite">
        {status ? <FormMessage tone={status.ok ? "success" : "error"}>{status.text}</FormMessage> : null}
      </div>
    </fieldset>
  );
}
