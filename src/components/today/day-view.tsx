"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronDown, MoreHorizontal, Trash2, Undo2, X } from "lucide-react";
import { buildTimeline, type DayEvent, type DayTask, type TimelineEntry } from "@/lib/dashboard/day";
import { deleteTask, setTaskStatus } from "@/lib/actions/tasks";
import { formatDuration, formatTime12, localMinutesNow, minutesToTime } from "@/lib/time";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

type Change = { id: string; status?: DayTask["status"]; remove?: boolean };

/** Upcoming items shown before "N more later today". */
const UPCOMING_SHOWN = 4;

/**
 * The day as one line: calendar events and timed tasks in time order on a
 * thin thread, a live "now" marker, earlier items folded away, and untimed
 * tasks quietly underneath ("Later"). Completing a task is optimistic and
 * springs a check; the server re-renders the rest of Today.
 */
export function DayView({
  tasks,
  events,
  timezone,
  initialNow,
  addTask,
  middle,
}: {
  tasks: DayTask[];
  events: DayEvent[];
  timezone: string;
  /** Server-rendered "now" (minutes), so the first client render matches. */
  initialNow: number;
  addTask: React.ReactNode;
  /** Rendered between the day and "Later" (the recommendation). */
  middle?: React.ReactNode;
}) {
  const [optimistic, apply] = useOptimistic(tasks, (state: DayTask[], c: Change) =>
    c.remove ? state.filter((t) => t.id !== c.id) : state.map((t) => (t.id === c.id ? { ...t, status: c.status ?? t.status } : t)),
  );
  const [, startTransition] = useTransition();
  const toast = useToast();
  const now = useNow(timezone, initialNow);
  const timeline = buildTimeline({ tasks: optimistic, events, nowMinutes: now });
  const [showEarlier, setShowEarlier] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const setStatus = (t: DayTask, status: DayTask["status"]) =>
    startTransition(async () => {
      apply({ id: t.id, status });
      const res = await setTaskStatus(t.id, status);
      if (!res.ok) toast({ title: "Couldn't update that task", description: "Nothing was changed.", tone: "danger" });
      else if (status === "done") toast({ title: `Done: ${t.title}`, tone: "success" });
    });
  const remove = (t: DayTask) =>
    startTransition(async () => {
      apply({ id: t.id, remove: true });
      const res = await deleteTask(t.id);
      if (!res.ok) toast({ title: "Couldn't delete that task", tone: "danger" });
    });
  const actions = { setStatus, remove };

  // Fold finished things from earlier today; keep anything that slipped (still pending) visible.
  const folded = timeline.entries.filter((e, i) => i < timeline.nowIndex && e.phase === "past" && (e.kind === "event" || e.task.status !== "pending"));
  const foldable = folded.length >= 2;
  // Keep the day scannable: the next few things, the rest one tap away.
  const nowAt = Math.min(timeline.nowIndex, timeline.entries.length);
  const cutoff = showAll ? Infinity : nowAt + UPCOMING_SHOWN;
  const hiddenLater = Math.max(0, timeline.entries.length - cutoff);
  const visible = timeline.entries
    .map((e, i) => ({ e, i }))
    .filter(({ e, i }) => (!foldable || showEarlier || !folded.includes(e)) && i < cutoff);

  return (
    <div className="flex flex-col gap-section">
      {timeline.entries.length || timeline.allDay.length ? (
        <section aria-labelledby="day-title">
          <h2 id="day-title" className="sr-only">
            Your day
          </h2>
          {timeline.allDay.length ? (
            <ul className="mb-4 flex flex-wrap gap-2" aria-label="All day">
              {timeline.allDay.map((e, i) => (
                <li key={`${e.title}-${i}`} className="rounded-full bg-surface-2 px-3 py-1 text-[13px] text-muted shadow-[inset_0_0_0_1px_var(--hairline)]">
                  <span className="type-eyebrow mr-1.5 text-[10px]">All day</span>
                  {e.title}
                </li>
              ))}
            </ul>
          ) : null}
          {foldable ? (
            <button
              type="button"
              onClick={() => setShowEarlier((v) => !v)}
              aria-expanded={showEarlier}
              className="mb-1 ml-[5.25rem] inline-flex min-h-11 items-center gap-1.5 rounded-full text-[13px] font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring sm:ml-[5.75rem]"
            >
              <ChevronDown className={cn("size-4 transition-transform duration-(--dur-2)", showEarlier && "rotate-180")} aria-hidden />
              {showEarlier ? "Hide earlier" : `Earlier today · ${folded.length}`}
            </button>
          ) : null}
          <ol className="relative">
            {visible.map(({ e, i }) => (
              <Entry key={e.key} entry={e} isLast={i === timeline.entries.length - 1} nowBefore={i === nowAt} now={now} actions={actions} />
            ))}
            {nowAt === timeline.entries.length && timeline.entries.length ? <NowMarker now={now} /> : null}
          </ol>
          {hiddenLater ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="ml-[5.25rem] inline-flex min-h-11 items-center gap-1.5 rounded-full text-[13px] font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring sm:ml-[5.75rem]"
            >
              <ChevronDown className="size-4" aria-hidden /> {hiddenLater} more later today
            </button>
          ) : null}
        </section>
      ) : null}

      {middle}

      {timeline.later.length ? (
        <section aria-labelledby="later-title">
          <h2 id="later-title" className="type-eyebrow mb-2 px-1">
            {timeline.entries.length ? "Later" : "Today"}
          </h2>
          <ul className="overflow-hidden rounded-panel bg-surface-raised shadow-card [&>li+li]:shadow-[inset_0_1px_0_var(--hairline)]">
            {timeline.later.map((t) => (
              <li key={t.id}>
                <LaterRow task={t} actions={actions} />
              </li>
            ))}
            <li>{addTask}</li>
          </ul>
        </section>
      ) : (
        <div className="-mt-4">{addTask}</div>
      )}
    </div>
  );
}

