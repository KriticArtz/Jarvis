import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a Resend webhook. Resend signs webhooks with Svix:
 *   signed content = `${svix-id}.${svix-timestamp}.${raw body}`
 *   signature      = base64(HMAC-SHA256(base64decode(secret without "whsec_"), content))
 *   svix-signature = space-separated list of "v1,<signature>"
 * Timestamps outside ±5 minutes are rejected (replay protection).
 * https://docs.svix.com/receiving/verifying-payloads/how-manual
 */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export function computeWebhookSignature(secret: string, id: string, timestamp: string, payload: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64");
}

export function isValidWebhookSignature(secret: string | undefined, headers: WebhookHeaders, payload: string, now: Date = new Date()): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  if (!/^\d{1,12}$/.test(headers.timestamp)) return false;
  if (Math.abs(now.getTime() / 1000 - Number(headers.timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(computeWebhookSignature(secret, headers.id, headers.timestamp, payload));
  return headers.signature.split(" ").some((part) => {
    const [version, sig] = part.split(",", 2);
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
