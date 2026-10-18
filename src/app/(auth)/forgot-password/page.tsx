import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../auth-form";
import { requestPasswordReset } from "../actions";

export const metadata: Metadata = { title: "Reset your password" };

const ERRORS: Record<string, string> = {
  link_expired: "That password reset link is invalid or has expired. Enter your email and we'll send you a new one.",
};

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  return (
    <>
      <h1 className="text-[28px] font-bold leading-tight">Reset your password</h1>
      <p className="mb-6 mt-1 text-muted">We&apos;ll email you a link to choose a new one.</p>
      <AuthForm mode="forgot" action={requestPasswordReset} initialError={error} />
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-accent hover:underline">
          Back to log in
        </Link>
      </p>
    </>
  );
}
