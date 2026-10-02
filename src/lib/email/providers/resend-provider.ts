import "server-only";
import { resendApiBaseUrl } from "@/lib/env";
import type { EmailProvider, EmailSendResult, OutboundEmail, ReceivedEmail } from "./types";

/**
 * Resend REST API (https://resend.com/docs/api-reference):
 *   POST /emails                     send (Idempotency-Key prevents duplicates on retry)
 *   GET  /emails/receiving/{id}      body + headers of a received email
 * The API key is server-only and never logged.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  readonly delivers = true;

  constructor(private readonly apiKey: string) {}

  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", ...extra };
  }

  async send(email: OutboundEmail): Promise<EmailSendResult> {
    try {
      const res = await fetch(`${resendApiBaseUrl()}/emails`, {
        method: "POST",
        headers: this.headers({ "Idempotency-Key": email.idempotencyKey }),
        body: JSON.stringify({
          from: email.from,
          to: [email.to],
          reply_to: email.replyTo,
          subject: email.subject,
          text: email.text,
          html: email.html,
          headers: email.headers,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      if (!res.ok) {
        return { ok: false, error: `resend ${res.status}: ${String(data.name ?? data.message ?? "error").slice(0, 120)}`, retryable: res.status >= 500 || res.status === 429 };
      }
      return { ok: true, providerMessageId: data.id ?? null };
    } catch (err) {
      return { ok: false, error: `resend request failed: ${(err as Error).name}`, retryable: true };
    }
  }

  async getReceived(emailId: string): Promise<ReceivedEmail | null> {
    if (!/^[\w-]{1,100}$/.test(emailId)) return null;
    try {
      const res = await fetch(`${resendApiBaseUrl()}/emails/receiving/${encodeURIComponent(emailId)}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { text?: string | null; html?: string | null; headers?: Record<string, string> | null };
      return { text: data.text ?? null, html: data.html ?? null, headers: data.headers ?? {} };
    } catch {
      return null;
    }
  }
}
