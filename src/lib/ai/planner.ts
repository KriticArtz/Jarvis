import "server-only";
import { busyEventsForDay } from "@/lib/integrations/calendar/local";
import type { DB } from "@/lib/data/db";
import { getCommitments, getProgressSince } from "@/lib/data/queries";
import { busyBlocks, dayBounds, describeBlocks, freeWindows, totalMinutes, type Block } from "@/lib/planning/availability";
import { rulePlan } from "@/lib/planning/rule-planner";
import { validatePlan } from "@/lib/planning/validate";
import { summarizeGoalProgress } from "@/lib/progress";
import { localMinutesNow, minutesToTime, monthStart, weekStart, addDays } from "@/lib/time";
import type { DailyPlan, PlanItem, PlanProposal } from "@/lib/types/domain";
import { completeJSON } from "./chat";
import { getAI } from "./client";
import { renderContext } from "./context-format";
import { loadAssistantContext } from "./context";
import { assistantSystemPrompt } from "./prompts";

export interface PlanRequest {
  availableStart?: string | null;
  availableEnd?: string | null;
  note?: string | null;
  /**
   * Re-flow the whole day: today's already-timed pending tasks are treated as
   * movable (not as fixed busy blocks), so they can be rescheduled around a new
   * constraint. Used by the assistant's replan action.
   */
  reflow?: boolean;
}

export type PlanResult =
  | { status: "needs_info"; question: string }
  | { status: "ok"; plan: DailyPlan };

