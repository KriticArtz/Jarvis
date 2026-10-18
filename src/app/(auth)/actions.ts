"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { friendlyAuthError, logAuthError } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/origin";
import { safeNextPath } from "@/lib/routes";

export interface AuthState {
  error?: string;
  message?: string;
  email?: string;
  /** Set when sign-in failed because the email isn't confirmed yet (offers a resend). */
  unconfirmed?: boolean;
}

/** Where signup confirmation links land: the callback signs the user in, then onboarding. */
const CONFIRM_REDIRECT_PATH = "/auth/callback?next=/onboarding";

const emailField = z.email("Enter a valid email address").trim().toLowerCase();

const credentials = z.object({
  email: emailField,
  password: z.string().min(8, "Password must be at least 8 characters").max(72, "Password is too long"),
});

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const supabase = await createClient();
  // Leaving a demo: drop the anonymous demo session so the new account starts clean.
  const { data: current } = await supabase.auth.getClaims();
  if (current?.claims?.is_anonymous === true) await supabase.auth.signOut();
  const origin = await siteOrigin();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${origin}${CONFIRM_REDIRECT_PATH}` },
  });
  if (error) {
    logAuthError("signUp", error);
    return { error: friendlyAuthError(error), email };
  }

  // If email confirmation is disabled in Supabase, a session is returned immediately.
  if (data.session) redirect("/onboarding");
  return {
    message: "Check your inbox for a confirmation link to finish creating your account. If it isn't there in a few minutes, check your spam folder.",
    email,
  };
}

/** Same reply whether or not an unconfirmed account exists for the address (prevents account enumeration). */
const RESEND_CONFIRMATION_MESSAGE =
  "If that email is waiting to be confirmed, we've sent a new link. Check your inbox and spam folder.";

export async function resendConfirmation(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = emailField.safeParse(formData.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const origin = await siteOrigin();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data,
    options: { emailRedirectTo: `${origin}${CONFIRM_REDIRECT_PATH}` },
  });
  if (error) {
    logAuthError("resendConfirmation", error);
    const rateLimited =
      error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit";
    if (rateLimited) return { error: "Too many requests. Please wait a minute before asking for another email." };
    // Network failure or gateway outage: affects every address alike, so it's safe to say so.
    if (error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504) {
      return { error: friendlyAuthError(error) };
    }
    // Anything else gets the neutral reply so the response never reveals whether
    // an account exists: unknown or already-confirmed addresses, and a failed send
    // (Supabase's 500 "Error sending confirmation email" only happens for a real
    // unconfirmed account).
  }
  return { message: RESEND_CONFIRMATION_MESSAGE };
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const parsed = z
    .object({ email: emailField, password: z.string().min(1, "Enter your password") })
    .safeParse({ email, password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code !== "invalid_credentials") logAuthError("signIn", error);
    return { error: friendlyAuthError(error), email, unconfirmed: error.code === "email_not_confirmed" };
  }

  redirect(safeNextPath(formData.get("next") as string | null));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = emailField.safeParse(formData.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const origin = await siteOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
  // Logged for diagnostics only (the logger redacts email addresses).
  if (error) logAuthError("resetPasswordForEmail", error);
  // Same response whether or not the account exists or the send failed (prevents account enumeration).
  return {
    message: "If an account exists for that email, you'll receive a link to reset your password. Check your inbox and spam folder.",
  };
}

export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z
    .object({
      password: z.string().min(8, "Password must be at least 8 characters").max(72),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, { message: "Passwords don't match" })
    .safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return { error: "Your reset link has expired. Please request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logAuthError("updatePassword", error);
    return { error: friendlyAuthError(error) };
  }
  redirect("/dashboard");
}
