import "server-only";

/**
 * Server-side environment access. Secrets are only ever read here, from
 * server code. Nothing in this module may be imported into a Client Component
 * (enforced by `server-only`).
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export function supabaseUrl(): string {
  const url = read("NEXT_PUBLIC_SUPABASE_URL");
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL. See .env.example.");
  return url;
}

export function supabasePublishableKey(): string {
  const key = read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY). See .env.example.");
  }
  return key;
}

/** Service-role / secret key. Bypasses RLS — server-only, used for cron and webhooks. */
export function supabaseServiceKey(): string | undefined {
  return read("SUPABASE_SECRET_KEY") ?? read("SUPABASE_SERVICE_ROLE_KEY");
}

export function openAIConfig(): { apiKey: string; model: string } | null {
  const apiKey = read("OPENAI_API_KEY");
  if (!apiKey) return null;
  return { apiKey, model: read("OPENAI_MODEL") ?? "gpt-5-mini" };
}

export type SmsMode = "disabled" | "test" | "live";

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber?: string;
  messagingServiceSid?: string;
}

export function twilioConfig(): TwilioConfig | null {
  const accountSid = read("TWILIO_ACCOUNT_SID");
  const authToken = read("TWILIO_AUTH_TOKEN");
  // TWILIO_PHONE_NUMBER and TWILIO_FROM_NUMBER are accepted interchangeably.
  const fromNumber = read("TWILIO_PHONE_NUMBER") ?? read("TWILIO_FROM_NUMBER");
  const messagingServiceSid = read("TWILIO_MESSAGING_SERVICE_SID");
  if (!accountSid || !authToken || (!fromNumber && !messagingServiceSid)) return null;
  return { accountSid, authToken, fromNumber, messagingServiceSid };
}

/**
 * SMS_MODE controls delivery:
 *   disabled — nothing is recorded or sent
 *   test     — (default) messages are recorded with status "test", never sent
 *   live     — messages are sent through Twilio (requires Twilio credentials)
 * "live" silently degrades to "test" if Twilio credentials are missing.
 */
export function smsMode(): SmsMode {
  const raw = read("SMS_MODE")?.toLowerCase();
  if (raw === "disabled") return "disabled";
  if (raw === "live") return twilioConfig() ? "live" : "test";
  return "test";
}

/**
 * Public base URL Twilio calls for webhooks (e.g. an ngrok tunnel during a
 * local demo). Falls back to NEXT_PUBLIC_APP_URL. Used only to verify
 * X-Twilio-Signature, which is computed over the exact URL Twilio requested.
 */
export function twilioWebhookBaseUrl(): string | undefined {
  return (read("TWILIO_WEBHOOK_BASE_URL") ?? read("NEXT_PUBLIC_APP_URL"))?.replace(/\/$/, "");
}

/** Override for the Twilio REST API origin. Only for automated tests against a mock server. */
export function twilioApiBaseUrl(): string {
  return (read("TWILIO_API_BASE_URL") ?? "https://api.twilio.com").replace(/\/$/, "");
}

export type PhoneVerificationMode = "off" | "test";

/**
 * PHONE_VERIFICATION_MODE:
 *   off  (default) no verification flow is offered
 *   test local development only: codes are generated and checked in-app and
 *        shown on screen instead of being texted. Refused in production.
 * A "twilio" mode (Twilio Verify) is the planned production provider; it is
 * not implemented yet — see src/lib/verification/provider.ts.
 */
export function phoneVerificationMode(): PhoneVerificationMode {
  const raw = read("PHONE_VERIFICATION_MODE")?.toLowerCase();
  if (raw === "test") return process.env.NODE_ENV === "production" ? "off" : "test";
  return "off";
}

/**
 * REQUIRE_PHONE_VERIFICATION=true makes a verified number mandatory for any
 * SMS (outbound and inbound). Default false keeps current SMS behavior.
 */
export function requirePhoneVerification(): boolean {
  return read("REQUIRE_PHONE_VERIFICATION")?.toLowerCase() === "true";
}

/** Secret used to hash verification codes (HMAC). */
export function phoneVerificationSecret(): string | undefined {
  return read("PHONE_VERIFICATION_SECRET");
}

export function cronSecret(): string | undefined {
  return read("CRON_SECRET");
}

/** Public base URL, used for auth email redirects and Twilio signature checks. */
export function appUrl(): string | undefined {
  return read("NEXT_PUBLIC_APP_URL")?.replace(/\/$/, "");
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
}

/** Google OAuth client (Google Cloud Console → Credentials → OAuth client ID, type "Web application"). */
export function googleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = read("GOOGLE_CLIENT_ID");
  const clientSecret = read("GOOGLE_CLIENT_SECRET");
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * 32-byte key (base64 or hex) used to encrypt OAuth tokens and OAuth state
 * with AES-256-GCM. Generate with `openssl rand -base64 32`. Server-only.
 * Rotating it invalidates stored tokens (users reconnect).
 */
export function integrationsEncryptionKey(): Buffer | null {
  const raw = read("INTEGRATIONS_ENCRYPTION_KEY");
  if (!raw) return null;
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

/** Override for all Google endpoints. Only for automated tests against a mock server. */
export function googleTestBaseUrl(): string | undefined {
  return read("GOOGLE_API_TEST_BASE_URL")?.replace(/\/$/, "");
}

export type EmailMode = "disabled" | "test" | "live";

export interface ResendConfig {
  apiKey: string;
  /** Verified sender, e.g. "Jarvis <jarvis@mail.your-domain.com>". */
  from: string;
  /**
   * Domain that receives replies through Resend inbound (EMAIL_REPLY_DOMAIN,
   * e.g. "reply.your-domain.com"). Defaults to the EMAIL_FROM domain.
   */
  replyDomain: string;
}

function addressDomain(from: string): string | undefined {
  return /@([a-z0-9.-]+\.[a-z]{2,})>?\s*$/i.exec(from)?.[1]?.toLowerCase();
}

/** Resend credentials. RESEND_API_KEY and EMAIL_FROM are required to send real email. */
export function resendConfig(): ResendConfig | null {
  const apiKey = read("RESEND_API_KEY");
  const from = read("EMAIL_FROM");
  if (!apiKey || !from) return null;
  const replyDomain = read("EMAIL_REPLY_DOMAIN")?.toLowerCase().replace(/^@/, "") ?? addressDomain(from);
  return replyDomain ? { apiKey, from, replyDomain } : null;
}

/**
 * EMAIL_MODE controls email delivery (same semantics as SMS_MODE):
 *   disabled — nothing is recorded or sent
 *   test     — (default) emails are recorded with status "test", never sent
 *   live     — sent through Resend (requires RESEND_API_KEY and EMAIL_FROM;
 *              silently degrades to "test" without them)
 * Automated tests never set "live", so they can't send real email.
 */
export function emailMode(): EmailMode {
  const raw = read("EMAIL_MODE")?.toLowerCase();
  if (raw === "disabled") return "disabled";
  if (raw === "live") return resendConfig() ? "live" : "test";
  return "test";
}

/** Signing secret of the Resend inbound webhook (whsec_...). Required to accept replies. */
export function resendWebhookSecret(): string | undefined {
  return read("RESEND_WEBHOOK_SECRET");
}

/** Override for the Resend API origin. Only for automated tests against a mock server. */
export function resendApiBaseUrl(): string {
  return (read("RESEND_API_BASE_URL") ?? "https://api.resend.com").replace(/\/$/, "");
}
