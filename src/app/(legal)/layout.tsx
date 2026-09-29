import Link from "next/link";
import { Logo } from "@/components/logo";
import { LegalLinks } from "@/components/legal/legal-links";

export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <Link href="/" className="text-[15px] font-medium text-accent hover:opacity-80">
          Home
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-20 sm:px-8">
        <article className="rounded-[28px] bg-surface p-6 shadow-card sm:p-10 [&_h2]:mt-9 [&_h2]:text-[20px] [&_h2]:font-semibold [&_li]:mt-1.5 [&_p]:mt-3 [&_p]:leading-relaxed [&_p]:text-foreground/85 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-foreground/85">
          {children}
        </article>
        <p className="mt-6 text-center text-[14px] text-muted">
          <LegalLinks />
        </p>
      </main>
    </div>
  );
}
