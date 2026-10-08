import { sanitizeCard, type ActionCard } from "./cards";

/**
 * Chat stream protocol (newline-delimited JSON), shared by the chat API route
 * and the chat UI:
 *   {"t":"text","v":"…"}                                   reply text delta
 *   {"t":"action","id":"…","status":"running|succeeded|failed|needs_confirmation|info","label":"…",
 *    "confirmationId"?:"…","card"?:{…},"error"?:"…"}
 *
 * `confirmationId` (needs_confirmation only) is the stored proposal the user
 * can approve or decline from the chat. It is not a secret: confirming still
 * goes through the server's confirmation rules for the signed-in user.
 * `card` (optional, added in phase 4B) is the structured result — or, for a
 * proposal, the change awaiting approval — validated against the whitelisted
 * card schema on both ends. `error` is the failure code of a failed action.
 * Both are optional: a client that ignores them still shows the label.
 * `resolves` (optional, phase 4D) names the proposal a successful
 * confirm_action / decline_action answered when the user replied in words
 * ("yes", "no"), so the chat can retire that proposal's buttons in place —
 * exactly as answering with the buttons does.
 */
export type ActionStatus = "running" | "succeeded" | "failed" | "needs_confirmation" | "info";

export const ACTION_ERRORS = ["not_found", "invalid_input", "not_allowed", "conflict", "expired", "limit", "server_error", "partial_failure"] as const;
export type ActionError = (typeof ACTION_ERRORS)[number];
export const asActionError = (v: unknown): ActionError | undefined => (ACTION_ERRORS as readonly unknown[]).includes(v) ? (v as ActionError) : undefined;

export interface ChatAction {
  id: string;
  /** "declined" only exists in the chat (a proposal the user said no to); it is never streamed. */
  status: ActionStatus | "declined";
  label: string;
  /** The pending proposal behind a needs_confirmation action. */
  confirmationId?: string;
  card?: ActionCard;
  error?: ActionError;
}

export type StreamEvent =
  | { t: "text"; v: string }
  | { t: "action"; id: string; status: ActionStatus; label: string; confirmationId?: string; card?: unknown; error?: unknown; resolves?: unknown };

export interface Resolution {
  confirmationId: string;
  decision: "confirm" | "decline";
}

export function asResolution(v: unknown): Resolution | undefined {
  const r = v as Partial<Resolution> | null;
  if (!r || typeof r !== "object" || typeof r.confirmationId !== "string" || !/^[0-9a-f-]{36}$/i.test(r.confirmationId)) return undefined;
  return r.decision === "confirm" || r.decision === "decline" ? { confirmationId: r.confirmationId, decision: r.decision } : undefined;
}

/** The open proposal with this id, in any message. */
export function findProposal(messages: { actions?: ChatAction[] }[], confirmationId: string): ChatAction | undefined {
  for (const m of messages) {
    const a = m.actions?.find((x) => x.status === "needs_confirmation" && x.confirmationId === confirmationId);
    if (a) return a;
  }
  return undefined;
}

/** Retire answered proposals from a message (their outcome lives in the reply that answered them). */
export function withoutProposals<M extends { actions?: ChatAction[] }>(message: M, confirmationIds: ReadonlySet<string>): M {
  if (!confirmationIds.size || !message.actions?.some((a) => a.confirmationId && confirmationIds.has(a.confirmationId))) return message;
  return { ...message, actions: message.actions.filter((a) => !(a.status === "needs_confirmation" && a.confirmationId && confirmationIds.has(a.confirmationId))) };
}

/** A failed action that changed nothing (everything except a part-applied plan). */
export const changedNothing = (a: Pick<ChatAction, "status" | "error">) => a.status === "failed" && a.error !== "partial_failure";
/** Failures worth trying again as-is (a hiccup on our side, not a "no"). */
export const isRetryable = (a: Pick<ChatAction, "status" | "error">) => a.status === "failed" && a.error === "server_error";

/** Split buffered stream data into complete events; returns the unfinished remainder. */
export function parseStreamChunk(buffer: string): { events: StreamEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: StreamEvent[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const e = JSON.parse(line) as StreamEvent;
      if (e && (e.t === "text" || e.t === "action")) events.push(e);
    } catch {
      // Ignore malformed lines rather than breaking the conversation.
    }
  }
  return { events, rest };
}

/** Apply one action event: updates an existing action by id or appends it. Info (reads) are hidden. */
export function applyActionEvent(actions: ChatAction[], e: Extract<StreamEvent, { t: "action" }>): ChatAction[] {
  if (e.status === "info") return actions.filter((a) => a.id !== e.id);
  const next: ChatAction = { id: e.id, status: e.status, label: e.label };
  if (e.status === "needs_confirmation" && typeof e.confirmationId === "string") next.confirmationId = e.confirmationId;
  // A result card only accompanies a success or a proposal — never a failure.
  const card = e.status === "succeeded" || e.status === "needs_confirmation" ? sanitizeCard(e.card) : null;
  if (card) next.card = card;
  const error = e.status === "failed" ? asActionError(e.error) : undefined;
  if (error) next.error = error;
  return actions.some((a) => a.id === e.id) ? actions.map((a) => (a.id === e.id ? next : a)) : [...actions, next];
}
