import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../auth-form";
import { requestPasswordReset } from "../actions";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mb-6 mt-1 text-muted">We&apos;ll email you a link to choose a new one.</p>
      <AuthForm mode="forgot" action={requestPasswordReset} />
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-accent hover:underline">
          Back to log in
        </Link>
      </p>
    </>
  );
}
