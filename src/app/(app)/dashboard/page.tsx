import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { requireOnboardedUser } from "@/lib/auth";
import { getAssistantActivity, getCheckIns, getCommitments, getGoals, getLatestPlan, getNotificationPreferences, getProgressSince, getTasksBetween, getTasksForDate } from "@/lib/data/queries";
import { canReceiveSms } from "@/lib/notifications/scheduler";
import { requirePhoneVerification } from "@/lib/env";
import { isAIConfigured } from "@/lib/ai/client";
import { summarizeGoalProgress } from "@/lib/progress";
import { resolvePersonalization } from "@/lib/personalization";
import { buildTimeline, interpretDay, recommendations, sleepSignal, type DayEvent, type DayTask } from "@/lib/dashboard/day";
import { addDays, dayPart, formatLongDate, localDate, localMinutesNow, monthStart, weekStart } from "@/lib/time";
import { comingUp, dayWindow, weekRhythm, weekSoFar } from "@/lib/dashboard/overview";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCalendar } from "@/lib/integrations/calendar/context";
import { syncIfStale } from "@/lib/integrations/calendar/sync";
import { calendarWriteState } from "@/lib/integrations/calendar/mutations";
import { loadFitnessSummary } from "@/lib/integrations/fitness/store";
import { AddTaskForm } from "@/components/dashboard/add-task-form";
import { DayView } from "@/components/today/day-view";
import { PlanSheetProvider } from "@/components/today/plan-sheet";
import { PlanButton, RecommendationCard } from "@/components/today/recommendation";
import { CheckInPrompt } from "@/components/today/check-in-prompt";
import { DayStrip, type DayMark } from "@/components/today/day-graphic";
import { AccountabilityStatus, CalendarStatus, ComingUp, GoalRings, PanelHeader, VitalsRow, WeekRhythm, panelClass, vitals, widePanelClass } from "@/components/today/overview";
import { cn } from "@/lib/cn";
import { ArrowUpRight } from "lucide-react";
import { Presence } from "@/components/ui/presence";

export const metadata: Metadata = { title: "Today" };

/** Goals shown in "Momentum" — only ones with real progress to show. */
const MOMENTUM_MAX = 3;
/** Days after today that "Coming up" looks ahead. */
const AHEAD_DAYS = 3;

/**
 * Today: the greeting and one honest line about the day, what to do next,
 * the day itself, and how the week and goals are going. Everything comes from
 * the user's own data (tasks, calendar, routines, goal progress); nothing is
 * invented, and every panel has a plain empty state.
 */
