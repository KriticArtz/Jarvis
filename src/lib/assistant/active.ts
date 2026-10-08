import type { DB } from "@/lib/data/db";
import { localDate } from "@/lib/time";

/**
 * "Today's active conversation": the user's most recently updated in-app
 * conversation, if it was last updated today in the user's time zone.
 *
 * Opening the Assistant (from the nav or from Today's Ask / Move it) resumes
 * it, so a day reads as one continuous thread. Starting fresh is always an
 * explicit "New conversation". SMS and email threads are never resumed here.
 * A conversation from yesterday (or earlier) is never resumed: a new day
 * opens on the contextual opening instead.
 */
export function isActiveToday(updatedAt: string, timezone: string, now: Date = new Date()): boolean {
  return localDate(timezone, new Date(updatedAt)) === localDate(timezone, now);
}

export async function activeConversationToday(db: DB, userId: string, timezone: string, now: Date = new Date()): Promise<{ id: string } | null> {
  const { data } = await db
    .from("conversations")
    .select("id, updated_at")
    .eq("user_id", userId)
    .eq("channel", "app")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || !isActiveToday(String(data.updated_at), timezone, now)) return null;
  return { id: String(data.id) };
}

/** Where the Assistant opens: resume today's conversation unless a fresh one was asked for. */
export function assistantHref(params: { prompt?: string | null; taskId?: string | null; fresh?: boolean } = {}): string {
  const q = new URLSearchParams();
  if (params.fresh) q.set("new", "1");
  if (params.prompt) q.set("q", params.prompt);
  if (params.taskId) q.set("task", params.taskId);
  const s = q.toString();
  return s ? `/assistant?${s}` : "/assistant";
}
