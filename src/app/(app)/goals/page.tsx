import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth";
import { getGoals, getProgressSince } from "@/lib/data/queries";
import { describeTarget, summarizeGoalProgress } from "@/lib/progress";
import { localDate } from "@/lib/time";
import type { Goal } from "@/lib/types/domain";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { GoalsToolbar } from "@/components/goals/new-goal-panel";

export const metadata: Metadata = { title: "Goals" };

const PRIORITY_TONE = { high: "danger", medium: "accent", low: "neutral" } as const;

export default async function GoalsPage({ searchParams }: PageProps<"/goals">) {
  const { supabase, userId, profile } = await requireOnboardedUser();
  const today = localDate(profile.timezone || "UTC");
  const goals = await getGoals(supabase, userId, ["active", "paused", "completed", "archived"]);
  // One-time goals count all history; recurring goals only need the current month at most.
  const progress = await getProgressSince(supabase, userId, "1970-01-01", goals.map((g) => g.id));
  const params = await searchParams;

  const groups: { title: string; items: Goal[] }[] = [
    { title: "Active", items: goals.filter((g) => g.status === "active") },
    { title: "Paused", items: goals.filter((g) => g.status === "paused") },
    { title: "Completed", items: goals.filter((g) => g.status === "completed") },
    { title: "Archived", items: goals.filter((g) => g.status === "archived") },
  ];

  return (
    <>
      <PageHeader title="Goals" subtitle="What you're working toward, in order of importance." />
      <GoalsToolbar activeGoals={groups[0].items} startOpen={params.new === "1" || goals.length === 0} />

      {goals.length === 0 ? (
        <EmptyState title="No goals yet" body="Add your first goal above — recurring (like working out 4× a week) or one-time (like saving $300)." />
      ) : (
        <div className="flex flex-col gap-6">
          {groups
            .filter((g) => g.items.length)
            .map((group) => (
              <section key={group.title}>
                <h2 className="mb-2 text-sm font-semibold text-muted">{group.title}</h2>
                <Card className="p-0">
                  <ul className="divide-y divide-hairline">
                    {group.items.map((g, i) => {
                      const s = summarizeGoalProgress(g, progress, today);
                      return (
                        <li key={g.id}>
                          <Link href={`/goals/${g.id}`} className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-surface-2/60">
                            {group.title === "Active" ? (
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-sm font-semibold text-muted">{i + 1}</span>
                            ) : null}
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">{g.title}</p>
                                <Badge tone={PRIORITY_TONE[g.priority]} className="capitalize">
                                  {g.priority}
                                </Badge>
                                <Badge className="capitalize">{g.category}</Badge>
                              </div>
                              <p className="mt-0.5 text-sm text-muted">{describeTarget(g) || "No target set"}</p>
                              {g.status === "active" && s.ratio != null ? (
                                <div className="mt-2 flex items-center gap-3">
                                  <ProgressBar value={s.ratio} label={`${g.title} progress`} tone={s.pace === "behind" ? "warning" : s.pace === "done" ? "success" : "accent"} />
                                  <span className="shrink-0 text-sm tabular-nums text-muted">{s.label}</span>
                                </div>
                              ) : g.status === "active" ? (
                                <p className="mt-1 text-sm text-muted">{s.label}</p>
                              ) : null}
                            </div>
                            <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </section>
            ))}
        </div>
      )}
    </>
  );
}
