"use client";

import { useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { brand } from "@/config/brand";
import { exitDemoToSignup, resetDemo } from "@/lib/actions/demo";

/** Slim, always-visible reminder that this is a demo with sample data. */
export function DemoBanner() {
  const [pending, startTransition] = useTransition();
  return (
    <div className="sticky top-0 z-40 border-b border-hairline bg-surface/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-2 text-[13px]">
        <p className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-full bg-brand-gradient px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">Demo</span>
          <span className="truncate text-muted">
            <span className="hidden sm:inline">You&apos;re exploring {brand.name} with sample data</span>
            <span className="sm:hidden">Sample data</span>
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => void resetDemo())}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
          >
            <RotateCcw className={pending ? "size-3.5 animate-spin" : "size-3.5"} /> <span>{pending ? "Resetting" : "Reset"}</span>
          </button>
          <form action={exitDemoToSignup}>
            <button type="submit" className="rounded-full bg-accent px-3 py-1.5 font-medium text-accent-foreground transition-all hover:bg-accent-hover active:scale-95">
              Create your own<span className="hidden sm:inline"> {brand.name}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
