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
  const fromNumber = read("TWILIO_FROM_NUMBER");
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

export function cronSecret(): string | undefined {
  return read("CRON_SECRET");
}

/** Public base URL, used for auth email redirects and Twilio signature checks. */
export function appUrl(): string | undefined {
  return read("NEXT_PUBLIC_APP_URL")?.replace(/\/$/, "");
}
