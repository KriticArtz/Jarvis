import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../auth-form";
import { signUp } from "../actions";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-[28px] font-bold leading-tight">Create your account</h1>
      <p className="mb-6 mt-1 text-muted">Takes a minute. Then we&apos;ll set up your goals together.</p>
      <AuthForm mode="signup" action={signUp} />
      <p className="mt-4 text-center text-[13px] leading-relaxed text-muted">
        By creating an account, you agree to our{" "}
        <Link href="/terms" className="font-medium text-foreground/80 underline-offset-2 hover:underline">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="font-medium text-foreground/80 underline-offset-2 hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
