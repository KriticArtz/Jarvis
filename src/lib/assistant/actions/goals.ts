import "server-only";
import { z } from "zod";
import { getProgressSince } from "@/lib/data/queries";
import { describeTarget, formatAmount, summarizeGoalProgress } from "@/lib/progress";
import { addDays, monthStart, weekStart } from "@/lib/time";
import type { Goal } from "@/lib/types/domain";
import { goalSchema } from "@/lib/validation/schemas";
import { describeDate, resolveDate } from "./dates";
import { J, zDateInput, zId, zNullableText } from "./schema";
import { fail, info, ok, type ToolContext, type ToolDefinition } from "./types";

const MAX_ACTIVE_GOALS = 50;
const NOT_FOUND = "I couldn't find that goal.";

export async function loadOwnGoal(ctx: ToolContext, id: string): Promise<Goal | null> {
  const { data } = await ctx.db.from("goals").select("*").eq("id", id).eq("user_id", ctx.userId).maybeSingle();
  return data ? ({ ...data, target_value: data.target_value != null ? Number(data.target_value) : null } as Goal) : null;
}

async function progressLabel(ctx: ToolContext, goal: Goal): Promise<string> {
  const since = [monthStart(ctx.today), weekStart(ctx.today), addDays(ctx.today, -6)].sort()[0];
  const entries = await getProgressSince(ctx.db, ctx.userId, goal.goal_type === "one_time" ? "1970-01-01" : since, [goal.id]);
  return summarizeGoalProgress(goal, entries, ctx.today).label;
}

// --- create_goal ----------------------------------------------------------------

