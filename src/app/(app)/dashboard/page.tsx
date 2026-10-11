import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { requireOnboardedUser } from "@/lib/auth";
import { getAssistantActivity, getCheckIns, getGoals, getLatestPlan, getNotificationPreferences, getProgressSince, getTasksForDate } from "@/lib/data/queries";
import { canReceiveSms } from "@/lib/notifications/scheduler";
import { requirePhoneVerification } from "@/lib/env";
import { isAIConfigured } from "@/lib/ai/client";
import { summarizeGoalProgress, type GoalProgressSummary } from "@/lib/progress";
import { resolvePersonalization } from "@/lib/personalization";
import { buildTimeline, interpretDay, recommendations, sleepSignal, type DayEvent, type DayTask } from "@/lib/dashboard/day";
import { addDays, dayPart, formatLongDate, formatTime12, localDate, localMinutesNow, monthStart, timeToMinutes, weekStart } from "@/lib/time";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCalendar } from "@/lib/integrations/calendar/context";
import { syncIfStale } from "@/lib/integrations/calendar/sync";
import { calendarWriteState } from "@/lib/integrations/calendar/mutations";
import { loadFitnessSummary } from "@/lib/integrations/fitness/store";
import type { Goal } from "@/lib/types/domain";
import { AddTaskForm } from "@/components/dashboard/add-task-form";
import { DayView } from "@/components/today/day-view";
import { PlanSheetProvider } from "@/components/today/plan-sheet";
import { PlanButton, RecommendationCard } from "@/components/today/recommendation";
import { CheckInPrompt } from "@/components/today/check-in-prompt";
import { cn } from "@/lib/cn";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { Presence } from "@/components/ui/presence";

export const metadata: Metadata = { title: "Today" };

/** Goals shown in "Momentum" — only ones with real progress to show. */
const MOMENTUM_MAX = 3;

/**
 * Today: a daily briefing, not a dashboard. Greeting and one honest line
 * about the day → the day as one timeline → what to do first → anything
 * untimed → goal momentum → a check-in only when it's the right time.
 * Everything comes from the user's own data; nothing is invented.
 */
