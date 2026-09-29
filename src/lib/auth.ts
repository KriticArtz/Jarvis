import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/data/queries";
import type { Profile } from "@/lib/types/domain";

/**
 * Verified current user (JWT validated via getClaims) plus a request-scoped
 * Supabase client. Redirects to /login when there is no session.
 * Cached per request so layouts and pages share it.
 */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) redirect("/login");
  return { supabase, userId, email: (data.claims.email as string | undefined) ?? null };
});

/** Current user + profile. Redirects to onboarding if it isn't finished. */
export const requireOnboardedUser = cache(async () => {
  const { supabase, userId, email } = await requireUser();
  const profile = await getProfile(supabase, userId);
  if (!profile) redirect("/login");
  if (!profile.onboarding_completed_at) redirect("/onboarding");
  return { supabase, userId, email, profile: profile as Profile };
});

/** For server actions / route handlers: returns null instead of redirecting. */
export async function getSessionUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;
  return { supabase, userId };
}