const createGoalInput = z.object({
  title: z.string().trim().min(1).max(120),
  description: zNullableText(1000),
  category: z.string().trim().min(1).max(40),
  goal_type: z.enum(["recurring", "one_time"]),
  target_value: z.number().positive().max(1_000_000).nullable(),
  target_unit: z.string().trim().max(24).nullable(),
  period: z.enum(["day", "week", "month"]).nullable(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  priority: z.enum(["high", "medium", "low"]),
});

export const createGoal: ToolDefinition<typeof createGoalInput> = {
  name: "create_goal",
  description:
    "Create a new goal for the user (e.g. \"I want to start working out three times a week\" → recurring, 3 times per week). Recurring goals need a period; one-time goals may have a due date.",
  parameters: J.object({
    title: J.string("Short goal title, e.g. \"Work out\""),
    description: J.nullable(J.string("Why it matters / notes, or null")),
    category: J.string("One word, e.g. fitness, school, business, money, health, personal"),
    goal_type: J.enumOf(["recurring", "one_time"], "recurring = ongoing habit; one_time = finish once"),
    target_value: J.nullable(J.number("Target amount, e.g. 3, or null")),
    target_unit: J.nullable(J.string("times | minutes | hours | dollars | pages | other short unit, or null")),
    period: J.nullable(J.enumOf(["day", "week", "month"], "Required for recurring goals; null for one-time")),
    due_date: J.nullable(J.string("YYYY-MM-DD for one-time goals, or null")),
    priority: J.enumOf(["high", "medium", "low"], "Importance"),
  }),
  input: createGoalInput,
  risk: "direct",
  runningLabel: (a) => `Creating “${a.title}”…`,
  async execute(ctx, args) {
    const parsed = goalSchema.safeParse(args);
    if (!parsed.success) return fail("invalid_input", parsed.error.issues[0].message);
    const { data: existing } = await ctx.db.from("goals").select("title, status, rank").eq("user_id", ctx.userId).neq("status", "archived");
    const rows = existing ?? [];
    if (rows.some((g) => String(g.title).toLowerCase() === parsed.data.title.toLowerCase())) {
      return fail("conflict", `You already have a goal called “${parsed.data.title}”.`);
    }
    if (rows.filter((g) => g.status === "active").length >= MAX_ACTIVE_GOALS) return fail("limit", "You have a lot of active goals — let's pause or finish some first.");
    const rank = rows.reduce((m, g) => Math.max(m, Number(g.rank ?? 0)), -1) + 1;
    const { data, error } = await ctx.db.from("goals").insert({ ...parsed.data, user_id: ctx.userId, rank }).select("*").single();
    if (error || !data) return fail("server_error", "I couldn't create that goal.");
    const target = describeTarget(data as Goal);
    return ok(`Created your goal “${parsed.data.title}”${target ? ` (${target})` : ""}.`, { goal_id: data.id });
  },
};

// --- update_goal (major changes need confirmation) --------------------------------

const updateGoalInput = z
  .object({
    goal_id: zId,
    title: z.string().trim().min(1).max(120).nullable(),
    description: zNullableText(1000),
    category: z.string().trim().min(1).max(40).nullable(),
    priority: z.enum(["high", "medium", "low"]).nullable(),
    target_value: z.number().positive().max(1_000_000).nullable(),
    target_unit: z.string().trim().max(24).nullable(),
    period: z.enum(["day", "week", "month"]).nullable(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  })
  .refine((v) => Object.entries(v).some(([k, val]) => k !== "goal_id" && val !== null), { message: "Nothing to change." });

type UpdateGoalArgs = z.infer<typeof updateGoalInput>;
const MAJOR_FIELDS = ["target_value", "target_unit", "period", "due_date"] as const;

/** Changing what "done" means for a goal is a major change. */
export function isMajorGoalChange(args: UpdateGoalArgs): boolean {
  return MAJOR_FIELDS.some((f) => args[f] !== null);
}

function mergeGoal(goal: Goal, args: UpdateGoalArgs) {
  return {
    title: args.title ?? goal.title,
    description: args.description ?? goal.description,
    category: args.category ?? goal.category,
    goal_type: goal.goal_type,
    target_value: args.target_value ?? goal.target_value,
    target_unit: args.target_unit ?? goal.target_unit,
    period: args.period ?? goal.period,
    due_date: args.due_date ?? goal.due_date,
    priority: args.priority ?? goal.priority,
  };
}

export const updateGoal: ToolDefinition<typeof updateGoalInput> = {
  name: "update_goal",
  description:
    "Change one of the user's goals. Pass null for anything that should stay the same. Changes to the target, unit, period or due date need the user's confirmation (this then only proposes them); renaming or changing priority happens immediately.",
  parameters: J.object({
    goal_id: J.string("Id of the goal"),
    title: J.nullable(J.string("New title, or null")),
    description: J.nullable(J.string("New notes, or null")),
    category: J.nullable(J.string("New category, or null")),
    priority: J.nullable(J.enumOf(["high", "medium", "low"], "New priority, or null")),
    target_value: J.nullable(J.number("New target amount, or null")),
    target_unit: J.nullable(J.string("New unit, or null")),
    period: J.nullable(J.enumOf(["day", "week", "month"], "New period (recurring goals), or null")),
    due_date: J.nullable(J.string("New due date YYYY-MM-DD (one-time goals), or null")),
  }),
  input: updateGoalInput,
  risk: "direct",
  needsConfirmation: isMajorGoalChange,
  runningLabel: () => "Updating your goal…",
  async describe(ctx, args) {
    const goal = await loadOwnGoal(ctx, args.goal_id);
    if (!goal) return null;
    const next = describeTarget({ ...goal, ...mergeGoal(goal, args) });
    return `Change “${goal.title}” from ${describeTarget(goal) || "no target"} to ${next || "no target"}`;
  },
  async execute(ctx, args) {
    const goal = await loadOwnGoal(ctx, args.goal_id);
    if (!goal) return fail("not_found", NOT_FOUND);
    const parsed = goalSchema.safeParse(mergeGoal(goal, args));
    if (!parsed.success) return fail("invalid_input", parsed.error.issues[0].message);
    const { error } = await ctx.db.from("goals").update(parsed.data).eq("id", goal.id).eq("user_id", ctx.userId);
    if (error) return fail("server_error", `I couldn't update “${goal.title}”.`);
    const target = describeTarget({ ...goal, ...parsed.data } as Goal);
    return ok(`Updated “${parsed.data.title}”${target ? ` (${target})` : ""}.`, { goal_id: goal.id });
  },
};

// --- set_goal_status ---------------------------------------------------------------

const statusInput = z.object({ goal_id: zId, status: z.enum(["active", "paused", "completed"]) });

export const setGoalStatus: ToolDefinition<typeof statusInput> = {
  name: "set_goal_status",
  description: "Pause, resume (active) or mark complete one of the user's goals.",
  parameters: J.object({ goal_id: J.string("Id of the goal"), status: J.enumOf(["active", "paused", "completed"], "active = resume") }),
  input: statusInput,
  risk: "direct",
  runningLabel: (a) => (a.status === "paused" ? "Pausing…" : a.status === "completed" ? "Completing…" : "Resuming…"),
  async execute(ctx, args) {
    const goal = await loadOwnGoal(ctx, args.goal_id);
    if (!goal) return fail("not_found", NOT_FOUND);
    const { error } = await ctx.db
      .from("goals")
      .update({ status: args.status, completed_at: args.status === "completed" ? new Date().toISOString() : null })
      .eq("id", goal.id)
      .eq("user_id", ctx.userId);
    if (error) return fail("server_error", `I couldn't update “${goal.title}”.`);
    const verb = { active: "Resumed", paused: "Paused", completed: "Marked complete:" }[args.status];
    return ok(`${verb} “${goal.title}”.`, { goal_id: goal.id, status: args.status });
  },
};

// --- delete_goal (needs confirmation) -------------------------------------------------

const goalIdInput = z.object({ goal_id: zId });

export const deleteGoal: ToolDefinition<typeof goalIdInput> = {
  name: "delete_goal",
  description:
    "Permanently delete one of the user's goals and its progress history (linked tasks are kept). Always requires the user's confirmation — this only proposes it. Suggest pausing instead if they might come back to it.",
  parameters: J.object({ goal_id: J.string("Id of the goal") }),
  input: goalIdInput,
  risk: "confirm",
  runningLabel: () => "Preparing to delete…",
  async describe(ctx, args) {
    const goal = await loadOwnGoal(ctx, args.goal_id);
    return goal ? `Delete the goal “${goal.title}” and its progress history` : null;
  },
  async execute(ctx, args) {
    const goal = await loadOwnGoal(ctx, args.goal_id);
    if (!goal) return fail("not_found", NOT_FOUND);
    const { error } = await ctx.db.from("goals").delete().eq("id", goal.id).eq("user_id", ctx.userId);
    if (error) return fail("server_error", `I couldn't delete “${goal.title}”.`);
    return ok(`Deleted the goal “${goal.title}”.`, { goal_id: goal.id });
  },
};

// --- record_progress ------------------------------------------------------------------

const progressInput = z.object({
  goal_id: zId,
  amount: z.number().positive().max(100_000),
  note: zNullableText(500),
  date: zDateInput.nullable(),
});

export const recordProgress: ToolDefinition<typeof progressInput> = {
  name: "record_progress",
  description:
    "Log progress toward one of the user's goals, in the goal's unit (e.g. \"I studied for 45 minutes\" → 45 on a minutes goal, 0.75 on an hours goal; \"saved $50\" → 50). Don't use this for a task you're also completing — completing a linked task logs progress already.",
  parameters: J.object({
    goal_id: J.string("Id of the goal"),
    amount: J.number("Amount in the goal's unit"),
    note: J.nullable(J.string("Short note, or null")),
    date: J.nullable(J.string("Day it happened: today, yesterday or YYYY-MM-DD. Null = today.")),
  }),
  input: progressInput,
  risk: "direct",
  runningLabel: () => "Logging your progress…",
  async execute(ctx, args) {
    const goal = await loadOwnGoal(ctx, args.goal_id);
    if (!goal) return fail("not_found", NOT_FOUND);
    if (goal.status === "archived") return fail("conflict", `“${goal.title}” is archived.`);
    const date = resolveDate(args.date ?? "today", ctx.today);
    if (!date.ok || date.date > ctx.today) return fail("invalid_input", "Progress can only be logged for today or earlier.");
    const { error } = await ctx.db.from("goal_progress").insert({
      user_id: ctx.userId,
      goal_id: goal.id,
      amount: args.amount,
      note: args.note,
      logged_for: date.date,
      source: "assistant",
    });
    if (error) return fail("server_error", `I couldn't log progress for “${goal.title}”.`);
    const label = await progressLabel(ctx, goal);
    const when = date.date === ctx.today ? "" : ` for ${describeDate(date.date, ctx.today)}`;
    return ok(`Logged ${formatAmount(args.amount, goal.target_unit ?? "times")} toward “${goal.title}”${when} — now ${label}.`, { goal_id: goal.id, progress: label });
  },
};

// --- get_goal_progress (read) ----------------------------------------------------------

export const getGoalProgress: ToolDefinition<typeof goalIdInput> = {
  name: "get_goal_progress",
  description: "Get detailed progress for one of the user's goals: current period status, totals and recent entries.",
  parameters: J.object({ goal_id: J.string("Id of the goal") }),
  input: goalIdInput,
  risk: "read",
  runningLabel: () => "Checking your progress…",
  async execute(ctx, args) {
    const goal = await loadOwnGoal(ctx, args.goal_id);
    if (!goal) return fail("not_found", NOT_FOUND);
    const entries = await getProgressSince(ctx.db, ctx.userId, "1970-01-01", [goal.id]);
    const summary = summarizeGoalProgress(goal, entries, ctx.today);
    const total = entries.reduce((s, e) => s + Number(e.amount), 0);
    return info(`${goal.title}: ${summary.label}.`, {
      goal: { title: goal.title, status: goal.status, target: describeTarget(goal) || null, unit: goal.target_unit },
      current_period: { label: summary.label, pace: summary.pace },
      all_time_total: Math.round(total * 100) / 100,
      entries_logged: entries.length,
      recent: entries.slice(0, 10).map((e) => ({ date: e.logged_for, amount: Number(e.amount), note: e.note })),
    });
  },
};
