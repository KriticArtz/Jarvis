import "server-only";
import { z } from "zod";
import { logTaskProgress, removeTaskProgress } from "@/lib/data/task-progress";
import { addDays, formatTime12 } from "@/lib/time";
import type { Task } from "@/lib/types/domain";
import { describeDate, describeWhen, resolveDate } from "./dates";
import { J, zDateInput, zId, zTime, zTitle } from "./schema";
import { fail, info, ok, type ToolContext, type ToolDefinition } from "./types";

const MAX_TASKS_PER_DAY = 50;
type TaskRow = Pick<Task, "id" | "title" | "task_date" | "scheduled_start" | "duration_minutes" | "status" | "goal_id" | "is_priority">;

/** Load a task only if it belongs to the current user. */
export async function loadOwnTask(ctx: ToolContext, id: string): Promise<TaskRow | null> {
  const { data } = await ctx.db
    .from("tasks")
    .select("id, title, task_date, scheduled_start, duration_minutes, status, goal_id, is_priority")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return (data as TaskRow | null) ?? null;
}

export async function ownsGoal(ctx: ToolContext, goalId: string): Promise<boolean> {
  const { data } = await ctx.db.from("goals").select("id").eq("id", goalId).eq("user_id", ctx.userId).maybeSingle();
  return Boolean(data);
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
const NOT_FOUND = "I couldn't find that task.";

// --- list_tasks ---------------------------------------------------------------

const listTasksInput = z.object({
  from_date: zDateInput.nullable(),
  to_date: zDateInput.nullable(),
  include_completed: z.boolean(),
});

export const listTasks: ToolDefinition<typeof listTasksInput> = {
  name: "list_tasks",
  description:
    "Look up the user's tasks (with ids) for a date range. Use this to find a task that isn't in today's context, e.g. tomorrow's tasks, before changing it.",
  parameters: J.object({
    from_date: J.nullable(J.string("Start date: today, tomorrow or YYYY-MM-DD. Null = today.")),
    to_date: J.nullable(J.string("End date (inclusive). Null = 7 days after from_date.")),
    include_completed: J.boolean("Include completed and skipped tasks."),
  }),
  input: listTasksInput,
  risk: "read",
  runningLabel: () => "Checking your tasks…",
  async execute(ctx, args) {
    const from = resolveDate(args.from_date ?? "today", ctx.today);
    if (!from.ok) return fail("invalid_input", `That start date is ${from.reason}.`);
    const to = resolveDate(args.to_date ?? addDays(from.date, 7), ctx.today);
    if (!to.ok || to.date < from.date) return fail("invalid_input", "That date range isn't valid.");
    let q = ctx.db
      .from("tasks")
      .select("id, title, task_date, scheduled_start, duration_minutes, status, goal_id, is_priority")
      .eq("user_id", ctx.userId)
      .gte("task_date", from.date)
      .lte("task_date", to.date);
    if (!args.include_completed) q = q.eq("status", "pending");
    const { data, error } = await q.order("task_date").order("scheduled_start", { nullsFirst: false }).limit(60);
    if (error) return fail("server_error", "I couldn't load your tasks right now.");
    const tasks = (data ?? []).map((t) => ({ ...t, scheduled_start: hhmm(t.scheduled_start as string | null) }));
    return info(tasks.length ? `Found ${tasks.length} task${tasks.length === 1 ? "" : "s"}.` : "No tasks in that range.", { tasks });
  },
};

// --- create_task --------------------------------------------------------------

const createTaskInput = z.object({
  title: zTitle,
  date: zDateInput,
  start_time: zTime.nullable(),
  duration_minutes: z.number().int().min(5).max(720).nullable(),
  goal_id: zId.nullable(),
  is_priority: z.boolean(),
});

export const createTask: ToolDefinition<typeof createTaskInput> = {
  name: "create_task",
  description: "Add a task to the user's list for a given day, optionally at a time and linked to one of their goals.",
  parameters: J.object({
    title: J.string("Short task title, e.g. \"Workout\""),
    date: J.string("today, tomorrow or YYYY-MM-DD"),
    start_time: J.nullable(J.string("24h HH:MM, or null if no set time")),
    duration_minutes: J.nullable(J.integer("Expected minutes (5–720), or null")),
    goal_id: J.nullable(J.string("Id of the user's goal this task serves, or null")),
    is_priority: J.boolean("Whether this is one of the day's priorities"),
  }),
  input: createTaskInput,
  risk: "direct",
  runningLabel: (a) => `Adding “${a.title}”…`,
  async execute(ctx, args) {
    const date = resolveDate(args.date, ctx.today);
    if (!date.ok) return fail("invalid_input", `I couldn't use that date (${date.reason}).`);
    if (args.goal_id && !(await ownsGoal(ctx, args.goal_id))) return fail("not_found", "I couldn't find that goal.");
    const { count } = await ctx.db.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).eq("task_date", date.date);
    if ((count ?? 0) >= MAX_TASKS_PER_DAY) return fail("limit", "That day already has a lot of tasks — let's trim some first.");
    const { data, error } = await ctx.db
      .from("tasks")
      .insert({
        user_id: ctx.userId,
        title: args.title,
        task_date: date.date,
        scheduled_start: args.start_time,
        duration_minutes: args.duration_minutes,
        goal_id: args.goal_id,
        is_priority: args.is_priority,
      })
      .select("id")
      .single();
    if (error || !data) return fail("server_error", "I couldn't add that task.");
    return ok(`Added “${args.title}” for ${describeWhen(date.date, args.start_time, ctx.today)}.`, { task_id: data.id, date: date.date });
  },
};

