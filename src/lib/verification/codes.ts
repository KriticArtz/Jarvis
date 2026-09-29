import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Pure helpers for one-time phone verification codes. Codes are never stored
 * in plain text: only an HMAC bound to the user and the phone number.
 */

export const CODE_LENGTH = 6;
export const CODE_TTL_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
export const MAX_STARTS_PER_HOUR = 5;

export function generateCode(random: (max: number) => number = randomInt): string {
  return String(random(10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

export function hashCode(secret: string, userId: string, phone: string, code: string): string {
  return createHmac("sha256", secret).update(`${userId}:${phone}:${code}`).digest("hex");
}

export function codeMatches(secret: string, userId: string, phone: string, code: string, storedHash: string): boolean {
  const expected = Buffer.from(hashCode(secret, userId, phone, code.trim()));
  const given = Buffer.from(storedHash);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export interface VerificationRecord {
  phone: string;
  code_hash: string | null;
  attempts: number;
  max_attempts: number;
  expires_at: string;
  verified_at: string | null;
}

export type CheckOutcome = "verified" | "invalid_code" | "expired" | "too_many_attempts" | "phone_changed" | "already_verified" | "not_found";

/** Decide the outcome of a code check without touching the database. */
export function evaluateCode(input: {
  record: VerificationRecord | null;
  currentPhone: string | null;
  code: string;
  secret: string;
  userId: string;
  now?: Date;
}): CheckOutcome {
  const { record } = input;
  if (!record || !record.code_hash) return "not_found";
  if (record.verified_at) return "already_verified";
  if (!input.currentPhone || input.currentPhone !== record.phone) return "phone_changed";
  if (record.attempts >= record.max_attempts) return "too_many_attempts";
  if (Date.parse(record.expires_at) <= (input.now ?? new Date()).getTime()) return "expired";
  if (!/^\d{6}$/.test(input.code.trim())) return "invalid_code";
  return codeMatches(input.secret, input.userId, record.phone, input.code, record.code_hash) ? "verified" : "invalid_code";
}

export const OUTCOME_MESSAGE: Record<Exclude<CheckOutcome, "verified">, string> = {
  invalid_code: "That code isn't right. Check it and try again.",
  expired: "That code has expired. Send a new one.",
  too_many_attempts: "Too many incorrect attempts. Send a new code.",
  phone_changed: "Your phone number changed. Send a new code to the current number.",
  already_verified: "This number is already verified.",
  not_found: "Send a verification code first.",
};
