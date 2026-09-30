"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { disconnectGoogleCalendar, syncGoogleCalendar } from "@/lib/integrations/calendar/sync";
import { disconnectFitness } from "@/lib/integrations/fitness/store";
import { fitnessProviderSchema } from "@/lib/integrations/fitness/schema";
import { GENERIC_ERROR, NOT_SIGNED_IN, type ActionResult } from "./result";

const DEMO: ActionResult = { ok: false, error: "Integrations are available in your own account, not the shared demo." };
const NOT_CONFIGURED: ActionResult = { ok: false, error: "Calendar sync isn't configured on this server yet." };
/** Minimum gap between manual syncs. */
const MIN_SYNC_INTERVAL_MS = 20_000;

export async function syncCalendarNow(): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (session.isDemo) return DEMO;
  const admin = createAdminClient();
  if (!admin) return NOT_CONFIGURED;

  const { data: conn } = await admin
    .from("integration_connections")
    .select("last_synced_at")
    .eq("user_id", session.userId)
    .eq("provider", "google_calendar")
    .maybeSingle();
  if (conn?.last_synced_at && Date.now() - new Date(conn.last_synced_at as string).getTime() < MIN_SYNC_INTERVAL_MS) {
    return { ok: true, message: "Already up to date." };
  }
  const res = await syncGoogleCalendar(admin, session.userId);
  revalidatePath("/", "layout");
  if (res.ok) return { ok: true, message: `Synced — ${res.upserted} upcoming event${res.upserted === 1 ? "" : "s"}.` };
  switch (res.reason) {
    case "not_connected":
      return { ok: false, error: "Google Calendar isn't connected." };
    case "reauth_required":
      return { ok: false, error: "Google access was revoked or expired. Reconnect to keep syncing." };
    case "not_configured":
      return NOT_CONFIGURED;
    default:
      return { ok: false, error: "Couldn't reach Google Calendar. Please try again in a minute." };
  }
}

export async function disconnectCalendar(): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (session.isDemo) return DEMO;
  const admin = createAdminClient();
  if (!admin) return NOT_CONFIGURED;
  const res = await disconnectGoogleCalendar(admin, session.userId);
  revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "Google Calendar disconnected. Its events were removed." } : GENERIC_ERROR;
}

/** Remove a fitness source and all of its data (it can be reconnected from the mobile app). */
export async function disconnectFitnessSource(provider: string): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (session.isDemo) return DEMO;
  const parsed = fitnessProviderSchema.safeParse(provider);
  if (!parsed.success) return GENERIC_ERROR;
  const admin = createAdminClient();
  if (!admin) return NOT_CONFIGURED;
  const res = await disconnectFitness(admin, session.userId, parsed.data);
  revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "Disconnected. Its fitness data was deleted." } : GENERIC_ERROR;
}
