/**
 * Rules for executing a stored proposal (pure; unit-tested). A proposal can
 * only be confirmed by the same user, in the same conversation, in a LATER
 * message than the one that created it, before it expires, and only once.
 */
export const PROPOSAL_TTL_MINUTES = 30;
/** Email replies arrive hours later, not seconds; same rules, longer window. */
export const EMAIL_PROPOSAL_TTL_MINUTES = 12 * 60;

export function proposalTtlMinutes(channel: string): number {
  return channel === "email" ? EMAIL_PROPOSAL_TTL_MINUTES : PROPOSAL_TTL_MINUTES;
}

export interface ProposalRow {
  user_id: string;
  conversation_id: string | null;
  status: string;
  created_at: string;
  expires_at: string | null;
}

export type ConfirmCheck = "ok" | "not_found" | "already_resolved" | "expired" | "same_turn";

export function checkConfirmation(
  row: ProposalRow | null,
  ctx: { userId: string; conversationId: string | null; turnStartedAt: string },
  now: Date = new Date(),
): ConfirmCheck {
  if (!row || row.user_id !== ctx.userId || (row.conversation_id ?? null) !== (ctx.conversationId ?? null)) return "not_found";
  if (row.status !== "pending_confirmation") return "already_resolved";
  if (row.expires_at && Date.parse(row.expires_at) <= now.getTime()) return "expired";
  // The user must have replied after the proposal was made.
  if (Date.parse(row.created_at) >= Date.parse(ctx.turnStartedAt)) return "same_turn";
  return "ok";
}
