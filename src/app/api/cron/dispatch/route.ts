import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { cronSecret, smsMode } from "@/lib/env";
import { runDispatch } from "@/lib/notifications/dispatch";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = cronSecret();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Proactive notification dispatcher, meant to run every 15 minutes. It isn't
 * scheduled in vercel.json right now (Vercel Hobby only allows daily crons);
 * any scheduler can call it with `Authorization: Bearer $CRON_SECRET`, as
 * Vercel Cron does on Pro. See README → Deploying to Vercel.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (smsMode() === "disabled") return NextResponse.json({ skipped: "SMS_MODE=disabled" });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });

  try {
    const summary = await runDispatch(admin, new Date(), 15);
    return NextResponse.json({ mode: smsMode(), ...summary });
  } catch (err) {
    console.error("[cron] dispatch failed", (err as Error).message);
    return NextResponse.json({ error: "Dispatch failed" }, { status: 500 });
  }
}