export default async function DashboardPage() {
  const { supabase, userId, profile, isDemo } = await requireOnboardedUser();
  const { assistantName } = resolvePersonalization(profile);
  const tz = profile.timezone || "UTC";
  const today = localDate(tz);
  const part = dayPart(tz);
  const nowMinutes = localMinutesNow(tz);

  const monday = weekStart(today);
  const rangeEnd = [addDays(monday, 6), addDays(today, AHEAD_DAYS)].sort()[1];
  const [tasks, goals, progress, checkIns, plan, prefs, activity, calendar, accepted, calendarState, fitness, rangeTasks, routines] = await Promise.all([
    getTasksForDate(supabase, userId, today),
    getGoals(supabase, userId, ["active"]),
    getProgressSince(supabase, userId, [monthStart(today), weekStart(today), addDays(today, -1)].sort()[0]),
    getCheckIns(supabase, userId, today),
    getLatestPlan(supabase, userId, today),
    getNotificationPreferences(supabase, userId),
    getAssistantActivity(supabase, userId),
    loadCalendar(supabase, userId, { tz, from: today, days: 1 + AHEAD_DAYS }),
    supabase.from("daily_plans").select("id").eq("user_id", userId).eq("plan_date", today).eq("status", "accepted").limit(1),
    isDemo ? Promise.resolve("not_connected" as const) : calendarWriteState(supabase, userId),
    loadFitnessSummary(supabase, userId, { tz, today, days: 8 }).catch(() => null),
    getTasksBetween(supabase, userId, monday, rangeEnd),
    getCommitments(supabase, userId),
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

  const marks: DayMark[] = timeline.entries.map((e) => ({
    key: e.key,
    kind: e.kind,
    title: e.title,
    start: e.start,
    end: e.end,
    done: e.kind === "task" && e.task.status === "done",
    priority: e.kind === "task" && e.task.isPriority,
  }));
  const span = dayWindow({ wake: profile.wake_time, sleep: profile.sleep_time, entries: timeline.entries });
  const week = weekRhythm(rangeTasks, monday, today);
  const ahead = comingUp({
    today,
    days: AHEAD_DAYS,
    events: (calendar?.days.slice(1) ?? []).flatMap((d) => d.events.map((e) => ({ id: e.id, date: d.date, title: e.title, start: e.start, allDay: e.allDay }))),
    tasks: rangeTasks,
    routines,
    limit: 6,
  });
  const glance = vitals({ tasks: dayTasks, events: dayEvents.filter((e) => !e.allDay).length, goals: [...summaries.values()] });
  const smsOn = !isDemo && canReceiveSms(profile, prefs, { requireVerified: requirePhoneVerification() });
  const replan = plan?.status === "accepted";
  const waiting = activity.pending.length;

  const greetingBlock = (
    <>
      <h1 className="type-display text-[40px] leading-[1.02] sm:text-[54px]">
        {greeting}
        {firstName ? `, ${firstName}` : ""}.
      </h1>
      <p className="mt-3 max-w-[52ch] text-[17px] leading-snug text-muted sm:text-[19px]">{line}</p>
    </>
  );
  const day = (
    <DayView tasks={dayTasks} events={dayEvents} timezone={tz} initialNow={nowMinutes} addTask={<AddTaskForm goals={goals.map((g) => ({ id: g.id, title: g.title }))} />} />
  );
  const dayHeader = <PanelHeader id="your-day-title" title="Your day" action={<CalendarStatus state={calendarState} isDemo={isDemo} />} />;
  const openConversation = (
    <Link
      href="/assistant"
      className="-my-3 inline-flex min-h-11 items-center gap-1 rounded-full text-[14px] font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
    >
      Open conversation <ArrowUpRight className="size-4" aria-hidden />
    </Link>
  );

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
      {/*
       * The assistant's console holds the right column for the whole page; the
       * day reads down the left. On phones the console follows the greeting, so
       * the next useful action comes first. data-layout="wide" lets the app
       * shell give Today a wider canvas; every other page keeps its column.
       */}
      <div data-layout="wide" className="grid items-start gap-5 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,410px)]">
        <header className="min-w-0 pt-1 xl:col-start-1 xl:row-start-1">
          <div className="flex items-center justify-between gap-3">
            <p className="type-eyebrow">{formatLongDate(today)}</p>
            <PlanButton replan={replan} />
          </div>
          <div className="mt-3">{greetingBlock}</div>
        </header>

        <aside
          aria-label={assistantName}
          className="console flex flex-col gap-6 rounded-[28px] p-5 sm:p-7 xl:sticky xl:top-8 xl:col-start-2 xl:row-span-4 xl:row-start-1"
        >
          <div className="flex items-center gap-3.5">
            <Presence size={44} />
            <div className="min-w-0 flex-1">
              <p className="type-display truncate text-[24px] leading-none">{assistantName}</p>
              <p className="mt-1.5 text-[13px] text-muted">{waiting ? `${waiting === 1 ? "One change is" : `${waiting} changes are`} waiting for your OK` : "Nothing is waiting for your OK"}</p>
            </div>
          </div>
          <RecommendationCard candidates={candidates} assistantName={assistantName} bare />
          {checkInKind ? <CheckInPrompt kind={checkInKind} assistantName={assistantName} /> : null}
          {/* Momentum belongs to the console on desktop; on phones it follows the day (below). */}
          <div className="hidden h-px bg-hairline xl:block" />
          <GoalRings items={momentum} className="hidden xl:block" />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-hairline pt-4">
            <AccountabilityStatus assistantName={assistantName} smsOn={smsOn} prefs={prefs} tz={tz} isDemo={isDemo} className="min-w-0 flex-1" />
            {openConversation}
          </div>
        </aside>

        <section aria-label="Today at a glance" className={cn(panelClass, "flex flex-col gap-6 p-5 sm:p-6 xl:col-start-1 xl:row-start-2")}>
          <VitalsRow items={glance} />
          <DayStrip marks={marks} window={span} timezone={tz} initialNow={nowMinutes} />
        </section>

        <section aria-labelledby="your-day-title" className={cn(widePanelClass, "min-w-0 sm:p-6 xl:col-start-1 xl:row-start-3")}>
          {dayHeader}
          {day}
        </section>

        <div className="grid gap-5 sm:gap-6 md:grid-cols-2 xl:col-start-1 xl:row-start-4">
          <WeekRhythm days={week} total={weekSoFar(week)} className={cn(panelClass, "p-5 sm:p-6")} />
          <ComingUp items={ahead} today={today} days={AHEAD_DAYS} className={cn(panelClass, "p-5 sm:p-6")} />
        </div>
        <GoalRings items={momentum} id="momentum-title-narrow" className={cn(panelClass, "p-5 sm:p-6 xl:hidden")} />
      </div>
    </PlanSheetProvider>
  );
}
