"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { LANDING_APPEARANCE_KEY } from "@/components/marketing/landing/appearance-toggle";

/**
 * The only non-essential browser storage we use is the homepage appearance
 * choice (set only when the visitor picks light or dark). This shows whether
 * it is stored in this browser and lets the visitor remove it. There are no
 * analytics or advertising cookies, so there is nothing to opt in or out of.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readStored(): boolean {
  try {
    return localStorage.getItem(LANDING_APPEARANCE_KEY) !== null;
  } catch {
    return false;
  }
}

export function CookiePreferences() {
  // null on the server: storage only exists in the browser.
  const stored = useSyncExternalStore<boolean | null>(subscribe, readStored, () => null);
  const [cleared, setCleared] = useState(false);

  const clear = () => {
    try {
      localStorage.removeItem(LANDING_APPEARANCE_KEY);
    } catch {
      // Storage blocked: nothing is stored either.
    }
    listeners.forEach((l) => l());
    setCleared(true);
  };

  return (
    <div className="mt-4 rounded-2xl bg-surface-2 p-5">
      <p className="!mt-0 font-semibold">Homepage appearance setting</p>
      <p className="!mt-1 text-[15px]">
        {stored === null
          ? "Checking this browser…"
          : stored
            ? "Stored in this browser."
            : "Not stored in this browser."}
      </p>
      <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={clear} disabled={!stored}>
        Remove appearance setting
      </Button>
      <p role="status" className="!mt-2 text-[14px] text-muted">
        {cleared ? "Removed. The homepage will use its default appearance." : ""}
      </p>
    </div>
  );
}