export default async function DashboardPage() {
  const { supabase, userId, profile, isDemo } = await requireOnboardedUser();
  const { assistantName } = resolvePersonalization(profile);
  const tz = profile.timezone || "UTC";
  const today = localDate(tz);
  const part = dayPart(tz);
  const nowMinutes = localMinutesNow(tz);

  const [tasks, goals, progress, checkIns, plan, prefs, activity, calendar, accepted, calendarState, fitness] = await Promise.all([
    getTasksForDate(supabase, userId, today),
    getGoals(supabase, userId, ["active"]),
    getProgressSince(supabase, userId, [monthStart(today), weekStart(today), addDays(today, -1)].sort()[0]),
    getCheckIns(supabase, userId, today),
    getLatestPlan(supabase, userId, today),
    getNotificationPreferences(supabase, userId),
    getAssistantActivity(supabase, userId),
    loadCalendar(supabase, userId, { tz, from: today, days: 1 }),
    supabase.from("daily_plans").select("id").eq("user_id", userId).eq("plan_date", today).eq("status", "accepted").limit(1),
    isDemo ? Promise.resolve("not_connected" as const) : calendarWriteState(supabase, userId),
    loadFitnessSummary(supabase, userId, { tz, today, days: 8 }).catch(() => null),
  ]);

  // Keep a connected calendar fresh without making the page wait on Google.
  if (!isDemo) {
    after(async () => {
      const admin = createAdminClient();
      if (admin) await syncIfStale(admin, userId, 60).catch(() => {});
    });
  }

  const goalTitle = new Map(goals.map((g) => [g.id, g.title]));
  const dayTasks: DayTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    start: t.scheduled_start ? t.scheduled_start.slice(0, 5) : null,
    durationMinutes: t.duration_minutes,
    status: t.status,
    isPriority: t.is_priority,
    goalTitle: t.goal_id ? (goalTitle.get(t.goal_id) ?? null) : null,
    sortOrder: t.sort_order,
  }));
  const dayEvents: DayEvent[] = (calendar?.days[0]?.events ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    start: e.start,
    end: e.end,
    allDay: e.allDay,
    busy: e.busy,
    tentative: e.tentative,
    location: e.location,
  }));
  const timeline = buildTimeline({ tasks: dayTasks, events: dayEvents, nowMinutes });
  const summaries = new Map(goals.map((g) => [g.id, summarizeGoalProgress(g, progress, today)]));
  const intention = checkIns.find((c) => c.kind === "morning" && c.check_in_date === today)?.content ?? null;

  const line = interpretDay({ timeline, nowMinutes, dayPart: part, sleep: fitness ? sleepSignal(fitness.days, today) : null });
  const candidates = recommendations({
    assistantName,
    timeline,
    nowMinutes,
    intention,
    pendingConfirmations: activity.pending,
    goals,
    summaries,
  });

  const firstName = profile.display_name?.trim().split(/\s+/)[0];
  const greeting = { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening" }[part];
  // The morning question only once there's a day to aim (an empty day already asks it, above).
  const hasDay = dayTasks.length > 0 || dayEvents.length > 0;
  const checkInKind =
    part === "morning" && !intention && hasDay ? "morning" : part === "evening" && !checkIns.some((c) => c.kind === "evening" && c.check_in_date === today) ? "evening" : null;
  const momentum = [...goals]
    .sort((a, b) => a.rank - b.rank)
    .map((g) => ({ goal: g, s: summaries.get(g.id)! }))
    .filter(({ s }) => s.ratio != null)
    .slice(0, MOMENTUM_MAX);

  return (
    <PlanSheetProvider
      data={{
        draft: plan?.status === "draft" ? plan : null,
        calendarWritable: calendarState === "writable",
        hasAcceptedPlan: Boolean(accepted.data?.length),
        knowsWakingHours: Boolean(profile.wake_time && profile.sleep_time),
        goals: goals.map((g) => ({ id: g.id, title: g.title })),
        aiConfigured: isAIConfigured(),
        assistantName,
      }}
    >
      {/* data-layout="wide" lets the app shell give Today a wider canvas; every other page keeps its column. */}
      <div data-layout="wide" className="flex flex-col gap-10 xl:gap-12">
        <header className="grid gap-x-10 gap-y-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <p className="type-eyebrow">{formatLongDate(today)}</p>
              <span className="xl:hidden">
                <PlanButton replan={plan?.status === "accepted"} />
              </span>
            </div>
            <h1 className="type-display mt-3 text-[44px] leading-[1.02] sm:text-[56px]">
              {greeting}
              {firstName ? `, ${firstName}` : ""}.
            </h1>
            <p className="mt-3 max-w-[56ch] text-[18px] leading-snug text-muted sm:text-[20px]">{line}</p>
          </div>
          <div className="flex flex-col gap-4 xl:items-end">
            <span className="hidden xl:block">
              <PlanButton replan={plan?.status === "accepted"} />
            </span>
            <AtAGlance
              tasks={dayTasks}
              events={dayEvents.filter((e) => !e.allDay).length}
              goals={[...summaries.values()]}
            />
          </div>
        </header>

        <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] xl:gap-12">
          {/* The day: calendar and timed tasks on one line, then everything untimed. */}
          <section aria-labelledby="your-day-title" className="min-w-0">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
              <h2 id="your-day-title" className="type-eyebrow">
                Your day
              </h2>
              <CalendarStatus state={calendarState} isDemo={isDemo} />
            </div>
            <DayView
              tasks={dayTasks}
              events={dayEvents}
              timezone={tz}
              initialNow={nowMinutes}
              addTask={<AddTaskForm goals={goals.map((g) => ({ id: g.id, title: g.title }))} />}
            />
          </section>

          {/* The assistant: next action, a way to ask, check-ins and momentum. Beside the day on desktop, after it on phones. */}
          <aside aria-label={assistantName} className="flex flex-col gap-6 xl:sticky xl:top-8">
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="flex items-center gap-2.5 text-[15px] font-semibold">
                <Presence size="sm" />
                {assistantName}
              </p>
              <Link
                href="/assistant"
                className="-my-3 inline-flex min-h-11 items-center gap-1 text-[14px] font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
              >
                Open conversation <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            </div>
            <RecommendationCard candidates={candidates} assistantName={assistantName} />
            {checkInKind ? <CheckInPrompt kind={checkInKind} assistantName={assistantName} /> : null}
            {momentum.length ? <Momentum items={momentum} /> : null}
            <AccountabilityStatus
              assistantName={assistantName}
              smsOn={!isDemo && canReceiveSms(profile, prefs, { requireVerified: requirePhoneVerification() })}
              prefs={prefs}
              tz={tz}
              isDemo={isDemo}
            />
          </aside>
        </div>
      </div>
    </PlanSheetProvider>
  );
}

