import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, CalendarClock, ChevronRight, Clock3, TrendingDown } from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth";
import { getAssistantActivity, getCheckIns, getGoals, getLatestPlan, getNotificationPreferences, getProgressSince, getTasksForDate } from "@/lib/data/queries";
import { canReceiveSms } from "@/lib/notifications/scheduler";
import { requirePhoneVerification } from "@/lib/env";
import { summarizeGoalProgress } from "@/lib/progress";
import { resolvePersonalization } from "@/lib/personalization";
import { attentionItems, pickFocus, pickNextUp, type AttentionItem } from "@/lib/dashboard/today";
import { addDays, dayPart, formatDuration, formatLongDate, formatTime12, localDate, localMinutesNow, monthStart, timeToMinutes, weekStart } from "@/lib/time";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, SectionHeader } from "@/components/ui/card";
import { ProgressRing } from "@/components/ui/progress-bar";
import { TaskList } from "@/components/dashboard/task-list";
import { AddTaskForm } from "@/components/dashboard/add-task-form";
import { AssistantBrief } from "@/components/dashboard/assistant-brief";
import { GoalTile } from "@/components/dashboard/goal-tile";
import { CheckInCard } from "@/components/dashboard/check-in-card";
import { RecentActions } from "@/components/dashboard/recent-actions";
import { cn } from "@/lib/cn";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCalendar } from "@/lib/integrations/calendar/context";
import { syncIfStale } from "@/lib/integrations/calendar/sync";

export const metadata: Metadata = { title: "Today" };

/** How many goals the Today screen shows (the rest are on /goals). */
const GOALS_ON_TODAY = 4;

