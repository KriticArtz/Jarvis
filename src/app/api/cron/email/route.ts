import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { cronSecret, emailMode, emailScheduleEnabled } from "@/lib/env";
import { runEmailDispatch } from "@/lib/email/dispatch";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorInfo, logError } from "@/lib/observability/log";

export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = cronSecret();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Scheduled email check-ins (morning / afternoon / evening, in each user's
 * timezone). Meant to run every 15 minutes; any scheduler can call it with
 * `Authorization: Bearer $CRON_SECRET`. Does nothing unless
 * EMAIL_SCHEDULE_ENABLED=true. Repeated or overlapping calls are safe: each
 * slot is sent at most once per user per day. See docs/email.md.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!emailScheduleEnabled()) return NextResponse.json({ skipped: "EMAIL_SCHEDULE_ENABLED is not true" });
  const mode = emailMode();
  if (mode === "disabled") return NextResponse.json({ skipped: "EMAIL_MODE=disabled" });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });

  try {
    const summary = await runEmailDispatch(admin, new Date());
    return NextResponse.json({ mode, ...summary });
  } catch (err) {
    logError("cron", "email dispatch failed", errorInfo(err));
    return NextResponse.json({ error: "Dispatch failed" }, { status: 500 });
  }
}
