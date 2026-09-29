export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-2" />
      <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
      <div className="mt-4 h-40 animate-pulse rounded-2xl bg-surface-2" />
      <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
    </div>
  );
}
