import { after, NextResponse, type NextRequest } from "next/server";
import { handleInboundSms } from "@/lib/notifications/inbound";
import { EMPTY_TWIML, verifyTwilioRequest } from "@/lib/notifications/webhook";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorInfo, logError } from "@/lib/observability/log";

export const maxDuration = 60;

/**
 * Twilio inbound SMS webhook.
 * Configure in Twilio: Phone Number (or Messaging Service) → "A message comes in"
 *   → Webhook → POST https://<your-domain>/api/sms/inbound
 *
 * Responds immediately with empty TwiML; the AI reply is generated after the
 * response and sent through the notification service (Twilio times out at 15s).
 */
export async function POST(request: NextRequest) {
  const verified = await verifyTwilioRequest(request);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.status === 503 ? "SMS not configured" : "Invalid signature" }, { status: verified.status });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Server not configured" }, { status: 503 });

  const { From: from, Body: body, MessageSid: sid } = verified.params;
  if (!from || !sid) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  after(async () => {
    try {
      await handleInboundSms(admin, { provider: "twilio", providerMessageId: sid, from, body: body ?? "" });
    } catch (err) {
      logError("sms", "inbound handling failed", { sid, ...errorInfo(err) });
    }
  });

  return new Response(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
}
