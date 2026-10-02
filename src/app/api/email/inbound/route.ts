import { after, NextResponse, type NextRequest } from "next/server";
import { resendWebhookSecret } from "@/lib/env";
import { handleInboundEmail } from "@/lib/email/inbound";
import { parseResendInbound } from "@/lib/email/providers/resend-webhook";
import { isValidWebhookSignature } from "@/lib/email/webhook-signature";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorInfo, logError, logWarn } from "@/lib/observability/log";

export const maxDuration = 60;

const MAX_BODY_BYTES = 256 * 1024;

/**
 * Resend inbound email webhook (email replies to Jarvis).
 * Configure in Resend: Webhooks → Add endpoint →
 *   POST https://<your-domain>/api/email/inbound, event "email.received",
 *   and set RESEND_WEBHOOK_SECRET to the endpoint's signing secret.
 *
 * Every request must carry a valid Svix signature. The reply is generated
 * after responding (like SMS), so Resend doesn't time out and retry.
 */
export async function POST(request: NextRequest) {
  const secret = resendWebhookSecret();
  if (!secret) return NextResponse.json({ error: "Email replies not configured" }, { status: 503 });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const valid = isValidWebhookSignature(secret, {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  }, raw);
  if (!valid) {
    logWarn("email", "inbound webhook rejected: invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const email = parseResendInbound(payload);
  // Other event types are acknowledged and ignored.
  if (!email) return NextResponse.json({ ok: true, ignored: true });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Server not configured" }, { status: 503 });

  after(async () => {
    try {
      await handleInboundEmail(admin, email);
    } catch (err) {
      logError("email", "inbound handling failed", { emailId: email.emailId, ...errorInfo(err) });
    }
  });
  return NextResponse.json({ ok: true });
}
