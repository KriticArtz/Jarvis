import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Authenticated encryption for secrets at rest (OAuth tokens) and in
 * cookies (OAuth state). AES-256-GCM with a random 96-bit IV.
 *
 * `purpose` is bound in as additional authenticated data (e.g.
 * "google_calendar:refresh:<userId>"), so a ciphertext only decrypts in the
 * context it was created for: swapping one user's token into another user's
 * row, or replaying a state cookie as a token, fails.
 *
 * Format: "v1.<base64url(iv | tag | ciphertext)>"
 */
const VERSION = "v1";

export function seal(key: Buffer, purpose: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(purpose, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

/** Returns null for anything tampered, truncated, wrong-key or wrong-purpose. */
export function unseal(key: Buffer, purpose: string, sealed: string | null | undefined): string | null {
  if (!sealed || !sealed.startsWith(`${VERSION}.`)) return null;
  try {
    const raw = Buffer.from(sealed.slice(VERSION.length + 1), "base64url");
    if (raw.length < 12 + 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(purpose, "utf8"));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
