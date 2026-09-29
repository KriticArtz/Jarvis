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
    <ol className="flex flex-col">
      {optimistic.map((t, i) => {
        const done = t.status === "done";
        const skipped = t.status === "skipped";
        return (
          <li key={t.id} className="group flex items-center gap-3.5 border-b border-hairline py-3.5 last:border-b-0">
            <button
              type="button"
              onClick={() => setStatus(t.id, done ? "pending" : "done")}
              aria-label={done ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`}
              aria-pressed={done}
              className={cn(
                "flex size-[26px] shrink-0 items-center justify-center rounded-full transition-all duration-300 active:scale-90",
                done ? "bg-brand-gradient text-white shadow-[0_2px_8px_-2px_var(--grad-to)]" : "border-[1.5px] border-muted/40 hover:border-accent",
              )}
            >
              {done ? (
                <Check className="size-[15px] animate-fade-in" strokeWidth={3.2} />
              ) : numbered ? (
                <span className="text-[11px] font-semibold text-muted">{i + 1}</span>
              ) : null}
            </button>
            <div className={cn("min-w-0 flex-1 transition-opacity duration-300", (done || skipped) && "opacity-45")}>
              <p className={cn("truncate text-[16px] font-medium", (done || skipped) && "line-through decoration-muted/60")}>{t.title}</p>
              <p className="truncate text-[13px] text-muted">
                {[t.scheduled_start ? formatTime12(t.scheduled_start) : null, formatDuration(t.duration_minutes) || null, t.goalTitle, skipped ? "Skipped" : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <details className="relative">
              <summary
                className="flex size-8 list-none items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 [&::-webkit-details-marker]:hidden"
                aria-label={`More actions for ${t.title}`}
              >
                <MoreHorizontal className="size-[18px]" />
              </summary>
              <div className="absolute right-0 z-10 mt-1 w-44 animate-fade-in overflow-hidden rounded-2xl bg-surface p-1 shadow-lift">
                {skipped ? (
                  <button type="button" onClick={() => setStatus(t.id, "pending")} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-surface-2">
                    Restore
                  </button>
                ) : (
                  <button type="button" onClick={() => setStatus(t.id, "skipped")} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-surface-2">
                    <X className="size-4" /> Skip today
                  </button>
                )}
                <button type="button" onClick={() => remove(t.id)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft">
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
