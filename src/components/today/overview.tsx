import Link from "next/link";
import { ArrowUpRight, CalendarDays, CheckCircle2, Flag, Repeat, Target } from "lucide-react";
import type { DayTask } from "@/lib/dashboard/day";
import type { ComingItem, WeekDay } from "@/lib/dashboard/overview";
import type { GoalProgressSummary } from "@/lib/progress";
import type { Goal } from "@/lib/types/domain";
import { addDays, formatTime12, isoWeekday, localMinutesNow, timeToMinutes } from "@/lib/time";
import type { NotificationPreferences } from "@/lib/types/domain";
import { cn } from "@/lib/cn";

/*
 * Today's overview panels. Each one draws only the user's own data, and each
 * has an honest empty state; none of them invents a number.
 */

export const panelClass = "rounded-panel bg-surface-raised shadow-card";
/** A panel on wider screens; open on phones, where the frame would only cost width. */
export const widePanelClass = "sm:rounded-panel sm:bg-surface-raised sm:shadow-card";
const linkClass =
  "-my-3 inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring rounded-full";

export function PanelHeader({ id, title, action }: { id: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 id={id} className="type-eyebrow">
        {title}
      </h2>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ vitals */

export interface Vital {
  key: string;
  label: string;
  value: string;
  icon: typeof CheckCircle2;
}

/** Today in four figures, all counted from the user's own data. */
export function vitals({ tasks, events, goals }: { tasks: DayTask[]; events: number; goals: GoalProgressSummary[] }): Vital[] {
  const counted = tasks.filter((t) => t.status !== "skipped");
  const done = counted.filter((t) => t.status === "done").length;
  const priorities = tasks.filter((t) => t.status === "pending" && t.isPriority).length;
  const tracked = goals.filter((g) => g.pace !== "not_applicable");
  const onPace = tracked.filter((g) => g.pace === "on_track" || g.pace === "ahead" || g.pace === "done").length;
  return [
    { key: "done", label: "Tasks done", value: counted.length ? `${done} of ${counted.length}` : "None yet", icon: CheckCircle2 },
    { key: "priorities", label: "Priorities left", value: String(priorities), icon: Flag },
    { key: "events", label: "On your calendar", value: events === 0 ? "None" : events === 1 ? "1 event" : `${events} events`, icon: CalendarDays },
    { key: "goals", label: "Goals on pace", value: tracked.length ? `${onPace} of ${tracked.length}` : "—", icon: Target },
  ];
}

export function VitalsRow({ items, className }: { items: Vital[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4", className)}>
      {items.map(({ key, label, value, icon: Icon }) => (
        <div key={key} className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Icon className="size-[18px]" aria-hidden />
          </span>
          <div className="min-w-0">
            <dt className="truncate text-[12px] font-medium text-muted">{label}</dt>
            <dd className="type-num text-[18px] leading-tight font-semibold tracking-[-0.01em]">{value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ the week */

/** This week, day by day: planned tasks as a column, the done part filled. */
export function WeekRhythm({ days, total, className }: { days: WeekDay[]; total: { planned: number; done: number }; className?: string }) {
  const max = Math.max(3, ...days.map((d) => d.planned));
  return (
    <section aria-labelledby="week-title" className={className}>
      <PanelHeader
        id="week-title"
        title="This week"
        action={
          <Link href="/goals" className={linkClass}>
            Progress <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        }
      />
      <p className="text-[15px]">
        {total.planned ? (
          <>
            <span className="type-num font-semibold">{total.done}</span> of <span className="type-num font-semibold">{total.planned}</span> planned things done so far
          </>
        ) : (
          <span className="text-muted">Nothing planned yet this week.</span>
        )}
      </p>
      <ol className="mt-4 grid grid-cols-7 gap-2" aria-label="Tasks done each day this week">
        {days.map((d) => (
          <li key={d.date} className="flex flex-col items-center gap-2" aria-label={`${d.label}: ${d.planned ? `${d.done} of ${d.planned} done` : "nothing planned"}${d.isToday ? " (today)" : ""}`}>
            <div aria-hidden className="relative flex h-20 w-full max-w-7 flex-col justify-end shadow-[inset_0_-1px_0_var(--line)]">
              {d.planned ? (
                <div
                  className={cn("flex w-full flex-col justify-end gap-[2px] overflow-hidden rounded-[7px]", d.isFuture && "opacity-60")}
                  style={{ height: `${(d.planned / max) * 100}%` }}
                >
                  {d.done < d.planned ? <div className="w-full flex-1 rounded-[7px] bg-accent-soft shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,var(--accent)_45%,transparent)]" /> : null}
                  {d.done ? <div className="w-full shrink-0 rounded-[7px] bg-accent" style={{ height: `calc(${(d.done / d.planned) * 100}% - 1px)` }} /> : null}
                </div>
              ) : null}
            </div>
            <span aria-hidden className={cn("text-[11px]", d.isToday ? "font-semibold text-foreground" : "text-subtle")}>
              {d.label}
            </span>
            <span aria-hidden className={cn("-mt-1.5 size-1 rounded-full", d.isToday ? "bg-now" : "bg-transparent")} />
          </li>
        ))}
      </ol>
      <p aria-hidden className="mt-3 flex items-center gap-4 text-[11px] text-subtle">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-[3px] bg-accent" /> Done
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-[3px] bg-accent-soft shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,var(--accent)_45%,transparent)]" /> Not done yet
        </span>
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ coming up */

const KIND_ICON = { event: CalendarDays, task: CheckCircle2, routine: Repeat } as const;
const KIND_LABEL = { event: "Calendar", task: "Task", routine: "Routine" } as const;

function dayName(date: string, today: string) {
  if (date === addDays(today, 1)) return "Tomorrow";
  return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][isoWeekday(date) - 1];
}

/** The next few fixed things after today — calendar, scheduled tasks and routines. */
export function ComingUp({ items, today, days, className }: { items: ComingItem[]; today: string; days: number; className?: string }) {
  const groups = items.reduce<{ date: string; items: ComingItem[] }[]>((acc, i) => {
    const last = acc.at(-1);
    if (last?.date === i.date) last.items.push(i);
    else acc.push({ date: i.date, items: [i] });
    return acc;
  }, []);
  return (
    <section aria-labelledby="coming-title" className={className}>
      <PanelHeader
        id="coming-title"
        title="Coming up"
        action={
          <Link href="/calendar" className={linkClass}>
            Calendar <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        }
      />
      {groups.length ? (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.date}>
              <p className="mb-1.5 text-[12px] font-semibold text-muted">{dayName(g.date, today)}</p>
              <ul className="flex flex-col">
                {g.items.map((i) => {
                  const Icon = KIND_ICON[i.kind];
                  return (
                    <li key={i.key} className="flex items-center gap-3 border-t border-hairline py-2 first:border-t-0">
                      <span className="type-time w-[4.25rem] shrink-0 text-[12px] text-muted">{i.start ? formatTime12(i.start) : "All day"}</span>
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{i.title}</span>
                      <Icon className="size-3.5 shrink-0 text-subtle" aria-label={KIND_LABEL[i.kind]} />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[14px] text-muted">Nothing scheduled for the next {days === 1 ? "day" : `${days} days`}.</p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ goals */

const PACE: Record<GoalProgressSummary["pace"], { text: string; tone: string } | null> = {
  ahead: { text: "Ahead of pace", tone: "text-success" },
  on_track: { text: "On track", tone: "text-success" },
  behind: { text: "Behind pace", tone: "text-warning" },
  done: { text: "Done for this period", tone: "text-success" },
  not_applicable: null,
};

function Ring({ ratio, size = 56 }: { ratio: number; size?: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 52 52" width={size} height={size} aria-hidden className="shrink-0 -rotate-90">
      <circle cx="26" cy="26" r={r} fill="none" strokeWidth="5" className="stroke-surface-2" />
      <circle
        cx="26"
        cy="26"
        r={r}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        className="stroke-accent transition-[stroke-dasharray] duration-(--dur-4) ease-soft"
        strokeDasharray={`${Math.max(0.02, Math.min(1, ratio)) * c} ${c}`}
      />
    </svg>
  );
}

/** Goals with a measurable target, as progress rings with their real numbers. Render only when there are some. */
export function GoalRings({ items, layout = "list", id = "momentum-title", className }: { items: { goal: Goal; s: GoalProgressSummary }[]; layout?: "list" | "grid"; id?: string; className?: string }) {
  return (
    <section aria-labelledby={id} className={className}>
      <PanelHeader
        id={id}
        title="Momentum"
        action={
          <Link href="/goals" className={linkClass}>
            All goals <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        }
      />
      <ul className={cn(layout === "grid" ? "grid gap-2 sm:grid-cols-2" : "flex flex-col gap-1")}>
        {items.map(({ goal, s }) => {
          const pace = PACE[s.pace];
          const pct = Math.round((s.ratio ?? 0) * 100);
          return (
            <li key={goal.id}>
              <Link
                href={`/goals/${goal.id}`}
                className="group -mx-2 flex items-center gap-4 rounded-tile px-2 py-2.5 transition-colors hover:bg-surface-2/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
              >
                <span className="relative flex items-center justify-center" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${goal.title} progress`}>
                  <Ring ratio={s.ratio ?? 0} />
                  <span aria-hidden className="type-num absolute text-[12px] font-semibold">
                    {pct}%
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="type-display block truncate text-[21px] leading-tight">{goal.title}</span>
                  <span className="type-num block truncate text-[13px] text-muted">{s.label}</span>
                  {pace ? <span className={cn("block text-[12px] font-medium", pace.tone)}>{pace.text}</span> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ calendar + accountability */

/** Where today's events come from — and the way to connect or fix it. */
export function CalendarStatus({ state, isDemo }: { state: "not_connected" | "reauth_required" | "read_only" | "writable"; isDemo: boolean }) {
  if (isDemo) return <span className="text-[13px] text-muted">Sample calendar</span>;
  if (state === "writable" || state === "read_only")
    return (
      <Link href="/calendar" className={linkClass}>
        <CalendarDays className="size-4" aria-hidden /> Google Calendar
      </Link>
    );
  return (
    <Link href="/settings#integrations" className={linkClass}>
      <CalendarDays className="size-4" aria-hidden /> {state === "reauth_required" ? "Reconnect Google Calendar" : "Connect Google Calendar"}
    </Link>
  );
}

/** One quiet line about how the assistant reaches out. */
export function AccountabilityStatus({
  assistantName,
  smsOn,
  prefs,
  tz,
  isDemo,
  className,
}: {
  assistantName: string;
  smsOn: boolean;
  prefs: NotificationPreferences | null;
  tz: string;
  isDemo: boolean;
  className?: string;
}) {
  let text: React.ReactNode;
  if (smsOn && prefs) {
    const now = localMinutesNow(tz);
    const slots = [
      prefs.morning_checkin_enabled ? { t: prefs.morning_checkin_time, l: "morning check-in" } : null,
      prefs.evening_checkin_enabled ? { t: prefs.evening_checkin_time, l: "evening check-in" } : null,
    ].filter((s): s is { t: string; l: string } => Boolean(s));
    const next = slots.find((s) => timeToMinutes(s.t) > now) ?? slots[0];
    text = `${assistantName} checks in by text${next ? ` · next ${next.l} ${formatTime12(next.t)}` : ""}`;
  } else if (isDemo) {
    text = `In your own account, ${assistantName} also checks in by text.`;
  } else {
    text = (
      <>
        {assistantName} can check in by text.{" "}
        <Link href="/settings#sms" className="-my-3 inline-flex min-h-11 items-center font-medium text-foreground underline-offset-4 hover:underline">
          Turn it on
        </Link>
      </>
    );
  }
  return <p className={cn("text-[13px] text-muted", className)}>{text}</p>;
}
