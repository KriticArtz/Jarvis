import "server-only";
import type { DB } from "@/lib/data/db";
import { getGoals, getProfile, getProgressSince, getTasksBetween } from "@/lib/data/queries";
import { addDays, localDate } from "@/lib/time";
import { computeWeeklyStats } from "./stats";

export async function loadWeeklyStats(db: DB, userId: string, week: string) {
  const profile = await getProfile(db, userId);
  if (!profile) throw new Error("Profile not found");
  const today = localDate(profile.timezone || "UTC");
  const end = addDays(week, 6);
  const [tasks, goals, progress, checkIns] = await Promise.all([
    getTasksBetween(db, userId, week, end),
    getGoals(db, userId, ["active", "paused", "completed", "archived"]),
    getProgressSince(db, userId, week),
    db.from("daily_check_ins").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("check_in_date", week).lte("check_in_date", end),
  ]);
  const stats = computeWeeklyStats({
    weekStart: week,
    today,
    tasks,
    goals,
    progress: progress.filter((p) => p.logged_for <= end),
    checkInCount: checkIns.count ?? 0,
  });
  return { stats, profile, today };
}
