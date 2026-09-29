"use client";

import { useOptimistic, useTransition } from "react";
import { Check, MoreHorizontal, Trash2, X } from "lucide-react";
import type { Task } from "@/lib/types/domain";
import { deleteTask, setTaskStatus } from "@/lib/actions/tasks";
import { formatDuration, formatTime12 } from "@/lib/time";
import { cn } from "@/lib/cn";

type Row = Task & { goalTitle: string | null };

export function TaskList({ tasks, numbered = false }: { tasks: Row[]; numbered?: boolean }) {
  const [optimistic, update] = useOptimistic(tasks, (state: Row[], change: { id: string; status?: Task["status"]; remove?: boolean }) =>
    change.remove ? state.filter((t) => t.id !== change.id) : state.map((t) => (t.id === change.id ? { ...t, status: change.status ?? t.status } : t)),
  );
  const [, startTransition] = useTransition();

  const setStatus = (id: string, status: Task["status"]) =>
    startTransition(async () => {
      update({ id, status });
      await setTaskStatus(id, status);
    });
  const remove = (id: string) =>
    startTransition(async () => {
      update({ id, remove: true });
      await deleteTask(id);
    });

  return (
    <ol className="flex flex-col divide-y divide-border">
      {optimistic.map((t, i) => {
        const done = t.status === "done";
        const skipped = t.status === "skipped";
        return (
          <li key={t.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <button
              type="button"
              onClick={() => setStatus(t.id, done ? "pending" : "done")}
              aria-label={done ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`}
              aria-pressed={done}
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                done ? "border-success bg-success text-white" : "border-border hover:border-accent",
              )}
            >
              {done ? <Check className="size-4" strokeWidth={3} /> : numbered ? <span className="text-xs font-semibold text-muted">{i + 1}</span> : null}
            </button>
            <div className={cn("min-w-0 flex-1", (done || skipped) && "opacity-55")}>
              <p className={cn("font-medium", done && "line-through", skipped && "line-through decoration-muted")}>{t.title}</p>
              <p className="text-sm text-muted">
                {[
                  t.scheduled_start ? formatTime12(t.scheduled_start) : null,
                  formatDuration(t.duration_minutes) || null,
                  t.goalTitle,
                  skipped ? "Skipped" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <details className="relative">
              <summary className="list-none rounded-lg p-2 text-muted hover:bg-surface-2 [&::-webkit-details-marker]:hidden" aria-label={`More actions for ${t.title}`}>
                <MoreHorizontal className="size-4" />
              </summary>
              <div className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
                {skipped ? (
                  <button type="button" onClick={() => setStatus(t.id, "pending")} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2">
                    Restore
                  </button>
                ) : (
                  <button type="button" onClick={() => setStatus(t.id, "skipped")} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2">
                    <X className="size-4" /> Skip today
                  </button>
                )}
                <button type="button" onClick={() => remove(t.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft">
                  <Trash2 className="size-4" /> Delete
                </button>
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
