import "server-only";
import type { NextRequest } from "next/server";
import { appUrl, twilioConfig } from "@/lib/env";
import { isValidTwilioSignature } from "./twilio-signature";

/**
 * Parse and authenticate a Twilio webhook. The signature is computed over the
 * public URL Twilio called, so set NEXT_PUBLIC_APP_URL to your deployed
 * origin (proxies can rewrite the host otherwise).
 */
export async function verifyTwilioRequest(request: NextRequest): Promise<{ ok: true; params: Record<string, string> } | { ok: false; status: number }> {
  const cfg = twilioConfig();
  if (!cfg) return { ok: false, status: 503 };

  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === "string") params[key] = value;
  });

  const base = appUrl() ?? request.nextUrl.origin;
  const url = `${base}${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (!isValidTwilioSignature(cfg.authToken, request.headers.get("x-twilio-signature"), url, params)) {
    return { ok: false, status: 403 };
  }
  return { ok: true, params };
}

export const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
