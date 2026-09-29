import type { Metadata } from "next";
import Link from "next/link";
import { safeNextPath } from "@/lib/routes";
import { AuthForm } from "../auth-form";
import { signIn } from "../actions";

export const metadata: Metadata = { title: "Log in" };

const ERRORS: Record<string, string> = {
  auth_callback: "That link is invalid or has expired. Please try again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  return (
    <>
      <h1 className="text-[28px] font-bold leading-tight">Welcome back</h1>
      <p className="mb-6 mt-1 text-muted">Log in to pick up where you left off.</p>
      <AuthForm mode="login" action={signIn} next={next} initialError={error} />
      <p className="mt-6 text-center text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
