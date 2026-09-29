import type { OutboundSms, SendResult, SmsProvider } from "./types";

/**
 * Test-mode provider: never contacts a carrier. The notification service
 * records the message with status "test" so it is visible in Settings, and
 * nothing leaves the server.
 */
export class TestSmsProvider implements SmsProvider {
  readonly name = "test";
  readonly delivers = false;

  async send(message: OutboundSms): Promise<SendResult> {
    void message;
    return { ok: true, providerMessageId: null };
  }
}
