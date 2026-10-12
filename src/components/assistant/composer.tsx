"use client";

import { forwardRef } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";

/** Marks the composer as focused so the mobile tab bar steps aside for the keyboard. */
export function setComposerFocus(focused: boolean) {
  if (focused) document.documentElement.dataset.composerFocus = "true";
  else delete document.documentElement.dataset.composerFocus;
}

/**
 * The conversation's command bar. Enter sends, Shift+Enter adds a line
 * (IME composition is respected). On phones it docks above the tab bar, and
 * above the keyboard while focused.
 */
export const Composer = forwardRef<
  HTMLTextAreaElement,
  {
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    busy: boolean;
    placeholder: string;
    label: string;
    onFocusChange?: (focused: boolean) => void;
  }
>(function Composer({ value, onChange, onSend, busy, placeholder, label, onFocusChange }, ref) {
  const canSend = !busy && value.trim().length > 0;
  return (
    <div className="chat-composer sticky bottom-[calc(68px+env(safe-area-inset-bottom))] z-10 -mx-1 bg-gradient-to-t from-background from-60% to-transparent px-1 pb-3 pt-6 md:bottom-0 md:pb-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) onSend();
        }}
        className="flex items-end gap-2 rounded-[24px] bg-surface-raised p-1.5 pl-4 shadow-[0_0_0_1px_var(--hairline),var(--shadow-card)] transition-shadow duration-(--dur-2) focus-within:shadow-[0_0_0_1px_color-mix(in_oklab,var(--accent)_45%,transparent),0_0_0_5px_var(--ring)]"
      >
        <label htmlFor="chat-input" className="sr-only">
          {label}
        </label>
        <textarea
          id="chat-input"
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            setComposerFocus(true);
            onFocusChange?.(true);
          }}
          onBlur={() => {
            setComposerFocus(false);
            onFocusChange?.(false);
          }}
          enterKeyHint="send"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder={placeholder}
          className="max-h-44 min-h-11 flex-1 resize-none bg-transparent py-[11px] text-[16px] leading-[22px] placeholder:text-muted focus:outline-none"
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send"
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform,opacity] duration-(--dur-2) ease-soft active:scale-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring",
            canSend ? "bg-foreground text-background" : "bg-surface-2 text-subtle",
          )}
        >
          <ArrowUp className="size-5" aria-hidden />
        </button>
      </form>
      <p className="mt-2 hidden px-4 text-[12px] text-muted md:block">Enter to send · Shift + Enter for a new line</p>
    </div>
  );
});
