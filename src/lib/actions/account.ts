"use server";

import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSessionUser } from "@/lib/auth";
import { deleteUserAndData } from "@/lib/account/delete-account";
import { validateDeletionRequest } from "@/lib/account/deletion";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmPhoneVerification, startPhoneVerification } from "@/lib/verification/service";
import { NOT_SIGNED_IN, type ActionResult } from "./result";

/**
 * Permanently delete the signed-in account and all associated data.
 * Requires typing DELETE and (for email accounts) re-entering the password.
 */
export async function deleteAccount(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (session.isDemo) return { ok: false, error: "Demo accounts can't be deleted — use Reset demo instead." };

  const { data: claims } = await session.supabase.auth.getClaims();
  const email = (claims?.claims?.email as string | undefined) ?? null;
  const invalid = validateDeletionRequest({
    confirmation: String(formData.get("confirmation") ?? ""),
    password: String(formData.get("password") ?? ""),
    requiresPassword: Boolean(email),
  });
  if (invalid) return { ok: false, error: invalid };

  if (email) {
    // Re-authenticate with a throwaway client so the current session is untouched.
    const verifier = createSupabaseClient(supabaseUrl(), supabasePublishableKey(), { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await verifier.auth.signInWithPassword({ email, password: String(formData.get("password")) });
    if (error || data.user?.id !== session.userId) return { ok: false, error: "That password isn't correct." };
    await verifier.auth.signOut();
  }

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Account deletion isn't configured on this server yet. Please contact support." };

  const result = await deleteUserAndData(admin, session.userId);
  if (!result.ok) return { ok: false, error: "We couldn't delete your account. Please try again or contact support." };

  // Clear this browser's session cookies (the user no longer exists).
  await session.supabase.auth.signOut({ scope: "local" }).catch(() => {});
  redirect("/account-deleted");
}

export type VerificationActionResult = ActionResult & { devCode?: string | null };

export async function sendVerificationCode(): Promise<VerificationActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (session.isDemo) return { ok: false, error: "Phone verification isn't available in the demo." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Phone verification isn't configured on this server." };
  const res = await startPhoneVerification(admin, session.userId);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, message: `Code sent. It expires in ${res.expiresInMinutes} minutes.`, devCode: res.devCode };
}

export async function confirmVerificationCode(_prev: VerificationActionResult, formData: FormData): Promise<VerificationActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (session.isDemo) return { ok: false, error: "Phone verification isn't available in the demo." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Phone verification isn't configured on this server." };
  const res = await confirmPhoneVerification(admin, session.userId, String(formData.get("code") ?? ""));
  if (!res.ok) return { ok: false, error: res.error };
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/", "layout");
  return { ok: true, message: "Your phone number is verified." };
}
