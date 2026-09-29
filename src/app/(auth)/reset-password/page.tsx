import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { AuthForm } from "../auth-form";
import { updatePassword } from "../actions";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  // The reset email link signs the user in via /auth/callback first.
  await requireUser();
  return (
    <>
      <h1 className="text-[28px] font-bold leading-tight">Choose a new password</h1>
      <p className="mb-6 mt-1 text-muted">You&apos;ll stay signed in after updating it.</p>
      <AuthForm mode="reset" action={updatePassword} />
    </>
  );
}
