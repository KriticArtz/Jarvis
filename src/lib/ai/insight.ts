import "server-only";
import type { DB } from "@/lib/data/db";
import { completeReply } from "./chat";
import { getAI } from "./client";
import { renderContext } from "./context-format";
import type { AssistantContext } from "./context-types";
import { loadAssistantContext } from "./context";
import { assistantSystemPrompt } from "./prompts";

/** Deterministic insight from stored data (used without AI). */
export function ruleInsight(ctx: AssistantContext): string {
  const pending = ctx.today.tasks.filter((t) => t.status === "pending");
  const behind = ctx.goals.filter((g) => g.pace === "behind");
  if (ctx.goals.length === 0) return "Add your first goal so I can start tailoring your days to it.";
  if (ctx.today.tasks.length === 0) {
    return behind.length
      ? `Nothing is planned yet today, and ${behind[0].title} is behind pace (${behind[0].progress}). A quick plan would help.`
      : "Nothing is planned yet today. Take two minutes to plan your day.";
  }
  if (pending.length === 0) return "Everything planned for today is checked off. Nice work.";
  const free = ctx.schedule.freeMinutesRemainingToday;
  const needed = pending.reduce((s, t) => s + (t.durationMinutes ?? 30), 0);
  if (free != null && needed > free) {
    return `You have about ${free} minutes of free time left but ${needed} minutes of tasks. Pick what matters most and move the rest.`;
  }
  if (behind.length) return `${behind[0].title} is behind pace (${behind[0].progress}). Consider doing it first.`;
  return `${pending.length} task${pending.length === 1 ? "" : "s"} left today. Start with ${pending[0].title}.`;
}

/**
 * Today's short dashboard insight, cached per user per day in daily_insights.
 */
export async function getOrCreateInsight(db: DB, userId: string, opts: { refresh?: boolean } = {}) {
  const { today, context, profile } = await loadAssistantContext(db, userId);

  if (!opts.refresh) {
    const { data } = await db
      .from("daily_insights")
      .select("content, source")
      .eq("user_id", userId)
      .eq("insight_date", today)
      .maybeSingle();
    if (data) return data as { content: string; source: "ai" | "rules" };
  }

  let content: string | null = null;
  let source: "ai" | "rules" = "rules";
  if (getAI()) {
    content = await completeReply(
      [
        { role: "system", content: assistantSystemPrompt(profile.accountability_style, "app") },
        { role: "system", content: `# User context\n\n${renderContext(context)}` },
        {
          role: "user",
          content:
            "Give me one short, specific insight for the rest of today (max 2 sentences, no greeting, no lists). Base it only on my schedule, tasks and goal progress above — e.g. what to do first and why, a conflict to watch for, or a goal that's slipping.",
        },
      ],
      300,
    );
    if (content) source = "ai";
  }
  if (!content) content = ruleInsight(context);

  await db
    .from("daily_insights")
    .upsert({ user_id: userId, insight_date: today, content: content.slice(0, 1000), source }, { onConflict: "user_id,insight_date" });
  return { content, source };
}
