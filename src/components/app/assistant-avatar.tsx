import { cn } from "@/lib/cn";

/**
 * The user's assistant: a theme-gradient disc with the first letter of the
 * name they chose. Decorative — always pair it with the name in text.
 */
export function AssistantAvatar({ name, className }: { name: string; className?: string }) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-8 shrink-0 select-none items-center justify-center rounded-full bg-brand-gradient text-[14px] font-semibold text-white shadow-[0_4px_14px_-6px_var(--grad-to)]",
        className,
      )}
    >
      {initial}
    </span>
  );
}
