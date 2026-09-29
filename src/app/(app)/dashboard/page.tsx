import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, MessageCircle } from "lucide-react";
import { brand } from "@/config/brand";
import { requireOnboardedUser } from "@/lib/auth";
import { getCheckIns, getGoals, getLatestPlan, getNotificationPreferences, getProgressSince, getTasksForDate } from "@/lib/data/queries";
import { canReceiveSms } from "@/lib/notifications/scheduler";
import { requirePhoneVerification } from "@/lib/env";
import { summarizeGoalProgress } from "@/lib/progress";
import { addDays, dayPart, formatLongDate, formatTime12, localDate, localMinutesNow, monthStart, timeToMinutes, weekStart } from "@/lib/time";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, SectionHeader } from "@/components/ui/card";
import { ProgressRing } from "@/components/ui/progress-bar";
import { TaskList } from "@/components/dashboard/task-list";
import { AddTaskForm } from "@/components/dashboard/add-task-form";
import { InsightCard } from "@/components/dashboard/insight-card";
import { GoalTile } from "@/components/dashboard/goal-tile";
import { CheckInCard } from "@/components/dashboard/check-in-card";

export const metadata: Metadata = { title: "Today" };

export default async function DashboardPage() {
  const { supabase, userId, profile, isDemo } = await requireOnboardedUser();
  const tz = profile.timezone || "UTC";
  const today = localDate(tz);
  const part = dayPart(tz);

  const [tasks, goals, progress, checkIns, plan, prefs] = await Promise.all([
    getTasksForDate(supabase, userId, today),
    getGoals(supabase, userId, ["active"]),
    getProgressSince(supabase, userId, [monthStart(today), weekStart(today), addDays(today, -1)].sort()[0]),
    getCheckIns(supabase, userId, today),
    getLatestPlan(supabase, userId, today),
    getNotificationPreferences(supabase, userId),
  ]);

  const goalTitle = new Map(goals.map((g) => [g.id, g.title]));
  const rows = tasks.map((t) => ({ ...t, goalTitle: t.goal_id ? (goalTitle.get(t.goal_id) ?? null) : null }));
  const priorities = rows.filter((t) => t.is_priority);
  const others = rows.filter((t) => !t.is_priority);
  const counted = rows.filter((t) => t.status !== "skipped");
  const doneCount = counted.filter((t) => t.status === "done").length;
  const checkInKind = part === "evening" ? "evening" : "morning";
  const existingCheckIn = checkIns.find((c) => c.kind === checkInKind && c.check_in_date === today) ?? null;
  const greeting = { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening" }[part];

  return (
    <div className="flex flex-col gap-10">
      <header className="animate-fade-in">
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">{formatLongDate(today)}</p>
        <h1 className="mt-1.5 text-[34px] font-bold leading-[1.1] sm:text-[40px]">
          {greeting}
          {profile.display_name ? `, ${profile.display_name}` : ""}
        </h1>
        <AccountabilityStatus smsOn={!isDemo && canReceiveSms(profile, prefs, { requireVerified: requirePhoneVerification() })} prefs={prefs} tz={tz} isDemo={isDemo} />
        <div className="mt-6 grid gap-2.5 sm:flex">
          <ButtonLink href="/assistant" size="lg">
            <MessageCircle className="size-[18px]" aria-hidden /> Chat with {brand.assistantName}
          </ButtonLink>
          <ButtonLink href="/plan" size="lg" variant="secondary">
            <CalendarClock className="size-[18px]" aria-hidden /> {plan?.status === "accepted" ? "Re-plan my day" : "Plan my day"}
          </ButtonLink>
        </div>
      </header>

      <InsightCard />

      <section aria-labelledby="today-title">
        <SectionHeader
          title={<span id="today-title">Today</span>}
          subtitle={counted.length ? `${doneCount} of ${counted.length} done` : "Nothing planned yet"}
          action={
            counted.length ? (
              <ProgressRing value={counted.length ? doneCount / counted.length : 0} size={40} stroke={5} label="Today's progress" tone={doneCount === counted.length ? "success" : "accent"} />
            ) : null
          }
        />
        <div className="rounded-[28px] bg-surface px-5 shadow-card">
          {rows.length === 0 ? (
            <div className="py-5">
              <EmptyState
                title="Let's plan your day"
                body={`${brand.assistantName} builds a realistic plan around your schedule and goals.`}
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

      <section aria-labelledby="goals-title">
        <SectionHeader
          title={<span id="goals-title">Your goals</span>}
          subtitle="Progress this period"
          action={
            <Link href="/goals" className="text-[15px] font-medium text-accent hover:opacity-80">
              See all
            </Link>
          }
        />
        {goals.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {goals.map((g) => (
              <GoalTile key={g.id} id={g.id} title={g.title} category={g.category} summary={summarizeGoalProgress(g, progress, today)} />
            ))}
          </div>
        ) : (
          <EmptyState title="No active goals" body="Add a goal so your assistant knows what you're working toward." action={<ButtonLink href="/goals" size="sm">Add a goal</ButtonLink>} />
        )}
      </section>

      <CheckInCard kind={checkInKind} existing={existingCheckIn ? { rating: existingCheckIn.rating, content: existingCheckIn.content } : null} />
    </div>
  );
}

/** One line that makes the proactive-accountability loop visible. */
function AccountabilityStatus({
  smsOn,
  prefs,
  tz,
  isDemo,
}: {
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
      <p className="mt-3 flex items-start gap-2 text-[15px] leading-snug text-muted">
        <span className="relative mt-[7px] flex size-2 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-50" />
          <span className="relative inline-flex size-2 rounded-full bg-success" />
        </span>
        {brand.assistantName} is keeping you accountable by text{next ? ` · next ${next.l} ${formatTime12(next.t)}` : ""}
      </p>
    );
  }
  return (
    <p className="mt-3 flex items-start gap-2 text-[15px] leading-snug text-muted">
      <span className="mt-[7px] inline-flex size-2 shrink-0 rounded-full bg-accent" />
      {isDemo ? (
        <>{brand.assistantName} is keeping you accountable here — in your own account it also checks in by text.</>
      ) : (
        <>
          {brand.assistantName} is keeping you accountable here.{" "}
          <Link href="/settings#sms" className="font-medium text-accent hover:underline">
            Turn on text check-ins
          </Link>
        </>
      )}
    </p>
  );
}
