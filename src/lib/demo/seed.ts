import "server-only";
import type { DB } from "@/lib/data/db";
import { localDate, localMinutesNow } from "@/lib/time";
import { buildDemoData, DEMO_COMMITMENTS, DEMO_GOALS, DEMO_MEMORIES, DEMO_PROFILE } from "./sample-data";

/** Per-session AI limits for public demo sessions (cost/abuse protection). */
export const DEMO_LIMITS = { chatMessages: 40, plans: 15 };

/** Tables cleared on reset. Deleting goals cascades goal_progress; conversations cascade messages. */
const USER_TABLES = [
  "tasks",
  "daily_plans",
  "goal_progress",
  "goals",
  "recurring_commitments",
  "daily_check_ins",
  "daily_insights",
  "weekly_reviews",
  "conversations",
  "user_memories",
] as const;

async function check<T extends { error: { message: string } | null }>(p: PromiseLike<T>, what: string): Promise<T> {
  const res = await p;
  if (res.error) throw new Error(`demo seed: ${what}: ${res.error.message}`);
  return res;
}

/**
 * Fill a demo (anonymous) user's account with sample data. Runs with the
 * demo user's own session, so Row Level Security confines every write to
 * that user's rows.
 */
export async function seedDemoAccount(db: DB, userId: string, opts: { name: string; timezone: string }) {
  const today = localDate(opts.timezone);
  const data = buildDemoData(today, localMinutesNow(opts.timezone));

  await check(
    db
      .from("profiles")
      .update({
        ...DEMO_PROFILE,
        display_name: opts.name,
        timezone: opts.timezone,
        onboarding_step: 6,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq("id", userId),
    "profile",
  );

  await check(db.from("recurring_commitments").insert(DEMO_COMMITMENTS.map((c) => ({ ...c, user_id: userId }))), "commitments");

  const { data: goals } = await check(
    db
      .from("goals")
      .insert(DEMO_GOALS.map((g) => ({ ...Object.fromEntries(Object.entries(g).filter(([k]) => k !== "key")), user_id: userId })))
      .select("id, title"),
    "goals",
  );
  const idFor = new Map(DEMO_GOALS.map((g) => [g.key, (goals ?? []).find((row) => row.title === g.title)?.id as string]));

  await check(
    db.from("tasks").insert(
      data.tasks.map((t, i) => ({
        user_id: userId,
        goal_id: t.goal ? idFor.get(t.goal) : null,
        title: t.title,
        task_date: t.task_date,
        scheduled_start: t.scheduled_start,
        duration_minutes: t.duration_minutes,
        is_priority: t.is_priority,
        status: t.status,
        sort_order: i,
        completed_at: t.status === "done" ? new Date().toISOString() : null,
      })),
    ),
    "tasks",
  );

  await check(
    db.from("goal_progress").insert(
      data.progress.map((p) => ({
        user_id: userId,
        goal_id: idFor.get(p.goal),
        amount: p.amount,
        logged_for: p.logged_for,
        source: p.source,
        note: p.note,
      })),
    ),
    "progress",
  );

  await check(db.from("daily_check_ins").insert({ ...data.checkIn, user_id: userId, channel: "app" }), "check-in");
  await check(db.from("user_memories").insert(DEMO_MEMORIES.map((content) => ({ user_id: userId, content, kind: "preference", source: "user" }))), "memories");
}

/** Remove everything the demo user created or changed, then seed again. */
export async function resetDemoAccount(db: DB, userId: string, opts: { name: string; timezone: string }) {
  for (const table of USER_TABLES) {
    await check(db.from(table).delete().eq("user_id", userId), `clear ${table}`);
  }
  await seedDemoAccount(db, userId, opts);
}
