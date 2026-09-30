"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_ASSISTANT_NAME, DEFAULT_THEME, type Theme } from "@/lib/personalization";
import { cn } from "@/lib/cn";

interface PersonalizationValue {
  assistantName: string;
  theme: Theme;
  /** Show a theme immediately (before the save round-trip finishes). */
  previewTheme: (theme: Theme) => void;
}

const PersonalizationContext = createContext<PersonalizationValue | null>(null);

/**
 * App shell for signed-in pages. The server passes the user's saved
 * personalization (from their profile); this applies the theme via
 * data-theme (on the shell for first paint, and on <html> so the page
 * background and form controls match) and exposes the assistant's name to
 * client components.
 */
export function PersonalizationShell({
  assistantName,
  theme,
  className,
  children,
}: {
  assistantName: string;
  theme: Theme;
  className?: string;
  children: ReactNode;
}) {
  // A preview only applies while the saved theme is the one it was made from;
  // once the server sends the newly saved theme, the saved value wins.
  const [preview, setPreview] = useState<{ from: Theme; value: Theme } | null>(null);
  const effective = preview && preview.from === theme ? preview.value : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = effective;
    return () => {
      delete root.dataset.theme;
    };
  }, [effective]);

  const value = useMemo<PersonalizationValue>(
    () => ({ assistantName, theme: effective, previewTheme: (value) => setPreview({ from: theme, value }) }),
    [assistantName, effective, theme],
  );

  return (
    <PersonalizationContext.Provider value={value}>
      <div data-theme={effective} className={cn("bg-canvas text-foreground", className)}>
        {children}
      </div>
    </PersonalizationContext.Provider>
  );
}

/** Personalization for client components; safe defaults outside the app shell. */
export function usePersonalization(): PersonalizationValue {
  return useContext(PersonalizationContext) ?? { assistantName: DEFAULT_ASSISTANT_NAME, theme: DEFAULT_THEME, previewTheme: () => {} };
}
