"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, CircleAlert, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type ToastTone = "neutral" | "success" | "danger";

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** One optional action, e.g. { label: "View", onClick }. */
  action?: { label: string; onClick: () => void };
  /** ms before it leaves; 0 keeps it until dismissed. Default 4500. */
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
  leaving?: boolean;
}

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

/**
 * Brief, non-blocking feedback ("Saved", "Moved to tomorrow"). Toasts stack
 * above the mobile tab bar, announce politely to screen readers, pause while
 * hovered, and spring in / fade out. Mount <ToastProvider> once in a shell.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 200);
  }, []);

  const toast = useCallback((input: ToastInput) => {
    const id = ++seq.current;
    setItems((list) => [...list.slice(-2), { ...input, id }]);
  }, []);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const duration = item.duration ?? 4500;

  useEffect(() => {
    if (!duration || paused || item.leaving) return;
    const t = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(t);
  }, [duration, paused, item.leaving, onDismiss]);

  const Icon = item.tone === "success" ? Check : item.tone === "danger" ? CircleAlert : Info;
  return (
    <div
      role={item.tone === "danger" ? "alert" : "status"}
      data-leaving={item.leaving ? "" : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="ui-toast pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-tile bg-foreground px-4 py-3 text-background shadow-lift"
    >
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
          item.tone === "success" ? "bg-success text-white" : item.tone === "danger" ? "bg-danger text-white" : "bg-background/15",
        )}
      >
        <Icon className="size-3" strokeWidth={3} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium leading-snug">{item.title}</span>
        {item.description ? <span className="mt-0.5 block text-[13px] leading-snug opacity-70">{item.description}</span> : null}
      </span>
      {item.action ? (
        <button
          type="button"
          onClick={() => {
            item.action!.onClick();
            onDismiss();
          }}
          className="-my-1 shrink-0 rounded-full px-2.5 py-1 text-[14px] font-semibold text-[color-mix(in_oklab,var(--accent)_60%,var(--background))] hover:bg-background/10"
        >
          {item.action.label}
        </button>
      ) : null}
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-my-1 -mr-1.5 flex size-7 shrink-0 items-center justify-center rounded-full opacity-60 hover:bg-background/10 hover:opacity-100">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/** Show a toast. Outside a provider it's a no-op (never breaks a page). */
export function useToast(): (t: ToastInput) => void {
  return useContext(ToastContext) ?? (() => {});
}
