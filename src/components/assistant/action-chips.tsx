import { Check, CircleAlert, Clock, X } from "lucide-react";
import type { ChatAction } from "@/lib/assistant/stream-protocol";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/spinner";

/** Subtle status of actions the assistant took for this reply. */
export function ActionChips({ actions }: { actions: ChatAction[] }) {
  if (!actions.length) return null;
  return (
    <ul className="mb-1.5 flex flex-col items-start gap-1" aria-label="Actions">
      {actions.map((a) => (
        <li
          key={a.id}
          className={cn(
            "inline-flex max-w-full animate-fade-in items-start gap-1.5 rounded-2xl px-3 py-1.5 text-[13px] leading-snug",
            a.status === "running" && "bg-surface-2 text-muted",
            a.status === "succeeded" && "bg-success-soft text-success",
            a.status === "failed" && "bg-danger-soft text-danger",
            a.status === "needs_confirmation" && "bg-warning-soft text-warning",
          )}
        >
          <span className="mt-[2px] shrink-0">
            {a.status === "running" ? (
              <Spinner className="size-3" label="Working" />
            ) : a.status === "succeeded" ? (
              <Check className="size-3.5" strokeWidth={3} aria-label="Done" />
            ) : a.status === "failed" ? (
              <X className="size-3.5" strokeWidth={3} aria-label="Not done" />
            ) : a.status === "needs_confirmation" ? (
              <Clock className="size-3.5" aria-label="Waiting for your OK" />
            ) : (
              <CircleAlert className="size-3.5" />
            )}
          </span>
          <span>{a.status === "needs_confirmation" ? `Waiting for your OK: ${a.label}` : a.label}</span>
        </li>
      ))}
    </ul>
  );
}
