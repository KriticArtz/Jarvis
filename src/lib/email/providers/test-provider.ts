import type { EmailProvider, EmailSendResult, OutboundEmail, ReceivedEmail } from "./types";

/**
 * EMAIL_MODE=test (the default): nothing leaves the server. Sent emails are
 * kept in memory so tests can inspect them, and received bodies can be
 * seeded with `receive()`.
 */
export class TestEmailProvider implements EmailProvider {
  readonly name = "test";
  readonly delivers = false;
  readonly sent: OutboundEmail[] = [];
  private readonly inbox = new Map<string, ReceivedEmail>();

  constructor(private readonly opts: { fail?: boolean } = {}) {}

  async send(email: OutboundEmail): Promise<EmailSendResult> {
    if (this.opts.fail) return { ok: false, error: "test provider failure", retryable: true };
    this.sent.push(email);
    return { ok: true, providerMessageId: `test-${this.sent.length}` };
  }

  receive(emailId: string, email: Partial<ReceivedEmail>) {
    this.inbox.set(emailId, { text: email.text ?? null, html: email.html ?? null, headers: email.headers ?? {} });
  }

  async getReceived(emailId: string): Promise<ReceivedEmail | null> {
    return this.inbox.get(emailId) ?? null;
  }
}