// --- complete_task ------------------------------------------------------------

const taskIdInput = z.object({ task_id: zId });

export const completeTask: ToolDefinition<typeof taskIdInput> = {
  name: "complete_task",
  description:
    "Mark one of the user's tasks as done (e.g. \"I finished my workout\"). Progress toward the linked goal is logged automatically.",
  parameters: J.object({ task_id: J.string("Id of the task") }),
  input: taskIdInput,
  risk: "direct",
  runningLabel: () => "Checking it off…",
  async execute(ctx, args) {
    const task = await loadOwnTask(ctx, args.task_id);
    if (!task) return fail("not_found", NOT_FOUND);
    if (task.status === "done") return ok(`“${task.title}” was already done.`, { task_id: task.id });
    const { error } = await ctx.db
      .from("tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", task.id)
      .eq("user_id", ctx.userId);
    if (error) return fail("server_error", `I couldn't mark “${task.title}” done.`);
    await logTaskProgress(ctx.db, ctx.userId, { id: task.id, goal_id: task.goal_id, duration_minutes: task.duration_minutes, task_date: task.task_date });
    return ok(`Marked “${task.title}” done.`, { task_id: task.id, goal_id: task.goal_id });
  },
};

// --- reschedule_task ----------------------------------------------------------

const rescheduleInput = z.object({
  task_id: zId,
  date: zDateInput,
  start_time: z.union([zTime, z.literal("keep"), z.literal("none")]),
});

export const rescheduleTask: ToolDefinition<typeof rescheduleInput> = {
  name: "reschedule_task",
  description:
    "Move one of the user's tasks to another day and/or time — including moving it within today (e.g. \"move my workout to tomorrow\", \"push studying to 8pm\").",
  parameters: J.object({
    task_id: J.string("Id of the task"),
    date: J.string("New date: today, tomorrow or YYYY-MM-DD"),
    start_time: J.string("New 24h HH:MM, \"keep\" to keep the current time, or \"none\" for no set time"),
  }),
  input: rescheduleInput,
  risk: "direct",
  runningLabel: () => "Moving it…",
  async execute(ctx, args) {
    const task = await loadOwnTask(ctx, args.task_id);
    if (!task) return fail("not_found", NOT_FOUND);
    if (task.status === "done") return fail("conflict", `“${task.title}” is already done, so I left it where it is.`);
    const date = resolveDate(args.date, ctx.today);
    if (!date.ok) return fail("invalid_input", `I couldn't use that date (${date.reason}).`);
    if (date.date < ctx.today) return fail("invalid_input", "I can only move tasks to today or later.");
    const time = args.start_time === "keep" ? hhmm(task.scheduled_start) : args.start_time === "none" ? null : args.start_time;
    const { error } = await ctx.db
      .from("tasks")
      .update({ task_date: date.date, scheduled_start: time, status: "pending", completed_at: null })
      .eq("id", task.id)
      .eq("user_id", ctx.userId);
    if (error) return fail("server_error", `I couldn't move “${task.title}”.`);
    return ok(`Moved “${task.title}” to ${describeWhen(date.date, time, ctx.today)}.`, { task_id: task.id, date: date.date, start_time: time });
  },
};

// --- cancel_task (needs confirmation) -------------------------------------------

const cancelInput = z.object({ task_id: zId, mode: z.enum(["skip", "delete"]) });

export const cancelTask: ToolDefinition<typeof cancelInput> = {
  name: "cancel_task",
  description:
    "Cancel one of the user's tasks: \"skip\" marks it skipped (kept in history), \"delete\" removes it. Always requires the user's confirmation — this only proposes it.",
  parameters: J.object({ task_id: J.string("Id of the task"), mode: J.enumOf(["skip", "delete"], "skip = mark skipped; delete = remove entirely") }),
  input: cancelInput,
  risk: "confirm",
  runningLabel: (a) => (a.mode === "delete" ? "Preparing to delete…" : "Preparing to skip…"),
  async describe(ctx, args) {
    const task = await loadOwnTask(ctx, args.task_id);
    if (!task) return null;
    return `${args.mode === "delete" ? "Delete" : "Skip"} “${task.title}” (${describeDate(task.task_date, ctx.today)}${task.scheduled_start ? ` at ${formatTime12(task.scheduled_start)}` : ""})`;
  },
  async execute(ctx, args) {
    const task = await loadOwnTask(ctx, args.task_id);
    if (!task) return fail("not_found", NOT_FOUND);
    await removeTaskProgress(ctx.db, ctx.userId, task.id);
    if (args.mode === "delete") {
      const { error } = await ctx.db.from("tasks").delete().eq("id", task.id).eq("user_id", ctx.userId);
      if (error) return fail("server_error", `I couldn't delete “${task.title}”.`);
      return ok(`Deleted “${task.title}”.`, { task_id: task.id });
    }
    const { error } = await ctx.db.from("tasks").update({ status: "skipped", completed_at: null }).eq("id", task.id).eq("user_id", ctx.userId);
    if (error) return fail("server_error", `I couldn't skip “${task.title}”.`);
    return ok(`Skipped “${task.title}”.`, { task_id: task.id });
  },
};
