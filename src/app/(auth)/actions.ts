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
}

const credentials = z.object({
  email: z.email("Enter a valid email address").trim().toLowerCase(),
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
    options: { emailRedirectTo: `${origin}/auth/callback?next=/onboarding` },
  });
  if (error) {
    logAuthError("signUp", error);
    return { error: friendlyAuthError(error), email };
  }

  // If email confirmation is disabled in Supabase, a session is returned immediately.
  if (data.session) redirect("/onboarding");
  return { message: "Check your email for a confirmation link to finish creating your account.", email };
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const parsed = z
    .object({ email: z.email("Enter a valid email address").trim().toLowerCase(), password: z.string().min(1, "Enter your password") })
    .safeParse({ email, password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code !== "invalid_credentials") logAuthError("signIn", error);
    return { error: friendlyAuthError(error), email };
  }

  redirect(safeNextPath(formData.get("next") as string | null));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.email("Enter a valid email address").trim().toLowerCase().safeParse(formData.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const origin = await siteOrigin();
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
  // Same response whether or not the account exists (prevents account enumeration).
  return { message: "If an account exists for that email, you'll receive a link to reset your password." };
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
