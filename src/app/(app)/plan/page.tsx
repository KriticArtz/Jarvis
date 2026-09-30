import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth";
import { isAIConfigured } from "@/lib/ai/client";
import { getGoals, getLatestPlan } from "@/lib/data/queries";
import { formatLongDate, localDate } from "@/lib/time";
import { resolvePersonalization } from "@/lib/personalization";
import { FormMessage } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/card";
import { PlanBuilder } from "@/components/plan/plan-builder";
import { calendarWriteState } from "@/lib/integrations/calendar/mutations";

export const metadata: Metadata = { title: "Plan my day" };

export default async function PlanPage() {
  const { supabase, userId, profile, isDemo } = await requireOnboardedUser();
  const today = localDate(profile.timezone || "UTC");
  const [plan, goals, accepted, calendarState] = await Promise.all([
    getLatestPlan(supabase, userId, today),
    getGoals(supabase, userId, ["active"]),
    supabase.from("daily_plans").select("id").eq("user_id", userId).eq("plan_date", today).eq("status", "accepted").limit(1),
    isDemo ? Promise.resolve("not_connected" as const) : calendarWriteState(supabase, userId),
  ]);
  const hasAccepted = Boolean(accepted.data?.length);

  return (
    <>
      <Link href="/dashboard" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" /> Today
      </Link>
      <PageHeader title="Plan my day" subtitle={`${formatLongDate(today)} · with ${resolvePersonalization(profile).assistantName}`} />
      {hasAccepted && plan?.status !== "draft" ? (
        <div className="mb-5">
          <FormMessage tone="success">
            Today&apos;s plan is saved. <Link href="/dashboard" className="font-medium underline">See it on Today</Link> — or build a new one below.
          </FormMessage>
        </div>
      ) : null}
      <PlanBuilder
        draft={plan?.status === "draft" ? plan : null}
        calendarWritable={calendarState === "writable"}
        hasAcceptedPlan={hasAccepted}
        knowsWakingHours={Boolean(profile.wake_time && profile.sleep_time)}
        goals={goals.map((g) => ({ id: g.id, title: g.title }))}
        aiConfigured={isAIConfigured()}
      />
    </>
  );
}
