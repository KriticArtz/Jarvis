import type { InboundEmail } from "../inbound";

/**
 * Map a Resend `email.received` webhook to our inbound shape (pure).
 * The webhook carries metadata only; the body is fetched afterwards via the
 * Received Emails API. Returns null for any other event or a malformed payload.
 */
export function parseResendInbound(payload: unknown): InboundEmail | null {
  const p = payload as { type?: unknown; data?: Record<string, unknown> } | null;
  if (!p || p.type !== "email.received" || !p.data || typeof p.data !== "object") return null;
  const d = p.data;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 50) : typeof v === "string" ? [v] : []);
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const emailId = str(d.email_id);
  if (!emailId || emailId.length > 100) return null;
  return {
    provider: "resend",
    emailId,
    from: str(d.from),
    to: list(d.to),
    cc: list(d.cc),
    subject: str(d.subject),
    messageId: str(d.message_id),
  };
}
