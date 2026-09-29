/**
 * Channel-agnostic SMS provider contract. Twilio is the first implementation;
 * any other provider (or a push/voice channel later) implements the same shape.
 */
export interface OutboundSms {
  to: string; // E.164
  body: string;
}

export type SendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string; retryable: boolean };

export interface SmsProvider {
  readonly name: string;
  /** true if this provider actually delivers messages to phones */
  readonly delivers: boolean;
  send(message: OutboundSms): Promise<SendResult>;
}
