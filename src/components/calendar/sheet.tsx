"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Modal sheet on a native <dialog> (focus trap, Esc to close, inert
 * background). Slides up from the bottom on phones, centered on larger screens.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Tap on the backdrop closes.
        if (e.target === ref.current) onClose();
      }}
      className="m-0 mt-auto w-full max-w-none animate-rise rounded-t-[28px] bg-surface p-0 text-foreground shadow-lift backdrop:bg-black/40 backdrop:backdrop-blur-[2px] sm:m-auto sm:max-w-lg sm:rounded-[28px]"
    >
      {open ? (
        <div className="max-h-[88dvh] overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-6">
          <div className="sticky top-0 z-10 -mx-1 mb-2 flex justify-end bg-surface">
            <button type="button" onClick={onClose} className="flex size-11 items-center justify-center rounded-full text-muted hover:bg-surface-2" aria-label="Close">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
