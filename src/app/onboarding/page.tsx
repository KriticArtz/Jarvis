import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCommitments, getGoals, getNotificationPreferences, getProfile } from "@/lib/data/queries";
import { Logo } from "@/components/logo";
import { OnboardingFlow } from "./onboarding-flow";

export const metadata: Metadata = { title: "Get set up" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const { supabase, userId } = await requireUser();
  const profile = await getProfile(supabase, userId);
  if (!profile) redirect("/login");
  if (profile.onboarding_completed_at) redirect("/dashboard");

  const [goals, commitments, prefs] = await Promise.all([
    getGoals(supabase, userId, ["active", "paused"]),
    getCommitments(supabase, userId),
    getNotificationPreferences(supabase, userId),
  ]);

  const params = await searchParams;
  const requested = Number(params.step);
  // Can't jump ahead of saved progress; can go back to any earlier step.
  const step = Number.isInteger(requested) && requested >= 1 && requested <= profile.onboarding_step ? requested : profile.onboarding_step;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-5 py-5 sm:px-8">
        <Logo href="/onboarding" />
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pb-16">
        <OnboardingFlow
          step={Math.min(Math.max(step, 1), 6)}
          profile={profile}
          goals={goals}
          commitments={commitments}
          smsConsented={Boolean(prefs?.sms_enabled && prefs.sms_consent_at)}
        />
      </main>
    </div>
  );
}
