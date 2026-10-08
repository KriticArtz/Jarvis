import { sanitizeCard } from "./cards";
import { asActionError, type ChatAction } from "./stream-protocol";

export interface StoredAction {
  id: string;
  status: string;
  summary: string | null;
  created_at: string;
  resolved_at: string | null;
  expires_at?: string | null;
  error_code?: string | null;
  /** assistant_actions.result: the structured result (validated again here). */
  result?: unknown;
}

/** Columns `attachActions` needs from assistant_actions. */
export const STORED_ACTION_COLUMNS = "id, status, summary, created_at, resolved_at, expires_at, error_code, result";

interface MessageLike {
  id: string;
  role: "user" | "assistant";
  created_at: string;
}

/**
 * Attach logged assistant actions to the reply they belong to: the first
 * assistant message after the action (after its resolution, for proposals
 * that were later confirmed or declined). Each comes back exactly as it was
 * shown live — with its structured result card when one was stored. Expired
 * proposals, and declined ones without a card, are hidden.
 */
export function attachActions<M extends MessageLike>(messages: M[], actions: StoredAction[], now: Date = new Date()): Map<string, ChatAction[]> {
  const byMessage = new Map<string, ChatAction[]>();
  const assistants = messages.filter((m) => m.role === "assistant").sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const a of [...actions].sort((x, y) => x.created_at.localeCompare(y.created_at))) {
    // Expired proposals can't be answered any more (whether or not the row was marked yet).
    if (a.status === "expired" || (a.status === "pending_confirmation" && a.expires_at && Date.parse(a.expires_at) <= now.getTime())) continue;
    const card = sanitizeCard(a.result);
    if (a.status === "cancelled" && !card) continue;
    const anchor = a.status !== "pending_confirmation" && a.resolved_at ? a.resolved_at : a.created_at;
    const target = assistants.find((m) => m.created_at >= anchor);
    if (!target) continue;
    const status: ChatAction["status"] =
      a.status === "pending_confirmation" ? "needs_confirmation" : a.status === "succeeded" ? "succeeded" : a.status === "cancelled" ? "declined" : "failed";
    const list = byMessage.get(target.id) ?? [];
    const action: ChatAction = { id: a.id, status, label: a.summary ?? "" };
    // Open proposals can be answered from the chat.
    if (status === "needs_confirmation") action.confirmationId = a.id;
    // Failures never carry a result card; successes, proposals and declines do when one was stored.
    if (card && status !== "failed") action.card = card;
    const error = status === "failed" ? asActionError(a.error_code) : undefined;
    if (error) action.error = error;
    list.push(action);
    byMessage.set(target.id, list);
  }
  return byMessage;
}
