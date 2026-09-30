/**
 * Chat stream protocol (newline-delimited JSON), shared by the chat API route
 * and the chat UI:
 *   {"t":"text","v":"…"}                                   reply text delta
 *   {"t":"action","id":"…","status":"running|succeeded|failed|needs_confirmation|info","label":"…"}
 */
export type ActionStatus = "running" | "succeeded" | "failed" | "needs_confirmation" | "info";

export interface ChatAction {
  id: string;
  status: ActionStatus;
  label: string;
}

export type StreamEvent = { t: "text"; v: string } | { t: "action"; id: string; status: ActionStatus; label: string };

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
  const next = { id: e.id, status: e.status, label: e.label };
  return actions.some((a) => a.id === e.id) ? actions.map((a) => (a.id === e.id ? next : a)) : [...actions, next];
}
