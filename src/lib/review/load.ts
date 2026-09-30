import "server-only";
import type { DB } from "@/lib/data/db";
import { getGoals, getProfile, getProgressSince, getTasksBetween } from "@/lib/data/queries";
import { addDays, localDate } from "@/lib/time";
import { computeWeeklyStats } from "./stats";
import { loadCalendar } from "@/lib/integrations/calendar/context";
import { timeToMinutes } from "@/lib/time";

export async function loadWeeklyStats(db: DB, userId: string, week: string) {
  const profile = await getProfile(db, userId);
  if (!profile) throw new Error("Profile not found");
  const today = localDate(profile.timezone || "UTC");
  const end = addDays(week, 6);
  const [tasks, goals, progress, checkIns, calendar] = await Promise.all([
    getTasksBetween(db, userId, week, end),
    getGoals(db, userId, ["active", "paused", "completed", "archived"]),
    getProgressSince(db, userId, week),
    db.from("daily_check_ins").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("check_in_date", week).lte("check_in_date", end),
    loadCalendar(db, userId, { tz: profile.timezone || "UTC", from: week, days: 7 }),
  ]);
  const stats = computeWeeklyStats({
    weekStart: week,
    today,
    tasks,
    goals,
    progress: progress.filter((p) => p.logged_for <= end),
    checkInCount: checkIns.count ?? 0,
  });
  if (calendar) {
    const events = calendar.days.flatMap((d) => d.events);
    const busyMinutes = events
      .filter((e) => !e.allDay && e.busy && e.start && e.end)
      .reduce((sum, e) => sum + Math.max(0, (e.end === "24:00" ? 1440 : timeToMinutes(e.end as string)) - timeToMinutes(e.start as string)), 0);
    stats.calendar = { events: events.length, busyHours: Math.round(busyMinutes / 6) / 10 };
  }
  return { stats, profile, today };
}
