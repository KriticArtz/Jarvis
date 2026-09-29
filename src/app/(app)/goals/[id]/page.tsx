import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth";
import { deleteProgress } from "@/lib/actions/goals";
import { getGoal, getProgressSince } from "@/lib/data/queries";
import { describeTarget, formatAmount, summarizeGoalProgress } from "@/lib/progress";
import { formatShortDate, localDate } from "@/lib/time";
import { uuid } from "@/lib/validation/schemas";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { LogProgressForm } from "@/components/goals/log-progress-form";
import { DeleteProgressButton, GoalStatusActions } from "@/components/goals/goal-actions";
import { EditGoal } from "@/components/goals/edit-goal";

export const metadata: Metadata = { title: "Goal" };

const SOURCE_LABEL = { manual: "Logged", task: "From task", check_in: "Check-in", sms: "By text", assistant: "Assistant" } as const;

export default async function GoalDetailPage({ params }: PageProps<"/goals/[id]">) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const { supabase, userId, profile } = await requireOnboardedUser();
  const goal = await getGoal(supabase, userId, id);
  if (!goal) notFound();

  const today = localDate(profile.timezone || "UTC");
  const entries = await getProgressSince(supabase, userId, "1970-01-01", [goal.id]);
  const s = summarizeGoalProgress(goal, entries, today);
  const unit = goal.target_unit ?? "times";

  return (
    <div className="flex flex-col gap-5">
      <Link href="/goals" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" /> Goals
      </Link>
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{goal.title}</h1>
          {goal.status !== "active" ? <Badge tone={goal.status === "completed" ? "success" : "neutral"} className="capitalize">{goal.status}</Badge> : null}
        </div>
        <p className="mt-1 text-muted">
          <span className="capitalize">{goal.category}</span> · {goal.priority} priority · {describeTarget(goal) || "No target"}
        </p>
        {goal.description ? <p className="mt-3 leading-relaxed">{goal.description}</p> : null}
      </header>

      <Card>
        <CardHeader title={goal.goal_type === "recurring" ? "This period" : "Progress"} subtitle={s.label} />
        {s.ratio != null ? <ProgressBar value={s.ratio} label={`${goal.title} progress`} tone={s.pace === "behind" ? "warning" : s.pace === "done" ? "success" : "accent"} /> : null}
        {goal.status === "active" ? (
          <div className="mt-5 border-t border-hairline pt-4">
            <p className="mb-2 text-sm font-semibold">Log progress</p>
            <LogProgressForm goalId={goal.id} unit={unit} defaultAmount={unit === "minutes" ? 30 : 1} showNote />
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="History" />
        {entries.length ? (
          <ul className="divide-y divide-hairline">
            {entries.slice(0, 50).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="font-medium tabular-nums">{formatAmount(e.amount, unit)}</p>
                  <p className="truncate text-sm text-muted">
                    {formatShortDate(e.logged_for)} · {SOURCE_LABEL[e.source]}
                    {e.note ? ` · ${e.note}` : ""}
                  </p>
                </div>
                {e.source !== "task" ? <DeleteProgressButton action={deleteProgress.bind(null, e.id)} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No progress logged yet" body="Log progress above, or complete tasks linked to this goal from your daily plan." />
        )}
      </Card>

      <Card>
        <CardHeader title="Manage" />
        <div className="flex flex-col gap-4">
          <GoalStatusActions goal={goal} />
          <EditGoal goal={goal} />
        </div>
      </Card>
    </div>
  );
}
