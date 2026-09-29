"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { summarizeWeek } from "@/lib/ai/review";
import { loadWeeklyStats } from "@/lib/review/load";
import { isoDate } from "@/lib/validation/schemas";
import { weekStart } from "@/lib/time";
import { GENERIC_ERROR, NOT_SIGNED_IN, type ActionResult } from "./result";

export async function generateWeeklyReview(week: string): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (!isoDate.safeParse(week).success || weekStart(week) !== week) return GENERIC_ERROR;

  const { stats, profile } = await loadWeeklyStats(session.supabase, session.userId, week);
  const { summary, source } = await summarizeWeek(stats, profile.accountability_style, profile.display_name, session.userId);
  const { error } = await session.supabase
    .from("weekly_reviews")
    .upsert({ user_id: session.userId, week_start: week, stats, summary, source }, { onConflict: "user_id,week_start" });
  if (error) return GENERIC_ERROR;
  revalidatePath("/review");
  return { ok: true };
}
