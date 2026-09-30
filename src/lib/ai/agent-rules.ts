import type { ToolResult } from "@/lib/assistant/actions/types";

/** Appended by the server when the reply claims success but nothing changed. */
export const FAILED_ACTION_NOTE = "\n\n(Heads up: that change didn't go through — nothing was updated.)";

const SUCCESS = /\b(done|all set|i'?ve|i have|moved|marked|added|created|updated|deleted|removed|logged|saved|completed|rescheduled|recorded|paused|resumed)\b/i;
const NEGATION = /\b(couldn'?t|could not|wasn'?t able|was not able|unable|didn'?t|did not|failed|not able|can'?t|cannot|won'?t|no changes?|nothing (was|got) (changed|updated))\b/i;

/** Does this reply read as "the change was made"? (Conservative heuristic.) */
export function claimsSuccess(text: string): boolean {
  return SUCCESS.test(text) && !NEGATION.test(text);
}

/** What the model sees for a tool result — never internal errors or other users' data. */
export function toolOutputForModel(result: ToolResult): Record<string, unknown> {
  const out: Record<string, unknown> = { status: result.status, message: result.message };
  if (result.error) out.error = result.error;
  if (result.data) out.data = result.data;
  if (result.status === "needs_confirmation") {
    out.confirmation_id = result.confirmationId;
    out.instruction = "NOT done yet. Describe this change to the user and ask them to confirm. Do not say it has been made.";
  } else if (result.status === "failed") {
    out.instruction = "This did NOT happen. Tell the user plainly and offer a next step. Do not say it succeeded.";
  }
  return out;
}
