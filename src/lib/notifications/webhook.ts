import "server-only";
import type { NextRequest } from "next/server";
import { twilioConfig, twilioWebhookBaseUrl } from "@/lib/env";
import { isValidTwilioSignature } from "./twilio-signature";

/**
 * The URLs Twilio may have signed: the configured public base (production
 * domain or ngrok tunnel) and the URL reconstructed from forwarding headers
 * (ngrok and Vercel set these). Each is only accepted if the HMAC made with
 * TWILIO_AUTH_TOKEN matches, so this doesn't weaken verification.
 */
export function candidateWebhookUrls(pathAndQuery: string, headers: Headers, configuredBase: string | undefined): string[] {
  const urls = new Set<string>();
  if (configuredBase) urls.add(`${configuredBase}${pathAndQuery}`);
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (host) {
    const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || (host.startsWith("localhost") ? "http" : "https");
    urls.add(`${proto}://${host}${pathAndQuery}`);
  }
  return [...urls];
}

/** Parse and authenticate a Twilio webhook (form-encoded POST). */
export async function verifyTwilioRequest(request: NextRequest): Promise<{ ok: true; params: Record<string, string> } | { ok: false; status: number }> {
  const cfg = twilioConfig();
  if (!cfg) {
    console.error("[sms] webhook rejected: Twilio credentials are not configured");
    return { ok: false, status: 503 };
  }

  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === "string") params[key] = value;
  });

  const signature = request.headers.get("x-twilio-signature");
  const candidates = candidateWebhookUrls(`${request.nextUrl.pathname}${request.nextUrl.search}`, request.headers, twilioWebhookBaseUrl());
  if (!candidates.some((url) => isValidTwilioSignature(cfg.authToken, signature, url, params))) {
    console.error("[sms] webhook rejected: invalid X-Twilio-Signature", {
      hasSignature: Boolean(signature),
      triedUrls: candidates,
      hint: "Set TWILIO_WEBHOOK_BASE_URL to the exact https origin configured in Twilio (e.g. your ngrok URL).",
    });
    return { ok: false, status: 403 };
  }
  return { ok: true, params };
}

export const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
