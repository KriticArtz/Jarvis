/**
 * Email provider contract. Resend is the first implementation; everything
 * provider-specific stays behind this interface.
 */
export interface OutboundEmail {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
  /** Our outbound row id — lets the provider drop a retried duplicate. */
  idempotencyKey: string;
}

export type EmailSendResult = { ok: true; providerMessageId: string | null } | { ok: false; error: string; retryable: boolean };

/** Body of a received email (the webhook only carries metadata). */
export interface ReceivedEmail {
  text: string | null;
  html: string | null;
  headers: Record<string, string>;
}

export interface EmailProvider {
  readonly name: string;
  /** true if this provider actually delivers email */
  readonly delivers: boolean;
  send(email: OutboundEmail): Promise<EmailSendResult>;
  getReceived(emailId: string): Promise<ReceivedEmail | null>;
}
