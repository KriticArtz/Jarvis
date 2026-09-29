import "server-only";
import type { DB } from "@/lib/data/db";
import {
  getCheckIns,
  getCommitments,
  getGoals,
  getMemories,
  getProfile,
  getProgressSince,
  getTasksBetween,
  getLatestPlan,
} from "@/lib/data/queries";
import { busyBlocks, dayBounds, freeWindows, totalMinutes } from "@/lib/planning/availability";
import { describeTarget, summarizeGoalProgress } from "@/lib/progress";
import { addDays, isoWeekday, localDate, localMinutesNow, minutesToTime, monthStart, weekStart } from "@/lib/time";
import type { Goal, Profile, Task } from "@/lib/types/domain";
import type { AssistantContext } from "./context-types";

const WEEKDAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export interface LoadedUserData {
  profile: Profile;
  today: string;
  goals: Goal[];
  todayTasks: Task[];
  context: AssistantContext;
}

/**
 * Build the assistant's structured context for a user from the database.
 * Works with either a user-session client or the service-role client (all
 * queries are explicitly scoped to `userId`).
 */
export async function loadAssistantContext(
  db: DB,
  userId: string,
  opts: { excludeConversationId?: string; now?: Date } = {},
): Promise<LoadedUserData> {
  const profile = await getProfile(db, userId);
  if (!profile) throw new Error("Profile not found");
  const now = opts.now ?? new Date();
  const tz = profile.timezone || "UTC";
  const today = localDate(tz, now);
  const weekAgo = addDays(today, -6);
  const progressSince = [monthStart(today), weekStart(today), weekAgo].sort()[0];

  const [goals, commitments, recentTasks, progress, checkIns, memories, plan, review, convs] = await Promise.all([
    getGoals(db, userId, ["active"]),
    getCommitments(db, userId),
    getTasksBetween(db, userId, weekAgo, today),
    getProgressSince(db, userId, progressSince),
    getCheckIns(db, userId, today),
    getMemories(db, userId, 20),
    getLatestPlan(db, userId, today),
    db
      .from("weekly_reviews")
      .select("week_start, summary")
      .eq("user_id", userId)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("conversations")
      .select("id, summary, updated_at")
      .eq("user_id", userId)
      .not("summary", "is", null)
      .order("updated_at", { ascending: false })
      .limit(4),
  ]);

  const todayTasks = recentTasks.filter((t) => t.task_date === today);
  const weekday = isoWeekday(today);
  const goalTitle = new Map(goals.map((g) => [g.id, g.title]));

  const busy = busyBlocks(today, profile, commitments, todayTasks.filter((t) => t.status === "pending"));
  const bounds = dayBounds(profile, null, localMinutesNow(tz, now));
  const windows = bounds ? freeWindows(bounds.start, bounds.end, busy) : null;

  const pastTasks = recentTasks.filter((t) => t.task_date < today);

  const context: AssistantContext = {
    now: { date: today, time: minutesToTime(localMinutesNow(tz, now)), weekday: WEEKDAY_NAMES[weekday], timezone: tz },
    user: { name: profile.display_name, accountabilityStyle: profile.accountability_style },
    schedule: {
      wake: profile.wake_time,
      sleep: profile.sleep_time,
      work:
        profile.work_start && profile.work_end
          ? { label: profile.work_label, start: profile.work_start, end: profile.work_end, days: profile.work_days }
          : null,
      commitmentsToday: commitments
        .filter((c) => c.days_of_week.includes(weekday))
        .map((c) => ({ title: c.title, start: c.start_time, end: c.end_time })),
      otherCommitments: commitments
        .filter((c) => !c.days_of_week.includes(weekday))
        .map((c) => ({ title: c.title, start: c.start_time, end: c.end_time, days: c.days_of_week })),
      freeWindowsToday: windows ? windows.map((w) => ({ start: minutesToTime(w.start), end: minutesToTime(w.end) })) : null,
      freeMinutesRemainingToday: windows ? totalMinutes(windows) : null,
    },
    goals: goals.map((g) => {
      const s = summarizeGoalProgress(g, progress, today);
      return {
        id: g.id,
        title: g.title,
        category: g.category,
        type: g.goal_type,
        target: describeTarget(g),
        priority: g.priority,
        rank: g.rank,
        progress: s.label,
        pace: s.pace,
        description: g.description,
        dueDate: g.due_date,
      };
    }),
    today: {
      tasks: todayTasks.map((t) => ({
        title: t.title,
        start: t.scheduled_start ? t.scheduled_start.slice(0, 5) : null,
        durationMinutes: t.duration_minutes,
        status: t.status,
        isPriority: t.is_priority,
        goal: t.goal_id ? (goalTitle.get(t.goal_id) ?? null) : null,
      })),
      planAccepted: plan?.status === "accepted",
      checkIns: checkIns.filter((c) => c.check_in_date === today).map((c) => ({ kind: c.kind, rating: c.rating, content: c.content })),
    },
    recent: {
      last7Days: {
        planned: pastTasks.length,
        completed: pastTasks.filter((t) => t.status === "done").length,
        missed: pastTasks.filter((t) => t.status === "pending").length,
      },
      lastWeeklyReview: review.data?.summary ? `Week of ${review.data.week_start}: ${String(review.data.summary).slice(0, 600)}` : null,
    },
    memories: memories.map((m) => m.content),
    otherConversationSummaries: (convs.data ?? [])
      .filter((c) => c.id !== opts.excludeConversationId && c.summary)
      .slice(0, 3)
      .map((c) => String(c.summary).slice(0, 400)),
  };

  return { profile, today, goals, todayTasks, context };
}
