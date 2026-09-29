import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, MessageSquareText, Target, TrendingUp } from "lucide-react";
import { brand } from "@/config/brand";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: { absolute: `${brand.name} — ${brand.tagline}` } };

const steps = [
  {
    icon: Target,
    title: "Tell it what you're working toward",
    body: "Add your goals — workouts, studying, saving, a side business — and rank what matters most right now.",
  },
  {
    icon: CalendarClock,
    title: "Plan a day that actually fits",
    body: "Your assistant knows your schedule and commitments, and builds a realistic plan around your real free time.",
  },
  {
    icon: MessageSquareText,
    title: "Get a partner, not a to-do list",
    body: "Ask what to do with the two hours you have tonight. It answers with your goals and progress in mind.",
  },
  {
    icon: TrendingUp,
    title: "See what's working",
    body: "A weekly review built from what you actually did — not guesses — with honest suggestions for next week.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-2">
          <ButtonLink href="/login" variant="ghost" size="sm">
            Log in
          </ButtonLink>
          <ButtonLink href="/signup" size="sm">
            Get Started
          </ButtonLink>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-10 sm:px-8 md:grid-cols-[1.1fr_1fr] md:pt-20">
          <div className="animate-fade-in">
            <p className="mb-4 inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
              Personal AI accountability assistant
            </p>
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl">{brand.tagline}</h1>
            <p className="mt-5 text-lg font-medium text-foreground/80 sm:text-xl">{brand.subheadline}</p>
            <p className="mt-4 max-w-xl leading-relaxed text-muted">{brand.description}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/signup" size="lg">
                Get Started
              </ButtonLink>
              <ButtonLink href="#how-it-works" size="lg" variant="secondary">
                See How It Works
              </ButtonLink>
            </div>
          </div>

          <DemoConversation />
        </section>

        <section id="how-it-works" className="scroll-mt-8 border-t border-border bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 md:py-24">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
            <p className="mt-2 max-w-2xl text-muted">
              Most planners wait for you to open them. {brand.name} is built around the things you said you&apos;d do — and helps you
              follow through.
            </p>
            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              {steps.map((s, i) => (
                <div key={s.title} className="rounded-2xl border border-border bg-background p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                      <s.icon className="size-[18px]" aria-hidden />
                    </span>
                    <span className="text-sm font-medium text-muted">Step {i + 1}</span>
                  </div>
                  <h3 className="mt-4 font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 md:py-24">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Accountability your way</h2>
              <p className="mt-3 leading-relaxed text-muted">
                Choose how you want to be held accountable — gentle, balanced or direct. Your assistant adapts its tone, never its
                honesty. It only works with what you&apos;ve told it and what you&apos;ve actually done.
              </p>
            </div>
            <ul className="grid gap-3 text-sm">
              {[
                ["Gentle", "Encouraging, focused on the next small step."],
                ["Balanced", "Friendly and honest about what slipped."],
                ["Direct", "Concise, candid, pushes for a commitment."],
              ].map(([t, d]) => (
                <li key={t} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
                  <span className="font-semibold">{t}</span>
                  <span className="text-muted">{d}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-16 flex flex-col items-start gap-4 rounded-2xl bg-accent p-8 text-accent-foreground sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Start with one goal.</h2>
              <p className="mt-1 opacity-85">Setup takes about three minutes.</p>
            </div>
            <Link
              href="/signup"
              className="inline-flex h-12 items-center rounded-xl bg-surface px-6 font-medium text-foreground transition-opacity hover:opacity-90"
            >
              Get Started
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-sm text-muted sm:flex-row sm:justify-between sm:px-8">
          <span>
            © {new Date().getFullYear()} {brand.name}
          </span>
          <span>{brand.subheadline}</span>
        </div>
      </footer>
    </div>
  );
}

/** Static illustration of the assistant's behavior (clearly an example). */
function DemoConversation() {
  return (
    <div className="animate-fade-in rounded-3xl border border-border bg-surface p-4 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.25)] sm:p-6" aria-label="Example conversation">
      <p className="mb-4 text-xs font-medium uppercase tracking-wider text-muted">Example</p>
      <div className="flex flex-col gap-3 text-[15px] leading-relaxed">
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-accent-foreground">
          I only have two hours tonight. What should I do?
        </div>
        <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-surface-2 px-4 py-3">
          You&apos;re free from 7:00 to 9:00 after pickup. Based on your priorities, I&apos;d do:
          <ul className="mt-2 space-y-1">
            <li>• 45 min — coursework (you&apos;re at 2 of 5 hours this week)</li>
            <li>• 45 min — workout (3 of 4 done, one to go)</li>
            <li>• 30 min — business</li>
          </ul>
          <p className="mt-2">Study first so it doesn&apos;t get pushed too late.</p>
        </div>
      </div>
    </div>
  );
}
