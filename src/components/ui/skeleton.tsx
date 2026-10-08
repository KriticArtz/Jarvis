import { cn } from "@/lib/cn";

/**
 * Placeholder shapes while content loads. A soft shimmer moves across them
 * (still under reduced motion). Compose them into the shape of the real
 * screen so nothing jumps when content arrives.
 */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("ui-skeleton block rounded-chip", className)} />;
}

/** A few lines of text; the last one shorter, like a real paragraph. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span aria-hidden className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? "w-3/5" : "w-full")} />
      ))}
    </span>
  );
}

/** Wraps skeletons with the right semantics for assistive tech. */
export function Loading({ label = "Loading", children, className }: { label?: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      {children}
    </div>
  );
}
