import { Loading, Skeleton } from "@/components/ui/skeleton";

/** Shown while an app page loads: a quiet, page-shaped placeholder (title, then a few rows). */
export default function AppLoading() {
  return (
    <Loading label="Loading" className="flex flex-col">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-3 h-10 w-64 max-w-full rounded-control" />
      <Skeleton className="mt-3 h-4 w-48" />
      <div className="mt-10 flex flex-col gap-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-4 w-12 shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="mt-2 h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </Loading>
  );
}
