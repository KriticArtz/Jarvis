import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth";
import { loadWeeklyStats } from "@/lib/review/load";
import { formatAmount } from "@/lib/progress";
import { addDays, formatShortDate, localDate, weekStart } from "@/lib/time";
import { isoDate } from "@/lib/validation/schemas";
import { resolvePersonalization } from "@/lib/personalization";
import type { WeeklyReviewRecord } from "@/lib/types/domain";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { GenerateReviewButton } from "@/components/review/generate-review-button";

export const metadata: Metadata = { title: "Weekly review" };

function pct(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 100) : null;
}

export default async function ReviewPage({ searchParams }: PageProps<"/review">) {
  const { supabase, userId, profile } = await requireOnboardedUser();
  const today = localDate(profile.timezone || "UTC");
  const currentWeek = weekStart(today);
  const params = await searchParams;
  const requested = typeof params.week === "string" && isoDate.safeParse(params.week).success ? weekStart(params.week) : currentWeek;
  const week = requested > currentWeek ? currentWeek : requested;

  const [{ stats }, { data: saved }] = await Promise.all([
    loadWeeklyStats(supabase, userId, week),
    supabase.from("weekly_reviews").select("*").eq("user_id", userId).eq("week_start", week).maybeSingle(),
  ]);
  const review = saved as WeeklyReviewRecord | null;
  const inProgress = week === currentWeek;
  const t = stats.tasks;
  const resolved = t.completed + t.skipped + t.missed;

  return (
    <>
      <PageHeader title="Weekly review" subtitle={`${formatShortDate(week)} – ${formatShortDate(addDays(week, 6))}${inProgress ? " · in progress" : ""}`} />

      <nav className="-mt-2 mb-5 flex items-center gap-2" aria-label="Choose week">
        <Link href={`/review?week=${addDays(week, -7)}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-foreground">
          <ChevronLeft className="size-4" /> Previous week
        </Link>
        {!inProgress ? (
          <Link href={`/review?week=${addDays(week, 7)}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-foreground">
            Next week <ChevronRight className="size-4" />
          </Link>
        ) : null}
      </nav>

      {!stats.hasData ? (
        <EmptyState title="Nothing recorded this week" body="Plan tasks, log goal progress or do a check-in — your review is built only from what you actually record." />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Tasks done" value={`${t.completed}/${t.planned}`} sub={t.open ? `${t.open} still open` : undefined} />
            <Stat label="Priorities" value={`${stats.priorities.completed}/${stats.priorities.planned}`} />
            <Stat label="Check-ins" value={String(stats.checkIns)} />
          </div>

          <Card>
            <CardHeader title={`${resolvePersonalization(profile).assistantName}'s take`} subtitle={review ? `Generated ${new Date(review.updated_at).toLocaleDateString("en-US", { timeZone: profile.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Based only on your recorded data."} />
            {review?.summary ? <p className="mb-4 whitespace-pre-wrap leading-relaxed">{review.summary}</p> : null}
            {review?.source === "rules" ? <p className="mb-4 text-xs text-muted">Summary generated from your numbers without AI.</p> : null}
            <GenerateReviewButton week={week} hasReview={Boolean(review)} />
          </Card>

          <Card>
            <CardHeader title="Tasks" />
            <dl className="grid grid-cols-2 gap-y-3 text-sm sm:grid-cols-4">
              <Row label="Completed" value={t.completed} />
              <Row label="Missed" value={t.missed} />
              <Row label="Skipped" value={t.skipped} />
              <Row label="Still open" value={t.open} />
            </dl>
            {resolved > 0 ? (
              <div className="mt-4 flex items-center gap-3">
                <ProgressBar value={t.completed / resolved} label="Completion rate" tone="success" />
                <span className="shrink-0 text-sm tabular-nums text-muted">{pct(t.completed, resolved)}% done</span>
              </div>
            ) : null}
            <div className="mt-5 grid gap-2 text-sm sm:grid-cols-3">
              {(["morning", "afternoon", "evening"] as const).map((part) => {
                const v = stats.timeOfDay[part];
                return (
                  <div key={part} className="rounded-xl bg-surface-2/70 px-3 py-2">
                    <p className="capitalize text-muted">{part}</p>
                    <p className="font-medium tabular-nums">{v.planned ? `${v.completed}/${v.planned} done` : "—"}</p>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader title="Goals & habits" />
            {stats.goals.length ? (
              <ul className="flex flex-col divide-y divide-hairline">
                {stats.goals.map((g) => (
                  <li key={g.goalId} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{g.title}</p>
                      <p className="text-sm tabular-nums text-muted">
                        {g.weeklyTarget != null ? `${formatAmount(g.amount, g.unit)} of ${formatAmount(g.weeklyTarget, g.unit)}` : `${formatAmount(g.amount, g.unit ?? "times")} logged`}
                      </p>
                    </div>
                    {g.consistency != null ? (
                      <div className="mt-2 flex items-center gap-3">
                        <ProgressBar value={g.consistency} label={`${g.title} consistency`} />
                        <span className="w-12 shrink-0 text-right text-sm tabular-nums text-muted">{Math.round(g.consistency * 100)}%</span>
                      </div>
                    ) : null}
                    <p className="mt-1 text-xs text-muted">
                      Active {g.activeDays} day{g.activeDays === 1 ? "" : "s"}
                      {g.tasksPlanned ? ` · ${g.tasksCompleted}/${g.tasksPlanned} related tasks done` : ""}
                      {g.period === "day" && g.consistency != null ? " · consistency = days target was hit" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No goal activity this week.</p>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[24px] bg-surface p-4 shadow-card">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {sub ? <p className="text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
