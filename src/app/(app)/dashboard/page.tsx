import type { Metadata } from "next";
import { CalendarClock, MessageCircle } from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth";
import { getCheckIns, getGoals, getLatestPlan, getProgressSince, getTasksForDate } from "@/lib/data/queries";
import { summarizeGoalProgress } from "@/lib/progress";
import { addDays, dayPart, formatLongDate, localDate, monthStart, weekStart } from "@/lib/time";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { TaskList } from "@/components/dashboard/task-list";
import { AddTaskForm } from "@/components/dashboard/add-task-form";
import { InsightCard } from "@/components/dashboard/insight-card";
import { GoalProgressRow } from "@/components/dashboard/goal-progress-row";
import { CheckInCard } from "@/components/dashboard/check-in-card";

export const metadata: Metadata = { title: "Today" };

export default async function DashboardPage() {
  const { supabase, userId, profile } = await requireOnboardedUser();
  const tz = profile.timezone || "UTC";
  const today = localDate(tz);
  const part = dayPart(tz);

  const [tasks, goals, progress, checkIns, plan] = await Promise.all([
    getTasksForDate(supabase, userId, today),
    getGoals(supabase, userId, ["active"]),
    getProgressSince(supabase, userId, [monthStart(today), weekStart(today), addDays(today, -1)].sort()[0]),
    getCheckIns(supabase, userId, today),
    getLatestPlan(supabase, userId, today),
  ]);

  const goalTitle = new Map(goals.map((g) => [g.id, g.title]));
  const rows = tasks.map((t) => ({ ...t, goalTitle: t.goal_id ? (goalTitle.get(t.goal_id) ?? null) : null }));
  const priorities = rows.filter((t) => t.is_priority);
  const others = rows.filter((t) => !t.is_priority);
  const doneCount = rows.filter((t) => t.status === "done").length;
  const checkInKind = part === "evening" ? "evening" : "morning";
  const existingCheckIn = checkIns.find((c) => c.kind === checkInKind && c.check_in_date === today) ?? null;
  const greeting = { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening" }[part];

  return (
    <div className="flex flex-col gap-5">
      <header className="animate-fade-in">
        <p className="text-sm font-medium text-muted">{formatLongDate(today)}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          {greeting}
          {profile.display_name ? `, ${profile.display_name}` : ""}
        </h1>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:flex">
          <ButtonLink href="/assistant" size="lg" className="sm:px-6">
            <MessageCircle className="size-[18px]" aria-hidden /> Chat with Assistant
          </ButtonLink>
          <ButtonLink href="/plan" size="lg" variant="secondary">
            <CalendarClock className="size-[18px]" aria-hidden /> {plan?.status === "accepted" ? "Re-plan my day" : "Plan my day"}
          </ButtonLink>
        </div>
      </header>

      <InsightCard />

      <Card>
        <CardHeader
          title="Today's priorities"
          subtitle={rows.length ? `${doneCount} of ${rows.length} done` : undefined}
        />
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing planned yet"
            body="Let your assistant build a realistic plan around your schedule, or add a task yourself."
            action={
              <ButtonLink href="/plan" size="sm">
                Plan my day
              </ButtonLink>
            }
          />
        ) : priorities.length ? (
          <TaskList tasks={priorities} numbered />
        ) : (
          <p className="text-sm text-muted">No priorities marked for today.</p>
        )}
        {others.length ? (
          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-3 text-sm font-semibold">Also planned</p>
            <TaskList tasks={others} />
          </div>
        ) : null}
        <div className="mt-4">
          <AddTaskForm goals={goals.map((g) => ({ id: g.id, title: g.title }))} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Goal progress"
          action={
            <ButtonLink href="/goals" variant="ghost" size="sm">
              All goals
            </ButtonLink>
          }
        />
        {goals.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {goals.map((g) => (
              <GoalProgressRow key={g.id} id={g.id} title={g.title} summary={summarizeGoalProgress(g, progress, today)} />
            ))}
          </ul>
        ) : (
          <EmptyState title="No active goals" body="Add a goal so your assistant knows what you're working toward." action={<ButtonLink href="/goals" size="sm">Add a goal</ButtonLink>} />
        )}
      </Card>

      <CheckInCard kind={checkInKind} existing={existingCheckIn ? { rating: existingCheckIn.rating, content: existingCheckIn.content } : null} />
    </div>
  );
}
