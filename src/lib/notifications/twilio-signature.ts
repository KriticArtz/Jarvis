import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Validate the X-Twilio-Signature header for a form-encoded webhook.
 * Algorithm: base64(HMAC-SHA1(authToken, url + concat(sorted(key + value)))).
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function computeTwilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

export function isValidTwilioSignature(
  authToken: string,
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(computeTwilioSignature(authToken, url, params));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
