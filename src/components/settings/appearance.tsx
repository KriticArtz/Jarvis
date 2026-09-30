"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { APPEARANCE_OPTIONS, THEME_OPTIONS, type Appearance, type Theme } from "@/lib/personalization";
import { savePersonalization } from "@/lib/actions/profile";
import { usePersonalization } from "@/components/app/personalization";
import { FormMessage } from "@/components/ui/field";
import { cn } from "@/lib/cn";

const MODE_ICON = { light: Sun, dark: Moon, system: Monitor } as const;

type Status = { ok: boolean; text: string } | null;

/**
 * Settings → Appearance: light/dark/system mode and the color theme, chosen
 * independently. Both apply instantly and are saved to the profile, so they
 * follow the user across devices.
 */
export function AppearanceSettings({ theme, appearance }: { theme: Theme; appearance: Appearance }) {
  const router = useRouter();
  const { previewTheme, previewAppearance } = usePersonalization();
  const [mode, setMode] = useState<Appearance>(appearance);
  const [color, setColor] = useState<Theme>(theme);
  const [status, setStatus] = useState<Status>(null);
  const [, startTransition] = useTransition();

  const chooseMode = (next: Appearance) => {
    const previous = mode;
    setMode(next);
    previewAppearance(next);
    setStatus(null);
    startTransition(async () => {
      const res = await savePersonalization({ appearance: next });
      if (!res.ok) {
        setMode(previous);
        previewAppearance(previous);
        setStatus({ ok: false, text: "Couldn't save your appearance. Please try again." });
        return;
      }
      setStatus({ ok: true, text: "Appearance saved." });
      router.refresh();
    });
  };

  const chooseColor = (next: Theme) => {
    const previous = color;
    setColor(next);
    previewTheme(next);
    setStatus(null);
    startTransition(async () => {
      // Save the current mode alongside, so changing color never changes light/dark.
      const res = await savePersonalization({ theme: next, appearance: mode });
      if (!res.ok) {
        setColor(previous);
        previewTheme(previous);
        setStatus({ ok: false, text: "Couldn't save your color theme. Please try again." });
        return;
      }
      setStatus({ ok: true, text: "Color theme saved." });
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-7">
      <fieldset>
        <legend className="mb-1 text-[15px] font-medium">Mode</legend>
        <p className="mb-3 text-[13px] text-muted">Light or dark. System follows your device&apos;s setting.</p>
        <div className="grid grid-cols-3 gap-1 rounded-full bg-surface-2 p-1">
          {APPEARANCE_OPTIONS.map((o) => {
            const Icon = MODE_ICON[o.value];
            const active = mode === o.value;
            return (
              <label key={o.value} className="cursor-pointer">
                <input type="radio" name="appearance" value={o.value} checked={active} onChange={() => chooseMode(o.value)} className="peer sr-only" />
                <span
                  className={cn(
                    "flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3 text-[14px] font-medium transition-[background-color,color,box-shadow] duration-200 peer-focus-visible:ring-4 peer-focus-visible:ring-ring",
                    active ? "bg-surface text-foreground shadow-card" : "text-muted hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-4", active && "text-accent")} aria-hidden />
                  {o.title}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-[15px] font-medium">Color theme</legend>
        <p className="mb-3 text-[13px] text-muted">Sets the accent color. Every theme works in light and dark.</p>
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
          {THEME_OPTIONS.map((t) => (
            <label key={t.value} className="group cursor-pointer">
              <input type="radio" name="theme" value={t.value} checked={color === t.value} onChange={() => chooseColor(t.value)} className="peer sr-only" />
              <span
                className={cn(
                  "flex flex-col items-center gap-2 rounded-[18px] border-2 px-2 py-3 text-center transition-all peer-focus-visible:ring-4 peer-focus-visible:ring-ring",
                  color === t.value ? "border-accent bg-accent-soft" : "border-transparent bg-surface-2 group-hover:bg-surface-2/70",
                )}
              >
                <span
                  className="relative flex size-9 items-center justify-center rounded-full shadow-card"
                  style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }}
                  aria-hidden
                >
                  {color === t.value ? <Check className="size-4 text-white" strokeWidth={3} /> : null}
                </span>
                <span className="text-[13px] font-medium leading-tight">{t.title}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="-mt-4 min-h-5" aria-live="polite">
        {status ? <FormMessage tone={status.ok ? "success" : "error"}>{status.text}</FormMessage> : null}
      </div>
    </div>
  );
}
