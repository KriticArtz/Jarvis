import { NextResponse, type NextRequest } from "next/server";
import { EMPTY_TWIML, verifyTwilioRequest } from "@/lib/notifications/webhook";
import { createAdminClient } from "@/lib/supabase/admin";

/** Twilio delivery status callback: marks undelivered/failed messages. */
export async function POST(request: NextRequest) {
  const verified = await verifyTwilioRequest(request);
  if (!verified.ok) return NextResponse.json({ error: "Forbidden" }, { status: verified.status });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Server not configured" }, { status: 503 });

  const { MessageSid: sid, MessageStatus: status, ErrorCode: errorCode } = verified.params;
  if (sid && (status === "failed" || status === "undelivered")) {
    await admin
      .from("notifications")
      .update({ status: "failed", error: `Twilio status ${status}${errorCode ? ` (${errorCode})` : ""}` })
      .eq("provider_message_id", sid);
  }
  return new Response(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
}
