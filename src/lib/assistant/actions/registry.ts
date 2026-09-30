import "server-only";
import { z } from "zod";
import { errorInfo, logError } from "@/lib/observability/log";
import { checkConfirmation, PROPOSAL_TTL_MINUTES, type ProposalRow } from "./confirmation";
import { createGoal, deleteGoal, getGoalProgress, recordProgress, setGoalStatus, updateGoal } from "./goals";
import { deleteMemory, saveMemory, updateMemory } from "./memories";
import { replanToday } from "./planning";
import { getFitnessSummary, listCalendarEvents } from "./integrations";
import { J, zId } from "./schema";
import { cancelTask, completeTask, createTask, listTasks, rescheduleTask } from "./tasks";
import { fail, ok, type ToolContext, type ToolDefinition, type ToolResult } from "./types";

/**
 * The complete, explicit list of actions the assistant can take. The model
 * cannot call anything else, cannot run SQL, and never supplies a user id.
 */
export const ACTION_TOOLS: ToolDefinition[] = [
  listTasks,
  createTask,
  completeTask,
  rescheduleTask,
  cancelTask,
  createGoal,
  updateGoal,
  setGoalStatus,
  deleteGoal,
  recordProgress,
  getGoalProgress,
  saveMemory,
  updateMemory,
  deleteMemory,
  replanToday,
  listCalendarEvents,
  getFitnessSummary,
] as ToolDefinition[];

const confirmInput = z.object({ confirmation_id: zId });

const CONFIRM_TOOLS = [
  {
    name: "confirm_action",
    description:
      "Carry out a change the user has just approved. Only call this after the user clearly says yes to a pending proposal listed in the context; pass that proposal's id.",
    parameters: J.object({ confirmation_id: J.string("Id of the pending proposal the user approved") }),
  },
  {
    name: "decline_action",
    description: "Drop a pending proposal the user said no to (or changed their mind about).",
    parameters: J.object({ confirmation_id: J.string("Id of the pending proposal") }),
  },
];

const byName = new Map(ACTION_TOOLS.map((t) => [t.name, t]));
export const TOOL_NAMES = [...ACTION_TOOLS.map((t) => t.name), ...CONFIRM_TOOLS.map((t) => t.name)];

/** Tool definitions in the Responses API format. */
export function openAITools() {
  return [
    ...ACTION_TOOLS.map((t) => ({ type: "function" as const, name: t.name, description: t.description, parameters: t.parameters, strict: true })),
    ...CONFIRM_TOOLS.map((t) => ({ type: "function" as const, name: t.name, description: t.description, parameters: t.parameters, strict: true })),
  ];
}

export function isMutating(name: string): boolean {
  const def = byName.get(name);
  return name === "confirm_action" || (def ? def.risk !== "read" : false);
}

export function runningLabel(name: string, rawArgs: string): string {
  if (name === "confirm_action") return "Making the change…";
  if (name === "decline_action") return "Okay, dropping that…";
  const def = byName.get(name);
  if (!def) return "Working on it…";
  try {
    const parsed = def.input.safeParse(JSON.parse(rawArgs));
    return parsed.success ? def.runningLabel(parsed.data) : "Working on it…";
  } catch {
    return "Working on it…";
  }
}

async function logAction(
  ctx: ToolContext,
  tool: string,
  args: unknown,
  result: ToolResult,
  extra: { status?: string; expiresAt?: string } = {},
): Promise<string | null> {
  const status = extra.status ?? (result.status === "succeeded" ? "succeeded" : "failed");
  const { data, error } = await ctx.db
    .from("assistant_actions")
    .insert({
      user_id: ctx.userId,
      conversation_id: ctx.conversationId,
      channel: ctx.channel,
      tool,
      arguments: (args ?? {}) as Record<string, unknown>,
      status,
      summary: result.message.slice(0, 500),
      error_code: result.error ?? null,
      expires_at: extra.expiresAt ?? null,
      resolved_at: status === "pending_confirmation" ? null : new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    logError("assistant", "could not record action", { tool, code: error.code, message: error.message });
    return null;
  }
  return data.id as string;
}

/**
 * Execute one tool call from the model. The user comes from `ctx` (session),
 * never from the arguments. Never throws.
 */
export async function runTool(ctx: ToolContext, name: string, rawArgs: string): Promise<ToolResult> {
  let args: unknown;
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return fail("invalid_input", "I got confused about the details — could you rephrase?");
  }

  try {
    if (name === "confirm_action") return await confirmAction(ctx, args);
    if (name === "decline_action") return await declineAction(ctx, args);

    const def = byName.get(name);
    if (!def) return fail("not_allowed", "I can't do that here.");

    const parsed = def.input.safeParse(args);
    if (!parsed.success) return fail("invalid_input", `I couldn't do that: ${parsed.error.issues[0].message}`);

    if (def.risk === "read") return await def.execute(ctx, parsed.data);

    const needsConfirmation = def.risk === "confirm" || Boolean(def.needsConfirmation?.(parsed.data));
    if (needsConfirmation) return await propose(ctx, def, parsed.data);

    const result = await def.execute(ctx, parsed.data);
    await logAction(ctx, def.name, parsed.data, result);
    return result;
  } catch (err) {
    logError("assistant", "tool failed", { tool: name, ...errorInfo(err) });
    const result = fail("server_error", "Something went wrong on my side, so I didn't make that change.");
    await logAction(ctx, name, args, result).catch(() => null);
    return result;
  }
}