/** Minutes since local midnight in the user's timezone, refreshed every minute. */
function useNow(timezone: string, initial: number): number {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    const id = window.setInterval(() => setNow(localMinutesNow(timezone)), 60_000);
    return () => window.clearInterval(id);
  }, [timezone]);
  return now;
}

type Actions = { setStatus: (t: DayTask, s: DayTask["status"]) => void; remove: (t: DayTask) => void };

function NowMarker({ now }: { now: number }) {
  return (
    <li aria-label={`Now, ${formatTime12(minutesToTime(now))}`} className="relative grid grid-cols-[4.5rem_1fr] items-center gap-x-3 py-1 sm:grid-cols-[5rem_1fr]">
      <span className="type-time text-right text-[12px] font-semibold text-now">{formatTime12(minutesToTime(now))}</span>
      <span className="relative flex items-center">
        <span className="now-pulse relative z-10 size-[11px] rounded-full bg-now" />
        <span className="h-[1.5px] flex-1 rounded-full bg-now/70" />
      </span>
    </li>
  );
}

function Entry({ entry, isLast, nowBefore, now, actions }: { entry: TimelineEntry; isLast: boolean; nowBefore: boolean; now: number; actions: Actions }) {
  const past = entry.phase === "past";
  const current = entry.phase === "now";
  const task = entry.kind === "task" ? entry.task : null;
  const done = task?.status === "done";
  const skipped = task?.status === "skipped";
  const slipped = Boolean(task && task.status === "pending" && past);
  const quiet = (past && !slipped) || done || skipped;
  const meta = (
    entry.kind === "event"
      ? ["Calendar", entry.end ? `until ${formatTime12(entry.end)}` : null, entry.event.tentative ? "tentative" : null, entry.event.location]
      : [task!.isPriority ? "Priority" : null, formatDuration(task!.durationMinutes) || null, task!.goalTitle, skipped ? "Skipped" : slipped ? "Planned earlier" : null]
  )
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {nowBefore ? <NowMarker now={now} /> : null}
      <li className="group/entry relative grid grid-cols-[4.5rem_1fr] gap-x-3 sm:grid-cols-[5rem_1fr]">
        <time className={cn("type-time pt-[13px] text-right text-[13px]", current ? "font-semibold text-foreground" : "text-muted")}>
          {formatTime12(entry.start)}
        </time>
        <div className="relative flex min-w-0 items-start gap-3 pb-1">
          {/* the thread */}
          {!isLast ? <span aria-hidden className="absolute -bottom-3 left-[21px] top-[34px] w-px bg-line" /> : null}
          {task ? (
            <button
              type="button"
              onClick={() => actions.setStatus(task, done ? "pending" : "done")}
              aria-label={done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
              aria-pressed={done}
              className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  "flex size-[22px] items-center justify-center rounded-full transition-[background-color,box-shadow,transform] duration-(--dur-3) ease-spring group-active/entry:scale-95",
                  done
                    ? "bg-accent text-accent-foreground"
                    : current
                      ? "bg-background shadow-[inset_0_0_0_2px_var(--now)]"
                      : "bg-background shadow-[inset_0_0_0_1.5px_var(--line)] hover:shadow-[inset_0_0_0_1.5px_var(--accent)]",
                )}
              >
                {done ? <Check className="check-pop size-[13px]" strokeWidth={3.2} aria-hidden /> : null}
              </span>
            </button>
          ) : (
            <span aria-hidden className="relative z-10 flex size-11 shrink-0 items-center justify-center">
              <span className={cn("size-[9px] rounded-full", current ? "now-pulse relative bg-now" : quiet ? "bg-line" : "bg-muted/60")} />
            </span>
          )}
          <EntryBody
            href={entry.kind === "event" ? "/calendar?view=day" : null}
            className="min-w-0 flex-1 py-2.5"
          >
            <p className={cn("text-[16px] leading-snug", current ? "font-semibold" : "font-medium", quiet && "text-muted", (done || skipped) && "line-through decoration-subtle/70")}>
              {entry.title}
            </p>
            {meta ? <p className="type-num mt-0.5 text-[13px] leading-snug text-muted">{meta}</p> : null}
          </EntryBody>
          {task ? <TaskMenu task={task} actions={actions} /> : null}
        </div>
      </li>
    </>
  );
}

