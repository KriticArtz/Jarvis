"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { shouldDismiss } from "@/lib/ui/roving";
import { IconButton } from "./button";

/**
 * Bottom sheet on phones, centered dialog on larger screens — the home for
 * secondary interactions (details, quick edits, pickers). Built on a native
 * <dialog>: focus is trapped, Esc closes, the page behind is inert.
 * On touch, drag the grabber/header down to dismiss. Closing animates out
 * before the dialog actually closes.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  hideTitle = false,
  footer,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** Keep the title for screen readers only. */
  hideTitle?: boolean;
  /** Sticky actions at the bottom (e.g. Save / Cancel). */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const titleId = useId();
  const descId = useId();

  const requestClose = () => {
    const d = ref.current;
    if (!d?.open || d.dataset.closing !== undefined) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return onClose();
    d.dataset.closing = "";
    window.setTimeout(onClose, 190);
  };

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      delete d.dataset.closing;
      d.showModal();
    }
    if (!open && d.open) {
      d.close();
      delete d.dataset.closing;
    }
  }, [open]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    drag.current = { y: e.clientY, t: performance.now() };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset(Math.max(0, e.clientY - drag.current.y));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dy = e.clientY - drag.current.y;
    const ms = performance.now() - drag.current.t;
    drag.current = null;
    if (shouldDismiss(dy, ms)) {
      setOffset(0);
      onClose();
    } else setOffset(0);
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) requestClose();
      }}
      className={cn(
        "ui-sheet m-0 mt-auto w-full max-w-none overflow-visible bg-transparent p-0 text-foreground",
        "sm:m-auto",
        size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
      )}
    >
      {open ? (
        <div
          ref={panel}
          style={offset ? { transform: `translateY(${offset}px)`, transition: "none" } : undefined}
          className="flex max-h-[92dvh] flex-col rounded-t-sheet bg-surface-raised shadow-sheet transition-transform duration-(--dur-3) ease-soft sm:rounded-sheet sm:shadow-lift"
        >
          <div className="shrink-0 touch-none px-5 pt-2.5 sm:px-6 sm:pt-5" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <div aria-hidden className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div className={cn("min-w-0 pt-1.5", hideTitle && "sr-only")}>
                <h2 id={titleId} className="text-title font-semibold">
                  {title}
                </h2>
                {description ? (
                  <p id={descId} className="mt-1 text-[14px] leading-snug text-muted">
                    {description}
                  </p>
                ) : null}
              </div>
              <IconButton aria-label="Close" onClick={requestClose} className="-mr-2 ml-auto">
                <X className="size-5" aria-hidden />
              </IconButton>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-3 sm:px-6 sm:pb-6">{children}</div>
          {footer ? (
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-hairline px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:justify-end sm:px-6 sm:pb-5">
              {footer}
            </div>
          ) : (
            <div className="h-[env(safe-area-inset-bottom)] shrink-0" />
          )}
        </div>
      ) : null}
    </dialog>
  );
}
