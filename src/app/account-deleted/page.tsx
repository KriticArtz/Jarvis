import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Account deleted" };

export default function AccountDeletedPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-5 py-5 sm:px-8">
        <Logo />
      </header>
      <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-[420px] animate-rise rounded-[32px] bg-surface p-8 text-center shadow-lift">
          <h1 className="text-[26px] font-bold leading-tight">Your account has been deleted</h1>
          <p className="mt-3 leading-relaxed text-muted">
            Your {brand.name} account and all of its data have been permanently removed. Thanks for giving it a try.
          </p>
          <ButtonLink href="/" size="lg" className="mt-7 w-full">
            Back to home
          </ButtonLink>
        </div>
      </main>
    </div>
  );
}
