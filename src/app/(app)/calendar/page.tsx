import type { Metadata } from "next";
import { after } from "next/server";
import { requireOnboardedUser } from "@/lib/auth";
import { localDate } from "@/lib/time";
import { createAdminClient } from "@/lib/supabase/admin";
import { googleOAuthConfig, integrationsEncryptionKey, supabaseServiceKey } from "@/lib/env";
import { loadCalendarPage } from "@/lib/integrations/calendar/page-data";
import { syncIfStale } from "@/lib/integrations/calendar/sync";
import { parseCalendarParams, viewRange } from "@/lib/integrations/calendar/view";
import { CalendarApp } from "@/components/calendar/calendar-app";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const { supabase, userId, profile, isDemo } = await requireOnboardedUser();
  const params = await searchParams;
  const tz = profile.timezone || "UTC";
  const today = localDate(tz);
  const { view, date } = parseCalendarParams({ view: params.view, date: params.date }, today);
  const { from, days } = viewRange(view, date);
  const data = await loadCalendarPage(supabase, userId, { tz, today, from, days, isDemo });

  // Keep the regular window fresh without slowing this render.
  if (!isDemo && data.state !== "not_connected") {
    after(async () => {
      const admin = createAdminClient();
      if (admin) await syncIfStale(admin, userId, 60).catch(() => null);
    });
  }

  return (
    <CalendarApp
      view={view}
      date={date}
      today={today}
      timezone={tz}
      days={data.days}
      state={data.state}
      lastSyncedAt={data.lastSyncedAt}
      isDemo={isDemo}
      configured={Boolean(googleOAuthConfig() && integrationsEncryptionKey() && supabaseServiceKey())}
    />
  );
}