/** Calendar events open the calendar (the whole text block is the target); tasks are plain text. */
function EntryBody({ href, className, children }: { href: string | null; className: string; children: React.ReactNode }) {
  if (!href) return <div className={className}>{children}</div>;
  return (
    <Link href={href} className={cn(className, "-mx-2 rounded-tile px-2 hover:bg-surface-2/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring")}>
      {children}
    </Link>
  );
}

function LaterRow({ task, actions }: { task: DayTask; actions: Actions }) {
  const done = task.status === "done";
  const skipped = task.status === "skipped";
  return (
    <div className="flex min-h-14 items-center gap-1 pl-1.5 pr-2">
      <button
        type="button"
        onClick={() => actions.setStatus(task, done ? "pending" : "done")}
        aria-label={done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
        aria-pressed={done}
        className="flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
      >
        <span
          className={cn(
            "flex size-[22px] items-center justify-center rounded-full transition-[background-color,box-shadow] duration-(--dur-3) ease-spring",
            done ? "bg-accent text-accent-foreground" : "shadow-[inset_0_0_0_1.5px_var(--line)] hover:shadow-[inset_0_0_0_1.5px_var(--accent)]",
          )}
        >
          {done ? <Check className="check-pop size-[13px]" strokeWidth={3.2} aria-hidden /> : null}
        </span>
      </button>
      <div className="min-w-0 flex-1 py-2">
        <p className={cn("truncate text-[15px] font-medium", (done || skipped) && "text-muted line-through decoration-subtle/70")}>{task.title}</p>
        {task.isPriority || task.goalTitle || task.durationMinutes || skipped ? (
          <p className="type-num truncate text-[13px] text-muted">
            {[task.isPriority ? "Priority" : null, formatDuration(task.durationMinutes) || null, task.goalTitle, skipped ? "Skipped" : null].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>
      <TaskMenu task={task} actions={actions} />
    </div>
  );
}

function TaskMenu({ task, actions }: { task: DayTask; actions: Actions }) {
  const skipped = task.status === "skipped";
  return (
    <details className="relative shrink-0 [&[open]>summary]:bg-surface-2">
      <summary
        aria-label={`More for “${task.title}”`}
        className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full text-subtle transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal className="size-[18px]" aria-hidden />
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-48 animate-fade-in overflow-hidden rounded-tile bg-surface-raised p-1 shadow-lift">
        <button
          type="button"
          onClick={(e) => {
            (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
            actions.setStatus(task, skipped ? "pending" : "skipped");
          }}
          className="flex min-h-11 w-full items-center gap-2.5 rounded-control px-3 text-left text-[14px] hover:bg-surface-2"
        >
          {skipped ? <Undo2 className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />} {skipped ? "Restore" : "Skip today"}
        </button>
        <button
          type="button"
          onClick={(e) => {
            (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
            actions.remove(task);
          }}
          className="flex min-h-11 w-full items-center gap-2.5 rounded-control px-3 text-left text-[14px] text-danger hover:bg-danger-soft"
        >
          <Trash2 className="size-4" aria-hidden /> Delete
        </button>
      </div>
    </details>
  );
}
