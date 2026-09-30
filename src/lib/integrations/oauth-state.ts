import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { seal, unseal } from "./crypto";

/**
 * OAuth "state" + PKCE, kept in an encrypted, httpOnly cookie.
 *
 * The cookie binds: a random state (CSRF protection — must match the
 * `state` Google echoes back), the PKCE verifier (so an intercepted code is
 * useless), the user who started the flow (a code can't be attached to a
 * different signed-in account), and an expiry.
 */
export const OAUTH_COOKIE = "jarvis_oauth_google";
export const OAUTH_STATE_TTL_SECONDS = 600;
const PURPOSE = "oauth-state:google_calendar";

export interface OAuthStart {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  cookieValue: string;
}

export function startOAuth(key: Buffer, userId: string, now = Date.now()): OAuthStart {
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const cookieValue = seal(key, PURPOSE, JSON.stringify({ s: state, v: codeVerifier, u: userId, e: now + OAUTH_STATE_TTL_SECONDS * 1000 }));
  return { state, codeVerifier, codeChallenge, cookieValue };
}

export type OAuthStateCheck =
  | { ok: true; codeVerifier: string }
  | { ok: false; reason: "missing" | "invalid" | "expired" | "state_mismatch" | "user_mismatch" };

/** Verify the callback's `state` against the cookie for the signed-in user. */
export function checkOAuthState(key: Buffer, cookieValue: string | undefined, returnedState: string | null, userId: string, now = Date.now()): OAuthStateCheck {
  if (!cookieValue || !returnedState) return { ok: false, reason: "missing" };
  const raw = unseal(key, PURPOSE, cookieValue);
  if (!raw) return { ok: false, reason: "invalid" };
  let data: { s?: unknown; v?: unknown; u?: unknown; e?: unknown };
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (typeof data.s !== "string" || typeof data.v !== "string" || typeof data.u !== "string" || typeof data.e !== "number") return { ok: false, reason: "invalid" };
  if (now > data.e) return { ok: false, reason: "expired" };
  const a = Buffer.from(data.s);
  const b = Buffer.from(returnedState);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "state_mismatch" };
  if (data.u !== userId) return { ok: false, reason: "user_mismatch" };
  return { ok: true, codeVerifier: data.v };
}
