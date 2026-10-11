import { brand } from "@/config/brand";
import { cn } from "@/lib/cn";

/**
 * The user's assistant. With the default name it is the Arovenna emblem (the
 * supplied logo, cropped — see .brand-mark); with a name the user chose, a
 * disc with that name's first letter, so their choice stays visible.
 * Decorative — always pair it with the name in text.
 */
export function AssistantAvatar({ name, className }: { name: string; className?: string }) {
  if (name.trim() === brand.assistantName) return <span aria-hidden="true" className={cn("brand-mark size-8", className)} />;
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
