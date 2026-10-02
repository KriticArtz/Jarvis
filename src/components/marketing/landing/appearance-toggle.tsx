"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import type { Appearance } from "@/lib/personalization";
import { cn } from "@/lib/cn";

/**
 * Light / Dark switch for the public landing page. It uses the app's own
 * appearance modes and tokens (data-mode = light | dark | system on the
 * .landing wrapper) — not a second theme system. Visitors aren't signed in,
 * so the choice is remembered in this browser (localStorage); until they
 * choose, the page follows the system setting.
 */
export const LANDING_APPEARANCE_KEY = "landing-appearance";

/** Runs before first paint (inline in the page) so the saved mode never flashes. */
export const appearanceBootScript = `try{var m=localStorage.getItem(${JSON.stringify(LANDING_APPEARANCE_KEY)});if(m==="light"||m==="dark"){document.currentScript.parentElement.dataset.mode=m}}catch(e){}`;

function wrapper(): HTMLElement | null {
  return document.querySelector(".landing");
}

function resolved(mode: Appearance): "light" | "dark" {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function AppearanceToggle({ className }: { className?: string }) {
  const [current, setCurrent] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const el = wrapper();
    if (!el) return;
    const sync = () => setCurrent(resolved((el.dataset.mode as Appearance) ?? "system"));
    sync();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const choose = (mode: "light" | "dark") => {
    const el = wrapper();
    if (!el || mode === current) return;
    const apply = () => {
      el.dataset.mode = mode;
      setCurrent(mode);
    };
    try {
      localStorage.setItem(LANDING_APPEARANCE_KEY, mode);
    } catch {
      // Private mode etc.: the switch still works for this visit.
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (reduce) return apply();
    if (doc.startViewTransition) {
      doc.startViewTransition(apply);
      return;
    }
    el.classList.add("mode-fade");
    apply();
    window.setTimeout(() => el.classList.remove("mode-fade"), 400);
  };

  return (
    <div role="group" aria-label="Appearance" className={cn("glass inline-flex items-center rounded-full p-0.5", className)}>
      {(
        [
          ["light", Sun, "Light mode"],
          ["dark", Moon, "Dark mode"],
        ] as const
      ).map(([mode, Icon, label]) => (
        <button
          key={mode}
          type="button"
          aria-pressed={current === mode}
          aria-label={label}
          title={label}
          onClick={() => choose(mode)}
          className={cn(
            "flex size-11 items-center justify-center rounded-full transition-colors duration-200 sm:size-9",
            current === mode ? "bg-surface text-foreground shadow-card" : "text-muted hover:text-foreground",
          )}
        >
          <Icon className="size-[17px]" aria-hidden />
        </button>
      ))}
    </div>
  );
}
