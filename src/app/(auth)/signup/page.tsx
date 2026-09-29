import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../auth-form";
import { signUp } from "../actions";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mb-6 mt-1 text-muted">Takes a minute. Then we&apos;ll set up your goals together.</p>
      <AuthForm mode="signup" action={signUp} />
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
