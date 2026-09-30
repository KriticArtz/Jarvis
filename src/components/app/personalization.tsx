"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_ASSISTANT_NAME, DEFAULT_THEME, defaultAppearance, type Appearance, type Theme } from "@/lib/personalization";
import { cn } from "@/lib/cn";

interface Look {
  theme: Theme;
  appearance: Appearance;
}

interface PersonalizationValue extends Look {
  assistantName: string;
  /** Show a color theme immediately (before the save round-trip finishes). */
  previewTheme: (theme: Theme) => void;
  /** Show an appearance mode immediately (before the save round-trip finishes). */
  previewAppearance: (appearance: Appearance) => void;
}

const PersonalizationContext = createContext<PersonalizationValue | null>(null);

/**
 * App shell for signed-in pages. The server passes the user's saved
 * personalization (from their profile); this applies the color theme and
 * appearance mode via data-theme / data-mode (on the shell for first paint,
 * and on <html> so the page background and form controls match) and exposes
 * the assistant's name to client components.
 */
export function PersonalizationShell({
  assistantName,
  theme,
  appearance,
  className,
  children,
}: {
  assistantName: string;
  theme: Theme;
  appearance: Appearance;
  className?: string;
  children: ReactNode;
}) {
  // A preview only applies while the saved values are the ones it was made
  // from; once the server sends newly saved values, they win.
  const saved = `${theme}:${appearance}`;
  const [preview, setPreview] = useState<{ from: string; look: Look } | null>(null);
  const look: Look = preview && preview.from === saved ? preview.look : { theme, appearance };

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = look.theme;
    root.dataset.mode = look.appearance;
    return () => {
      delete root.dataset.theme;
      delete root.dataset.mode;
    };
  }, [look.theme, look.appearance]);

  const value = useMemo<PersonalizationValue>(
    () => ({
      assistantName,
      theme: look.theme,
      appearance: look.appearance,
      previewTheme: (next) => setPreview((p) => ({ from: saved, look: { ...(p?.from === saved ? p.look : { theme, appearance }), theme: next } })),
      previewAppearance: (next) => setPreview((p) => ({ from: saved, look: { ...(p?.from === saved ? p.look : { theme, appearance }), appearance: next } })),
    }),
    [assistantName, look.theme, look.appearance, saved, theme, appearance],
  );

  return (
    <PersonalizationContext.Provider value={value}>
      <div data-theme={look.theme} data-mode={look.appearance} className={cn("bg-canvas text-foreground", className)}>
        {children}
      </div>
    </PersonalizationContext.Provider>
  );
}

/** Personalization for client components; safe defaults outside the app shell. */
export function usePersonalization(): PersonalizationValue {
  return (
    useContext(PersonalizationContext) ?? {
      assistantName: DEFAULT_ASSISTANT_NAME,
      theme: DEFAULT_THEME,
      appearance: defaultAppearance(DEFAULT_THEME),
      previewTheme: () => {},
      previewAppearance: () => {},
    }
  );
}
