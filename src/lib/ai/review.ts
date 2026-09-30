import "server-only";
import type { WeeklyStats } from "@/lib/review/stats";
import { ruleBasedSummary } from "@/lib/review/stats";
import type { AssistantPersona } from "@/lib/personalization";
import { completeReply } from "./chat";
import { getAI } from "./client";
import { assistantSystemPrompt } from "./prompts";

/**
 * Generate the weekly review narrative from computed stats only. The model
 * is given the numbers as JSON and told not to introduce any others.
 */
export async function summarizeWeek(
  stats: WeeklyStats,
  persona: AssistantPersona,
  name: string | null,
  userId: string,
): Promise<{ summary: string; source: "ai" | "rules" }> {
  if (!stats.hasData || !getAI()) return { summary: ruleBasedSummary(stats), source: "rules" };

  const summary = await completeReply(
    [
      { role: "system", content: assistantSystemPrompt(persona, "app") },
      {
        role: "user",
        content: `Write ${name ? `${name}'s` : "my"} weekly review from these computed statistics (JSON). Rules:
- Use ONLY numbers that appear in the JSON. Do not estimate, extrapolate or invent any figure, event or reason.
- "missed" = planned tasks left undone on a past day; "open" = still pending today or later in the week.
- consistency is a 0–1 ratio (show as a percentage). timeOfDay shows planned vs completed tasks by when they were scheduled.
- If the week is still in progress (throughDate before weekEnd), say so.
- If "calendar" is present, it summarizes their calendar that week (events and busy hours); you may mention how busy the week was. Don't invent meetings.
- Structure: 1) headline result in one sentence, 2) what went well, 3) what slipped, 4) one or two concrete recommendations for next week.
- Max ~150 words, plain text, short paragraphs.

${JSON.stringify(stats)}`,
      },
    ],
    { userId, feature: "weekly_review" },
    700,
  );
  return summary ? { summary, source: "ai" } : { summary: ruleBasedSummary(stats), source: "rules" };
}
