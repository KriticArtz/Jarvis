import type { ChatAction } from "./stream-protocol";

export interface StoredAction {
  id: string;
  status: string;
  summary: string | null;
  created_at: string;
  resolved_at: string | null;
  expires_at?: string | null;
}

interface MessageLike {
  id: string;
  role: "user" | "assistant";
  created_at: string;
}

/**
 * Attach logged assistant actions to the reply they belong to: the first
 * assistant message after the action (after its resolution, for proposals
 * that were later confirmed). Cancelled and expired proposals are hidden.
 */
export function attachActions<M extends MessageLike>(messages: M[], actions: StoredAction[], now: Date = new Date()): Map<string, ChatAction[]> {
  const byMessage = new Map<string, ChatAction[]>();
  const assistants = messages.filter((m) => m.role === "assistant").sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const a of [...actions].sort((x, y) => x.created_at.localeCompare(y.created_at))) {
    if (a.status === "cancelled" || a.status === "expired") continue;
    const anchor = a.status !== "pending_confirmation" && a.resolved_at ? a.resolved_at : a.created_at;
    const target = assistants.find((m) => m.created_at >= anchor);
    if (!target) continue;
    const status = a.status === "pending_confirmation" ? "needs_confirmation" : a.status === "succeeded" ? "succeeded" : "failed";
    const list = byMessage.get(target.id) ?? [];
    const action: ChatAction = { id: a.id, status, label: a.summary ?? "" };
    // Still-open proposals can be answered from the chat.
    if (status === "needs_confirmation" && (!a.expires_at || Date.parse(a.expires_at) > now.getTime())) action.confirmationId = a.id;
    list.push(action);
    byMessage.set(target.id, list);
  }
  return byMessage;
}
