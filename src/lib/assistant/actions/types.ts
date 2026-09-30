import type { z } from "zod";
import type { DB } from "@/lib/data/db";
import type { AssistantChannel } from "@/lib/ai/prompts";

/**
 * Server-side context for executing assistant tools. The user id comes from
 * the authenticated session (app) or the verified SMS sender (SMS) — NEVER
 * from the model. `db` may be a user-session client (RLS applies) or the
 * service-role client (SMS); every query also filters by `userId`.
 */
export interface ToolContext {
  db: DB;
  userId: string;
  timezone: string;
  /** User-local date (YYYY-MM-DD) */
  today: string;
  channel: AssistantChannel;
  conversationId: string | null;
  /** When the user's current message was stored. Confirmations must predate a later message. */
  turnStartedAt: string;
}

export type ToolStatus = "succeeded" | "failed" | "needs_confirmation" | "info";

export interface ToolResult {
  status: ToolStatus;
  /** Short, user-facing summary (shown in the chat as the action status). */
  message: string;
  /** Machine-readable failure reason for the model (never raw DB errors). */
  error?: "not_found" | "invalid_input" | "not_allowed" | "conflict" | "expired" | "limit" | "server_error";
  /** For needs_confirmation: the proposal the user must approve. */
  confirmationId?: string;
  data?: Record<string, unknown>;
}

export type ToolRisk = "read" | "direct" | "confirm";

export interface ToolDefinition<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  /** Strict JSON schema sent to OpenAI (hand-written to match `input`). */
  parameters: Record<string, unknown>;
  /** Authoritative validation, always applied server-side. */
  input: S;
  /**
   * read: no changes. direct: executes immediately. confirm: stores a
   * proposal and needs a later confirm_action. `needsConfirmation` can refine
   * this per call (e.g. only major goal edits).
   */
  risk: ToolRisk;
  needsConfirmation?: (args: z.infer<S>) => boolean;
  /** Label while running, e.g. "Moving “Workout”…". */
  runningLabel: (args: z.infer<S>) => string;
  /**
   * For confirm-risk tools: describe the change for the proposal ("Delete
   * “Workout”"). Returns null if the target doesn't exist (→ not_found).
   */
  describe?: (ctx: ToolContext, args: z.infer<S>) => Promise<string | null>;
  /**
   * Optional custom proposal step (e.g. build a plan first). Returns the
   * summary and the arguments that `execute` will receive on confirmation,
   * or a ToolResult to return immediately (e.g. needs more information).
   */
  propose?: (ctx: ToolContext, args: z.infer<S>) => Promise<{ summary: string; storedArgs: Record<string, unknown>; data?: Record<string, unknown> } | ToolResult>;
  /** Validates stored proposal arguments on confirmation (defaults to `input`). */
  storedInput?: z.ZodType;
  /** Executes the change. For proposals built by `propose`, receives `storedArgs`. */
  execute: (ctx: ToolContext, args: z.infer<S>) => Promise<ToolResult>;
}

export const ok = (message: string, data?: Record<string, unknown>): ToolResult => ({ status: "succeeded", message, data });
export const fail = (error: NonNullable<ToolResult["error"]>, message: string): ToolResult => ({ status: "failed", error, message });
export const info = (message: string, data?: Record<string, unknown>): ToolResult => ({ status: "info", message, data });
