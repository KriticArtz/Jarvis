"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { emailMode } from "@/lib/env";
import { sendAccountabilityCheckIn } from "@/lib/email/check-in";
import { createAdminClient } from "@/lib/supabase/admin";
import { GENERIC_ERROR, NOT_SIGNED_IN, type ActionResult } from "./result";

const DEMO_NO_EMAIL: ActionResult = { ok: false, error: "Email check-ins aren't available in the demo. Create your own account to get them." };

/**
 * Turn email accountability on or off for the signed-in user. Written with
 * the user's own session, so RLS limits it to their row. The address is
 * always the account's email — there's nothing else to set.
 */
export async function setEmailAccountability(enabled: boolean): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (session.isDemo) return DEMO_NO_EMAIL;
  const { error } = await session.supabase
    .from("notification_preferences")
    .update(enabled ? { email_enabled: true, email_enabled_at: new Date().toISOString() } : { email_enabled: false })
    .eq("user_id", session.userId);
  if (error) return GENERIC_ERROR;
  revalidatePath("/settings");
  return { ok: true, message: enabled ? "Email check-ins are on." : "Email check-ins are off." };
}

/**
 * Send the signed-in user a check-in, to their own account email only.
 * Takes no arguments: there is no way to pick a recipient or another user.
 */
export async function sendTestCheckIn(): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (session.isDemo) return DEMO_NO_EMAIL;
  if (emailMode() === "disabled") return { ok: false, error: "Email is disabled on this server (EMAIL_MODE=disabled)." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "The server isn't configured for email yet (missing SUPABASE_SERVICE_ROLE_KEY)." };

  const outcome = await sendAccountabilityCheckIn(admin, session.userId, { kind: "test" });
  revalidatePath("/settings");
  switch (outcome.status) {
    case "sent":
      return { ok: true, message: "Check-in sent. Reply to it from your inbox." };
    case "test":
      return { ok: true, message: "Recorded in test mode — no real email was sent. See the log below." };
    case "failed":
      return { ok: false, error: "Sending failed. Nothing was delivered — try again in a minute." };
    case "skipped":
      return { ok: false, error: outcome.reason };
    default:
      return { ok: false, error: "Already sent — give it a minute." };
  }
}
