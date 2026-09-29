import "server-only";
import type { TwilioConfig } from "@/lib/env";
import type { OutboundSms, SendResult, SmsProvider } from "./types";

/**
 * Twilio Programmable Messaging via the REST API (no SDK dependency).
 * Credentials come from TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN and either
 * TWILIO_MESSAGING_SERVICE_SID (preferred) or TWILIO_FROM_NUMBER.
 */
export class TwilioSmsProvider implements SmsProvider {
  readonly name = "twilio";
  readonly delivers = true;

  constructor(
    private readonly config: TwilioConfig,
    private readonly statusCallbackUrl?: string,
  ) {}

  async send(message: OutboundSms): Promise<SendResult> {
    const params = new URLSearchParams({ To: message.to, Body: message.body });
    if (this.config.messagingServiceSid) params.set("MessagingServiceSid", this.config.messagingServiceSid);
    else if (this.config.fromNumber) params.set("From", this.config.fromNumber);
    if (this.statusCallbackUrl) params.set("StatusCallback", this.statusCallbackUrl);

    const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString("base64");
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.config.accountSid)}/Messages.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });
      const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
      if (!res.ok) {
        return { ok: false, error: `Twilio ${res.status}${json.code ? ` (${json.code})` : ""}: ${json.message ?? "request failed"}`, retryable: res.status >= 500 || res.status === 429 };
      }
      return { ok: true, providerMessageId: json.sid ?? null };
    } catch (err) {
      return { ok: false, error: `Twilio network error: ${(err as Error).message}`, retryable: true };
    }
  }
}
