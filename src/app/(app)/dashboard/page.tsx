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
      <div className="flex flex-col gap-section">
        <header>
          <div className="flex items-center justify-between gap-3">
            <p className="type-eyebrow">{formatLongDate(today)}</p>
            <PlanButton replan={plan?.status === "accepted"} />
          </div>
          <h1 className="type-display mt-3 text-[44px] leading-[1.02] sm:text-[56px]">
            {greeting}
            {firstName ? `, ${firstName}` : ""}.
          </h1>
          <p className="mt-3 text-[18px] leading-snug text-muted sm:text-[20px]">{line}</p>
        </header>

        <DayView
          tasks={dayTasks}
          events={dayEvents}
          timezone={tz}
          initialNow={nowMinutes}
          middle={<RecommendationCard candidates={candidates} assistantName={assistantName} />}
          addTask={<AddTaskForm goals={goals.map((g) => ({ id: g.id, title: g.title }))} />}
        />

        {momentum.length ? <Momentum items={momentum} /> : null}

        {checkInKind ? <CheckInPrompt kind={checkInKind} assistantName={assistantName} /> : null}

        <AccountabilityStatus
          assistantName={assistantName}
          smsOn={!isDemo && canReceiveSms(profile, prefs, { requireVerified: requirePhoneVerification() })}
          prefs={prefs}
          tz={tz}
          isDemo={isDemo}
        />
      </div>
    </PlanSheetProvider>
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
