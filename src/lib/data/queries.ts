import type {
  Conversation,
  ConversationMessage,
  DailyCheckIn,
  DailyPlan,
  Goal,
  GoalProgressEntry,
  NotificationPreferences,
  Profile,
  RecurringCommitment,
  Task,
  UserMemory,
} from "@/lib/types/domain";
import { type DB, unwrap } from "./db";

export async function getProfile(db: DB, userId: string): Promise<Profile | null> {
  const res = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
  return unwrap(res, "profile") as Profile | null;
}

export async function getCommitments(db: DB, userId: string): Promise<RecurringCommitment[]> {
  const res = await db.from("recurring_commitments").select("*").eq("user_id", userId).order("start_time");
  return unwrap(res, "commitments") as RecurringCommitment[];
}

export async function getGoals(db: DB, userId: string, statuses: Goal["status"][] = ["active"]): Promise<Goal[]> {
  const res = await db
    .from("goals")
    .select("*")
    .eq("user_id", userId)
    .in("status", statuses)
    .order("rank")
    .order("created_at");
  return (unwrap(res, "goals") as Goal[]).map(normalizeGoal);
}

export async function getGoal(db: DB, userId: string, goalId: string): Promise<Goal | null> {
  const res = await db.from("goals").select("*").eq("user_id", userId).eq("id", goalId).maybeSingle();
  const goal = unwrap(res, "goal") as Goal | null;
  return goal ? normalizeGoal(goal) : null;
}

function normalizeGoal(g: Goal): Goal {
  return { ...g, target_value: g.target_value != null ? Number(g.target_value) : null };
}

/** Progress entries on or after `since` (user-local date). */
export async function getProgressSince(db: DB, userId: string, since: string, goalIds?: string[]): Promise<GoalProgressEntry[]> {
  let q = db.from("goal_progress").select("*").eq("user_id", userId).gte("logged_for", since);
  if (goalIds) q = q.in("goal_id", goalIds.length ? goalIds : ["00000000-0000-0000-0000-000000000000"]);
  const res = await q.order("logged_for", { ascending: false });
  return (unwrap(res, "progress") as GoalProgressEntry[]).map((e) => ({ ...e, amount: Number(e.amount) }));
}

export async function getTasksForDate(db: DB, userId: string, date: string): Promise<Task[]> {
  const res = await db
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .eq("task_date", date)
    .order("is_priority", { ascending: false })
    .order("scheduled_start", { ascending: true, nullsFirst: false })
    .order("sort_order");
  return unwrap(res, "tasks") as Task[];
}

export async function getTasksBetween(db: DB, userId: string, start: string, end: string): Promise<Task[]> {
  const res = await db
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .gte("task_date", start)
    .lte("task_date", end)
    .order("task_date");
  return unwrap(res, "tasks") as Task[];
}

export async function getLatestPlan(db: DB, userId: string, date: string): Promise<DailyPlan | null> {
  const res = await db
    .from("daily_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("plan_date", date)
    .neq("status", "discarded")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return unwrap(res, "plan") as DailyPlan | null;
}

export async function getCheckIns(db: DB, userId: string, since: string): Promise<DailyCheckIn[]> {
  const res = await db
    .from("daily_check_ins")
    .select("*")
    .eq("user_id", userId)
    .gte("check_in_date", since)
    .order("check_in_date", { ascending: false });
  return unwrap(res, "check-ins") as DailyCheckIn[];
}

export async function getMemories(db: DB, userId: string, limit = 30): Promise<UserMemory[]> {
  const res = await db
    .from("user_memories")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return unwrap(res, "memories") as UserMemory[];
}

export async function getNotificationPreferences(db: DB, userId: string): Promise<NotificationPreferences | null> {
  const res = await db.from("notification_preferences").select("*").eq("user_id", userId).maybeSingle();
  return unwrap(res, "notification preferences") as NotificationPreferences | null;
}

export async function getConversations(db: DB, userId: string, limit = 20): Promise<Conversation[]> {
  const res = await db
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  return unwrap(res, "conversations") as Conversation[];
}

export async function getConversation(db: DB, userId: string, id: string): Promise<Conversation | null> {
  const res = await db.from("conversations").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  return unwrap(res, "conversation") as Conversation | null;
}

/** Most recent `limit` messages, returned oldest-first. */
export async function getRecentMessages(db: DB, userId: string, conversationId: string, limit = 50): Promise<ConversationMessage[]> {
  const res = await db
    .from("conversation_messages")
    .select("*")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (unwrap(res, "messages") as ConversationMessage[]).reverse();
}

export interface AssistantActivity {
  /** Changes the assistant made in the last day, newest first. */
  recent: { id: string; summary: string | null; created_at: string }[];
  /** Proposals still waiting for the user's OK (not yet expired). */
  pending: { id: string; summary: string | null; conversationId: string | null }[];
}

/** Recent assistant actions for the Today screen (from the assistant_actions log). */
export async function getAssistantActivity(db: DB, userId: string, now: Date = new Date()): Promise<AssistantActivity> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await db
    .from("assistant_actions")
    .select("id, conversation_id, status, summary, created_at, expires_at")
    .eq("user_id", userId)
    .in("status", ["succeeded", "pending_confirmation"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  const rows = (data ?? []) as { id: string; conversation_id: string | null; status: string; summary: string | null; created_at: string; expires_at: string | null }[];
  const nowIso = now.toISOString();
  return {
    recent: rows.filter((r) => r.status === "succeeded" && r.summary).map((r) => ({ id: r.id, summary: r.summary, created_at: r.created_at })),
    pending: rows
      .filter((r) => r.status === "pending_confirmation" && (!r.expires_at || r.expires_at > nowIso))
      .map((r) => ({ id: r.id, summary: r.summary, conversationId: r.conversation_id })),
  };
}