interface AIPlanResponse {
  needs_more_info: boolean;
  question: string | null;
  summary: string;
  items: {
    task_id: string | null;
    title: string;
    goal_id: string | null;
    start_time: string | null;
    duration_minutes: number;
    is_priority: boolean;
    rationale: string | null;
  }[];
}

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["needs_more_info", "question", "summary", "items"],
  properties: {
    needs_more_info: { type: "boolean" },
    question: { type: ["string", "null"] },
    summary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["task_id", "title", "goal_id", "start_time", "duration_minutes", "is_priority", "rationale"],
        properties: {
          task_id: { type: ["string", "null"] },
          title: { type: "string" },
          goal_id: { type: ["string", "null"] },
          start_time: { type: ["string", "null"], description: "24h HH:MM local time" },
          duration_minutes: { type: "integer" },
          is_priority: { type: "boolean" },
          rationale: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

/**
 * Propose a plan for the user's current day. Hard constraints (free windows,
 * no overlaps, no past times) are enforced in code after generation, so the
 * AI can never schedule over a commitment.
 */
export async function planDay(db: DB, userId: string, req: PlanRequest): Promise<PlanResult> {
  const { profile, today, goals, todayTasks, context } = await loadAssistantContext(db, userId);
  const tz = profile.timezone || "UTC";
  const [commitments, progress] = await Promise.all([
    getCommitments(db, userId),
    getProgressSince(db, userId, [monthStart(today), weekStart(today), addDays(today, -6)].sort()[0]),
  ]);

  const bounds = dayBounds(
    profile,
    req.availableStart || req.availableEnd ? { start: req.availableStart, end: req.availableEnd } : null,
    localMinutesNow(tz),
  );
  if (!bounds) {
    return {
      status: "needs_info",
      question: "I don't know your waking hours yet. What time window are you free today?",
    };
  }

  const pending = todayTasks.filter((t) => t.status === "pending");
  // Calendar events are fixed constraints: never planned over (read-only).
  const busy = busyBlocks(today, profile, commitments, req.reflow ? [] : pending.filter((t) => t.scheduled_start), busyEventsForDay(context.calendar?.days[0]));
  const windows = freeWindows(bounds.start, bounds.end, busy);
  if (windows.length === 0 || totalMinutes(windows) < 20) {
    return {
      status: "needs_info",
      question:
        "I can't find any free time left today between your commitments. If that's wrong, tell me the hours you're actually free and I'll plan around them.",
    };
  }

  const summaries = new Map(goals.map((g) => [g.id, summarizeGoalProgress(g, progress, today)]));
  const unscheduled = req.reflow ? pending : pending.filter((t) => !t.scheduled_start);
  let items: PlanItem[];
  let summary: string;
  let source: "ai" | "rules" = "ai";
  let question: string | null = null;

  const ai = getAI() ? await askAI() : null;
  if (ai) {
    if (ai.needs_more_info && ai.question) {
      return { status: "needs_info", question: ai.question };
    }
    items = ai.items.map((i) => ({ ...i, rationale: i.rationale || null }));
    summary = ai.summary;
    question = ai.question;
  } else {
    source = "rules";
    items = rulePlan(goals, summaries, unscheduled, windows);
    summary = items.length
      ? `A simple plan based on your goal ranking and free time (${Math.round(totalMinutes(windows) / 6) / 10} hours available).`
      : "Everything looks on track — no extra blocks needed today.";
  }

  const validated = validatePlan(items, windows, new Set(goals.map((g) => g.id)), new Set(unscheduled.map((t) => t.id)));
  const proposal: PlanProposal = { items: validated.items, warnings: validated.warnings, question };

  // Replace any earlier draft for today.
  await db.from("daily_plans").update({ status: "discarded" }).eq("user_id", userId).eq("plan_date", today).eq("status", "draft");
  const { data, error } = await db
    .from("daily_plans")
    .insert({
      user_id: userId,
      plan_date: today,
      status: "draft",
      user_input: [req.availableStart || req.availableEnd ? `Available ${req.availableStart ?? "?"}–${req.availableEnd ?? "?"}` : null, req.note]
        .filter(Boolean)
        .join(". ")
        .slice(0, 2000) || null,
      summary: summary.slice(0, 2000),
      proposal,
      source,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error("Could not save plan");
  return { status: "ok", plan: data as DailyPlan };

  async function askAI(): Promise<AIPlanResponse | null> {
    const windowText = windows.map((w: Block) => `${minutesToTime(w.start)}–${minutesToTime(w.end)}`).join(", ");
    const taskText = unscheduled.length
      ? unscheduled.map((t) => `- id=${t.id} "${t.title}"${t.duration_minutes ? ` (${t.duration_minutes} min)` : ""}`).join("\n")
      : "none";
    const goalText = goals.map((g) => `- id=${g.id} "${g.title}" (rank ${g.rank + 1}, ${g.priority}) progress: ${summaries.get(g.id)?.label}`).join("\n");

    return completeJSON<AIPlanResponse>(
      [
        { role: "system", content: assistantSystemPrompt(context.assistant, "app") },
        { role: "system", content: `# User context\n\n${renderContext(context)}` },
        {
          role: "user",
          content: `Create a realistic plan for the rest of today (${today}).

HARD RULES
- Only schedule inside these free windows (24h local time): ${windowText}
- Busy/committed (never schedule over): ${describeBlocks(busy)}
- Do not exceed ~70% of the free time; leave buffers between items.
- 2 to 5 items. Put the most important first and mark at most 3 as is_priority.
- Use goal ids from the list when an item serves a goal. For existing unscheduled tasks, reuse their task_id and title.
- start_time must be 24h "HH:MM" inside a free window, or null if timing is flexible.
- If you truly lack information to plan, set needs_more_info=true with one short question and no items.

${req.reflow ? "Today's pending tasks — reschedule them to fit the new constraint (reuse their task_id); leave out the least important if they don't fit:" : "Existing unscheduled tasks for today:"}
${taskText}

Goals:
${goalText || "none"}

${req.note ? `What the user said about today: """${req.note.slice(0, 1000)}"""` : ""}

Return a short summary (1-2 sentences, in your accountability style) explaining the plan's logic.`,
        },
      ],
      "daily_plan",
      PLAN_SCHEMA,
      { userId, feature: "plan" },
    );
  }
}
