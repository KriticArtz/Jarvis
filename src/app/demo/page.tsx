import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, MessageCircle, Target, TrendingUp } from "lucide-react";
import { brand } from "@/config/brand";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";
import { PhoneMock } from "@/components/marketing/phone-mock";
import { StartDemoForm } from "./start-demo-form";

export const metadata: Metadata = {
  title: "Interactive demo",
  description: `Explore ${brand.name} as if it were your personal AI accountability partner.`,
};

const tryThese = [
  { icon: MessageCircle, title: "Ask your assistant", body: "“I only have two hours tonight. What should I do?”" },
  { icon: CalendarClock, title: "Plan your day", body: "A realistic plan built around a real schedule." },
  { icon: Target, title: "Check off a task", body: "Watch goal progress update instantly." },
  { icon: TrendingUp, title: "Read the weekly review", body: "What went well, what slipped — from actual data." },
];

export default async function DemoPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const inDemo = claims?.is_anonymous === true;
  const signedInForReal = Boolean(claims?.sub) && !inDemo;

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <div aria-hidden className="bg-assistant pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-80 blur-3xl" />
      <header className="relative mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
        <Logo />
        <ButtonLink href="/signup" variant="ghost" size="sm">
          Create account
        </ButtonLink>
      </header>

      <main className="relative mx-auto max-w-5xl px-5 pb-20 sm:px-8">
        <section className="mx-auto flex max-w-xl flex-col items-center pt-8 text-center sm:pt-14">
          <p className="inline-flex animate-fade-in items-center gap-2 rounded-full bg-surface px-3.5 py-1.5 text-[13px] font-medium text-muted shadow-card">
            <span className="size-1.5 rounded-full bg-brand-gradient" /> Interactive demo · no sign-up needed
          </p>
          <h1 className="mt-6 animate-rise text-[40px] font-bold leading-[1.05] tracking-[-0.03em] sm:text-[56px]">
            Meet your AI <span className="text-gradient">accountability partner.</span>
          </h1>
          <p className="mt-5 animate-rise text-[18px] leading-relaxed text-muted [animation-delay:80ms]">
            This is an interactive demo. Explore {brand.name} as if it were your personal AI accountability partner.
          </p>
          <p className="mt-2 animate-rise text-[15px] text-muted [animation-delay:120ms]">
            You&apos;ll step into a sample week — goals, a schedule and real progress — and can talk to the assistant yourself.
          </p>

          <div className="mt-8 w-full max-w-sm animate-rise [animation-delay:180ms]">
            {inDemo ? (
              <div className="flex flex-col gap-3">
                <ButtonLink href="/dashboard" size="lg" className="w-full">
                  Continue your demo
                </ButtonLink>
                <StartDemoForm label="Start over with a fresh demo" />
              </div>
            ) : (
              <StartDemoForm />
            )}
            {signedInForReal ? (
              <p className="mt-3 text-[13px] text-muted">
                You&apos;re signed in to your own account. Starting the demo signs you out first — your account isn&apos;t affected.
              </p>
            ) : (
              <p className="mt-3 text-[13px] text-muted">Sample data only. Nothing you do here touches anyone&apos;s real account.</p>
            )}
          </div>
        </section>

        <section className="mt-16 grid items-center gap-12 md:grid-cols-[1fr_auto] md:gap-16">
          <div>
            <h2 className="text-[26px] font-bold leading-tight sm:text-[30px]">Things to try</h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {tryThese.map((t, i) => (
                <li key={t.title} className="animate-rise rounded-[24px] bg-surface p-5 shadow-card" style={{ animationDelay: `${240 + i * 70}ms` }}>
                  <span className="flex size-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                    <t.icon className="size-5" aria-hidden />
                  </span>
                  <p className="mt-3 font-semibold">{t.title}</p>
                  <p className="mt-1 text-[15px] leading-relaxed text-muted">{t.body}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col items-center gap-3">
            <PhoneMock
              messages={[
                { from: "ai", text: "You said you'd work out at 6. Still happening?", time: "Today 5:45 PM" },
                { from: "me", text: "Can't tonight, work ran late." },
                { from: "ai", text: "Got it. You're free at 6 tomorrow after your commute — want to plan it then?" },
              ]}
            />
            <p className="max-w-[300px] text-center text-[13px] text-muted">In your own account, {brand.name} also checks in by text — and you can reply.</p>
          </div>
        </section>

        <p className="mt-16 text-center text-[15px] text-muted">
          Ready for the real thing?{" "}
          <Link href="/signup" className="font-medium text-accent hover:underline">
            Create your own {brand.name}
          </Link>
        </p>
        <p className="mt-4 text-center text-[13px] text-muted">
          By starting the demo you agree to our <Link href="/terms" className="underline-offset-2 hover:underline">Terms</Link> and{" "}
          <Link href="/privacy" className="underline-offset-2 hover:underline">Privacy Policy</Link>.
        </p>
      </main>
    </div>
  );
}