/** Today in four honest figures, all counted from the user's own data. */
function AtAGlance({ tasks, events, goals }: { tasks: DayTask[]; events: number; goals: GoalProgressSummary[] }) {
  const done = tasks.filter((t) => t.status === "done").length;
  const open = tasks.filter((t) => t.status === "pending");
  const priorities = open.filter((t) => t.isPriority).length;
  const tracked = goals.filter((g) => g.pace !== "not_applicable");
  const onPace = tracked.filter((g) => g.pace === "on_track" || g.pace === "ahead" || g.pace === "done").length;
  const items = [
    { label: "Tasks done", value: tasks.length ? `${done} of ${tasks.length}` : "None yet" },
    { label: "Priorities left", value: String(priorities) },
    { label: "On your calendar", value: events === 0 ? "None" : events === 1 ? "1 event" : `${events} events` },
    { label: "Goals on pace", value: tracked.length ? `${onPace} of ${tracked.length}` : "—" },
  ];
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-tile bg-surface-raised shadow-card sm:grid-cols-4 xl:min-w-[520px]">
      {items.map((i) => (
        <div key={i.label} className="flex flex-col gap-1 px-4 py-3 shadow-[inset_1px_0_0_var(--hairline),inset_0_1px_0_var(--hairline)]">
          <dt className="text-[12px] font-medium text-muted">{i.label}</dt>
          <dd className="type-num text-[17px] font-semibold tracking-[-0.01em]">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Where today's events come from — and the way to connect or fix it. */
function CalendarStatus({ state, isDemo }: { state: "not_connected" | "reauth_required" | "read_only" | "writable"; isDemo: boolean }) {
  const linkClass = "-my-3 inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring";
  if (isDemo) return <span className="text-[13px] text-muted">Sample calendar</span>;
  if (state === "writable" || state === "read_only")
    return (
      <Link href="/calendar" className={linkClass}>
        <CalendarDays className="size-4" aria-hidden /> Google Calendar · Open calendar
      </Link>
    );
  return (
    <Link href="/settings#integrations" className={linkClass}>
      <CalendarDays className="size-4" aria-hidden /> {state === "reauth_required" ? "Reconnect Google Calendar" : "Connect Google Calendar"}
    </Link>
  );
}

const PACE: Record<GoalProgressSummary["pace"], { text: string; tone: string } | null> = {
  ahead: { text: "Ahead of pace", tone: "text-success" },
  on_track: { text: "On track", tone: "text-success" },
  behind: { text: "Behind pace", tone: "text-warning" },
  done: { text: "Done for this period", tone: "text-success" },
  not_applicable: null,
};

/** Two or three goals, each as a short sentence — no dashboard tiles. */
function Momentum({ items }: { items: { goal: Goal; s: GoalProgressSummary }[] }) {
  return (
    <section aria-labelledby="momentum-title">
      <div className="mb-3 flex items-end justify-between gap-3 px-1">
        <h2 id="momentum-title" className="type-eyebrow">
          Momentum
        </h2>
        <Link href="/goals" className="-my-3 inline-flex min-h-11 items-center text-[14px] font-medium text-muted hover:text-foreground">
          All goals
        </Link>
      </div>
      <ul className="flex flex-col">
        {items.map(({ goal, s }) => {
          const pace = PACE[s.pace];
          return (
            <li key={goal.id} className="border-t border-hairline first:border-t-0">
              <Link
                href={`/goals/${goal.id}`}
                className="group block rounded-tile px-1 py-4 transition-colors hover:bg-surface-2/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <p className="type-display truncate text-[24px] leading-tight">{goal.title}</p>
                  {pace ? <p className={cn("shrink-0 text-[14px] font-medium", pace.tone)}>{pace.text}</p> : null}
                </div>
                <div className="mt-2.5 flex items-center gap-3">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round((s.ratio ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${goal.title} progress`}>
                    <div className="bg-brand-gradient h-full rounded-full transition-[width] duration-(--dur-4) ease-soft" style={{ width: `${Math.max(2, Math.round((s.ratio ?? 0) * 100))}%` }} />
                  </div>
                  <p className="type-num shrink-0 text-[14px] text-muted">{s.label}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** One quiet line about how the assistant reaches out — not part of the main hierarchy. */
function AccountabilityStatus({
  assistantName,
  smsOn,
  prefs,
  tz,
  isDemo,
}: {
  assistantName: string;
  smsOn: boolean;
  prefs: Awaited<ReturnType<typeof getNotificationPreferences>>;
  tz: string;
  isDemo: boolean;
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
  return <p className="border-t border-hairline px-1 pt-5 text-[13px] text-muted">{text}</p>;
}