export default async function DashboardPage() {
  const { supabase, userId, profile, isDemo } = await requireOnboardedUser();
  const { assistantName } = resolvePersonalization(profile);
  const tz = profile.timezone || "UTC";
  const today = localDate(tz);
  const part = dayPart(tz);
  const nowMinutes = localMinutesNow(tz);

  const [tasks, goals, progress, checkIns, plan, prefs, activity, calendar] = await Promise.all([
    getTasksForDate(supabase, userId, today),
    getGoals(supabase, userId, ["active"]),
    getProgressSince(supabase, userId, [monthStart(today), weekStart(today), addDays(today, -1)].sort()[0]),
    getCheckIns(supabase, userId, today),
    getLatestPlan(supabase, userId, today),
    getNotificationPreferences(supabase, userId),
    getAssistantActivity(supabase, userId),
    loadCalendar(supabase, userId, { tz, from: today, days: 1 }),
  ]);
  const todaysEvents = calendar?.days[0]?.events ?? [];

  // Keep a connected calendar fresh without making the page wait on Google.
  if (!isDemo) {
    after(async () => {
      const admin = createAdminClient();
      if (admin) await syncIfStale(admin, userId, 60).catch(() => {});
    });
  }

  const goalTitle = new Map(goals.map((g) => [g.id, g.title]));
  const rows = tasks.map((t) => ({ ...t, goalTitle: t.goal_id ? (goalTitle.get(t.goal_id) ?? null) : null }));
  const priorities = rows.filter((t) => t.is_priority);
  const others = rows.filter((t) => !t.is_priority);
  const counted = rows.filter((t) => t.status !== "skipped");
  const doneCount = counted.filter((t) => t.status === "done").length;
  const summaries = new Map(goals.map((g) => [g.id, summarizeGoalProgress(g, progress, today)]));

  const checkInKind = part === "evening" ? "evening" : "morning";
  const existingCheckIn = checkIns.find((c) => c.kind === checkInKind && c.check_in_date === today) ?? null;
  const intention = checkIns.find((c) => c.kind === "morning" && c.check_in_date === today)?.content ?? null;
  const greeting = { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening" }[part];

  const next = pickNextUp(rows, nowMinutes);
  const focus = pickFocus({ intention, tasks: rows, goals, summaries, exclude: next?.id });
  const attention = attentionItems({
    assistantName,
    pendingConfirmations: activity.pending,
    tasks: rows,
    nowMinutes,
    goals,
    summaries,
  });
  const done = activity.recent.slice(0, 4);

  const allDone = counted.length > 0 && doneCount === counted.length;
  const status = "today's note";
  const topGoals = [...goals].sort((a, b) => a.rank - b.rank).slice(0, GOALS_ON_TODAY);

  return (
    <div className="flex flex-col gap-9">
      <header className="animate-fade-in">
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">{formatLongDate(today)}</p>
        <h1 className="mt-1.5 text-[32px] font-bold leading-[1.1] sm:text-[40px]">
          {greeting}
          {profile.display_name ? `, ${profile.display_name}` : ""}.
        </h1>
        <p className="mt-2 text-[17px] text-muted">
          {rows.length === 0 ? `${assistantName} is ready to plan your day with you.` : allDone ? `You finished everything you planned. ${assistantName} is impressed.` : `${assistantName} has your day ready.`}
        </p>
        <AccountabilityStatus
          assistantName={assistantName}
          smsOn={!isDemo && canReceiveSms(profile, prefs, { requireVerified: requirePhoneVerification() })}
          prefs={prefs}
          tz={tz}
          isDemo={isDemo}
        />
      </header>

      <AssistantBrief
        status={status}
        focus={focus}
        nextUp={
          next
            ? {
                id: next.id,
                title: next.title,
                when: next.scheduled_start ? formatTime12(next.scheduled_start) : null,
                meta: [formatDuration(next.duration_minutes) || null, next.goalTitle].filter(Boolean).join(" · ") || null,
              }
            : null
        }
      />

      {attention.length ? <NeedsAttention items={attention} /> : null}

      <section aria-labelledby="today-title">
        <SectionHeader
          title={<span id="today-title">Today</span>}
          subtitle={counted.length ? `${doneCount} of ${counted.length} done` : "Nothing planned yet"}
          action={
            <div className="flex items-center gap-2">
              <ButtonLink href="/plan" size="sm" variant="secondary" aria-label={plan?.status === "accepted" ? "Re-plan my day" : "Plan my day"}>
                <CalendarClock className="size-4" aria-hidden /> {plan?.status === "accepted" ? "Re-plan" : "Plan my day"}
              </ButtonLink>
              {counted.length ? (
                <ProgressRing value={doneCount / counted.length} size={40} stroke={5} label="Today's progress" tone={allDone ? "success" : "accent"} />
              ) : null}
            </div>
          }
        />
        <div className="rounded-[28px] bg-surface px-5 shadow-card">
          {calendar ? (
            <div className="border-b border-hairline py-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">On your calendar</p>
              {todaysEvents.length ? (
                <ul className="mt-2 flex flex-col gap-1.5" aria-label="Today's calendar events">
                  {todaysEvents.map((e, i) => (
                    <li key={`${e.title}-${e.start}-${i}`} className="flex items-baseline gap-3 text-[15px]">
                      <span className="w-[5.5rem] shrink-0 text-[13px] font-medium tabular-nums text-muted">
                        {e.allDay ? "All day" : formatTime12(e.start)}
                      </span>
                      <span className={cn("min-w-0 flex-1 truncate", !e.busy && "text-muted")}>
                        {e.title}
                        {e.tentative ? <span className="text-muted"> · tentative</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-[14px] text-muted">Nothing on your calendar today.</p>
              )}
            </div>
          ) : null}
          {rows.length === 0 ? (
            <div className="py-5">
              <EmptyState
                title="Let's plan your day"
                body={`${assistantName} builds a realistic plan around your schedule and goals.`}
                action={
                  <ButtonLink href="/plan" size="sm">
                    Plan my day
                  </ButtonLink>
                }
              />
            </div>
          ) : (
            <>
              {priorities.length ? (
                <>
                  <p className="pt-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Priorities</p>
                  <TaskList tasks={priorities} numbered />
                </>
              ) : null}
              {others.length ? (
                <>
                  <p className="border-t border-hairline pt-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted first:border-t-0">Also planned</p>
                  <TaskList tasks={others} />
                </>
              ) : null}
            </>
          )}
          <div className="border-t border-hairline">
            <AddTaskForm goals={goals.map((g) => ({ id: g.id, title: g.title }))} />
          </div>
        </div>
      </section>

      {done.length ? <RecentActions actions={done} /> : null}

      <section aria-labelledby="goals-title">
        <SectionHeader
          title={<span id="goals-title">Goal progress</span>}
          subtitle="Where you stand this period"
          action={
            <Link href="/goals" className="inline-flex min-h-10 items-center text-[15px] font-medium text-accent hover:opacity-80">
              See all
            </Link>
          }
        />
        {goals.length ? (
          <div className="grid grid-cols-2 gap-3">
            {topGoals.map((g) => (
              <GoalTile key={g.id} id={g.id} title={g.title} category={g.category} summary={summaries.get(g.id)!} />
            ))}
          </div>
        ) : (
          <EmptyState title="No active goals" body={`Add a goal so ${assistantName} knows what you're working toward.`} action={<ButtonLink href="/goals" size="sm">Add a goal</ButtonLink>} />
        )}
      </section>

      <CheckInCard
        kind={checkInKind}
        assistantName={assistantName}
        existing={existingCheckIn ? { rating: existingCheckIn.rating, content: existingCheckIn.content } : null}
      />
    </div>
  );
}

const ATTENTION_ICON = { confirm: AlertCircle, late: Clock3, behind: TrendingDown } as const;

function NeedsAttention({ items }: { items: AttentionItem[] }) {
  return (
    <section aria-labelledby="attention-title">
      <SectionHeader title={<span id="attention-title">Needs attention</span>} />
      <ul className="overflow-hidden rounded-[24px] bg-surface shadow-card">
        {items.map((item) => {
          const Icon = ATTENTION_ICON[item.kind];
          return (
            <li key={item.key} className="border-b border-hairline last:border-b-0">
              <Link href={item.href} className="flex min-h-14 items-center gap-3.5 px-4 py-3 transition-colors hover:bg-surface-2/60">
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full",
                    item.kind === "confirm" ? "bg-accent-soft text-accent" : "bg-warning-soft text-warning",
                  )}
                >
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{item.title}</span>
                  <span className="block truncate text-[13px] text-muted">{item.detail}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** One line that makes the proactive-accountability loop visible. */
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
  if (smsOn && prefs) {
    const now = localMinutesNow(tz);
    const slots = [
      prefs.morning_checkin_enabled ? { t: prefs.morning_checkin_time, l: "morning check-in" } : null,
      prefs.evening_checkin_enabled ? { t: prefs.evening_checkin_time, l: "evening check-in" } : null,
    ].filter((s): s is { t: string; l: string } => Boolean(s));
    const next = slots.find((s) => timeToMinutes(s.t) > now) ?? slots[0];
    return (
      <p className="mt-3 flex items-start gap-2 text-[14px] leading-snug text-muted">
        <span className="relative mt-[6px] flex size-2 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-50 motion-reduce:hidden" />
          <span className="relative inline-flex size-2 rounded-full bg-success" />
        </span>
        {assistantName} is keeping you accountable by text{next ? ` · next ${next.l} ${formatTime12(next.t)}` : ""}
      </p>
    );
  }
  return (
    <p className="mt-3 flex items-start gap-2 text-[14px] leading-snug text-muted">
      <span className="mt-[6px] inline-flex size-2 shrink-0 rounded-full bg-accent" />
      {isDemo ? (
        <>{assistantName} is keeping you accountable here — in your own account it also checks in by text.</>
      ) : (
        <span>
          {assistantName} is keeping you accountable here.{" "}
          <Link href="/settings#sms" className="font-medium text-accent hover:underline">
            Turn on text check-ins
          </Link>
        </span>
      )}
    </p>
  );
}