async function propose(ctx: ToolContext, def: ToolDefinition, args: unknown): Promise<ToolResult> {
  let summary: string | null;
  let storedArgs: unknown = args;
  let data: Record<string, unknown> | undefined;

  if (def.propose) {
    const proposal = await def.propose(ctx, args);
    if ("status" in proposal) return proposal; // e.g. needs more information
    ({ summary, storedArgs, data } = proposal);
  } else {
    summary = (await def.describe?.(ctx, args)) ?? null;
    if (summary === null) return fail("not_found", "I couldn't find that.");
  }

  if (!ctx.conversationId) return fail("not_allowed", "I can only make that change from a conversation.");
  const expiresAt = new Date(Date.now() + PROPOSAL_TTL_MINUTES * 60_000).toISOString();
  const pending: ToolResult = { status: "needs_confirmation", message: summary ?? "Confirm this change", data };
  const id = await logAction(ctx, def.name, storedArgs, pending, { status: "pending_confirmation", expiresAt });
  if (!id) return fail("server_error", "I couldn't set that up — please try again.");
  return { ...pending, confirmationId: id };
}

const CONFIRM_ERRORS = {
  not_found: "I couldn't find that pending change.",
  already_resolved: "That change was already handled.",
  expired: "That proposal expired — want me to set it up again?",
  same_turn: "I need your OK first.",
} as const;

async function confirmAction(ctx: ToolContext, args: unknown): Promise<ToolResult> {
  const parsed = confirmInput.safeParse(args);
  if (!parsed.success) return fail("invalid_input", CONFIRM_ERRORS.not_found);
  const { data: row } = await ctx.db
    .from("assistant_actions")
    .select("id, user_id, conversation_id, tool, arguments, status, created_at, expires_at")
    .eq("id", parsed.data.confirmation_id)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  const check = checkConfirmation(row as ProposalRow | null, ctx);
  if (check !== "ok") {
    if (check === "expired" && row) {
      await ctx.db.from("assistant_actions").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("id", row.id).eq("user_id", ctx.userId);
    }
    return fail(check === "same_turn" ? "not_allowed" : check === "expired" ? "expired" : "not_found", CONFIRM_ERRORS[check]);
  }

  const def = byName.get(String(row!.tool));
  if (!def) return fail("not_allowed", "I can't do that here.");
  const stored = (def.storedInput ?? def.input).safeParse(row!.arguments);
  if (!stored.success) return fail("invalid_input", "That proposal is no longer valid.");

  // Claim the proposal first so it can only ever run once.
  const { data: claimed } = await ctx.db
    .from("assistant_actions")
    .update({ status: "succeeded", resolved_at: new Date().toISOString() })
    .eq("id", row!.id)
    .eq("user_id", ctx.userId)
    .eq("status", "pending_confirmation")
    .select("id");
  if (!claimed?.length) return fail("conflict", CONFIRM_ERRORS.already_resolved);

  const result = await def.execute(ctx, stored.data);
  await ctx.db
    .from("assistant_actions")
    .update({ status: result.status === "succeeded" ? "succeeded" : "failed", summary: result.message.slice(0, 500), error_code: result.error ?? null })
    .eq("id", row!.id)
    .eq("user_id", ctx.userId);
  return result;
}

async function declineAction(ctx: ToolContext, args: unknown): Promise<ToolResult> {
  const parsed = confirmInput.safeParse(args);
  if (!parsed.success) return fail("invalid_input", CONFIRM_ERRORS.not_found);
  const { data } = await ctx.db
    .from("assistant_actions")
    .update({ status: "cancelled", resolved_at: new Date().toISOString() })
    .eq("id", parsed.data.confirmation_id)
    .eq("user_id", ctx.userId)
    .eq("status", "pending_confirmation")
    .select("id");
  if (!data?.length) return fail("not_found", CONFIRM_ERRORS.not_found);
  return ok("Okay — I won't make that change.");
}

export interface PendingProposal {
  id: string;
  summary: string;
  created_at: string;
}

/** Unexpired proposals awaiting the user's answer in this conversation. */
export async function pendingProposals(ctx: Pick<ToolContext, "db" | "userId" | "conversationId">): Promise<PendingProposal[]> {
  if (!ctx.conversationId) return [];
  const { data } = await ctx.db
    .from("assistant_actions")
    .select("id, summary, created_at")
    .eq("user_id", ctx.userId)
    .eq("conversation_id", ctx.conversationId)
    .eq("status", "pending_confirmation")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(5);
  return (data ?? []) as PendingProposal[];
}
