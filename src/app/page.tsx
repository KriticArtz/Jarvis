import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, MessageCircle, Play, Target, TrendingUp } from "lucide-react";
import { brand } from "@/config/brand";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";
import { LegalLinks } from "@/components/legal/legal-links";
import { PERSONALITY_OPTIONS } from "@/lib/personalization";
import { Reveal } from "@/components/marketing/landing/reveal";
import { delay } from "@/components/marketing/landing/parts";
import { HeroScene } from "@/components/marketing/landing/hero-scene";
import { ContextScene } from "@/components/marketing/landing/context-scene";
import { ActionScene } from "@/components/marketing/landing/action-scene";
import { SmsScene } from "@/components/marketing/landing/sms-scene";
import { BiggerPictureScene } from "@/components/marketing/landing/bigger-picture-scene";
import { PersonalityScene } from "@/components/marketing/landing/personality-scene";
import { CompareScene } from "@/components/marketing/landing/compare-scene";
import { AppearanceToggle, appearanceBootScript } from "@/components/marketing/landing/appearance-toggle";

export const metadata: Metadata = { title: { absolute: `${brand.name} — ${brand.tagline}` } };

const DEMO_TRIES = [
  { icon: MessageCircle, text: "“I only have two hours tonight. What should I do?”" },
  { icon: CalendarClock, text: "Plan a day around a real schedule" },
  { icon: Target, text: "Check off a task and watch your goals move" },
  { icon: TrendingUp, text: "Read an honest weekly review" },
];

/** A thin line + label that carries the story from one scene into the next. */
function Thread({ label }: { label: string }) {
  return (
    <div aria-hidden className="flex flex-col items-center">
      <span className="h-12 w-px bg-gradient-to-b from-transparent to-[color-mix(in_oklab,var(--accent)_55%,transparent)]" />
      <span className="glass rounded-full px-3 py-1 text-[12px] font-medium text-muted">{label}</span>
      <span className="h-12 w-px bg-gradient-to-b from-[color-mix(in_oklab,var(--accent)_55%,transparent)] to-transparent" />
    </div>
  );
}

/** Low-key, repeated nudge toward the demo. */
function DemoNudge({ text }: { text: string }) {
  return (
    <p className="mx-auto flex max-w-6xl justify-center px-5 sm:px-8">
      <Link
        href="/demo"
        className="group inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[15px] font-medium text-accent transition-colors hover:bg-accent-soft"
      >
        {text} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </p>
  );
}

/**
 * Public landing page. Light/Dark uses the app's appearance modes and tokens
 * (data-mode on the wrapper): it follows the system until the visitor picks
 * one with the toggle, which is remembered in this browser. Product name and
 * taglines come from src/config/brand.ts.
 */
export default function LandingPage() {
  return (
    // The boot script may set data-mode before hydration (saved choice), hence suppressHydrationWarning.
    <div data-mode="system" suppressHydrationWarning className="landing min-h-dvh overflow-x-hidden">
      <script dangerouslySetInnerHTML={{ __html: appearanceBootScript }} />
      <noscript>
        <style>{`.landing .r{opacity:1!important;transform:none!important}.landing .typing{display:none}`}</style>
      </noscript>

      <header className="sticky top-0 z-30 border-b border-hairline bg-background/70 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <Logo />
          <nav className="flex items-center gap-1.5 sm:gap-2" aria-label="Main">
            <AppearanceToggle />
            <span className="hidden sm:block">
              <ButtonLink href="/login" variant="ghost" size="sm" className="text-foreground">
                Log in
              </ButtonLink>
            </span>
            <ButtonLink href="/demo" size="sm" className="h-10 sm:h-9">
              Try the Demo
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main>
        {/* 1 — Hero */}
        <section className="relative" aria-labelledby="hero-title">
          <div aria-hidden className="grid-fade pointer-events-none absolute inset-x-0 top-0 h-[720px]" />
          <Reveal threshold={0} className="relative mx-auto max-w-6xl px-5 pb-16 pt-10 text-center sm:px-8 sm:pt-14 md:pb-24 md:pt-16">
            <p className="r glass mx-auto inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-medium text-muted">
              <span className="relative flex size-2">
                <span className="ping absolute inset-0 rounded-full" />
                <span className="relative size-2 rounded-full bg-brand-gradient" />
              </span>
              Your {brand.category}
            </p>
            <h1 id="hero-title" className="r mx-auto mt-6 max-w-4xl text-[46px] font-bold leading-[1.02] tracking-[-0.045em] sm:text-[68px] md:text-[84px]" style={delay(80)}>
              Your AI should <span className="text-gradient">know your life.</span>
            </h1>
            <p className="r mx-auto mt-5 max-w-2xl text-[18px] leading-relaxed text-muted sm:text-[20px]" style={delay(160)}>
              Tell it what you&apos;re trying to accomplish. {brand.name} understands your calendar, goals, and routines — it helps you plan your time, checks
              in when it matters, and helps you actually follow through.
            </p>
            <div className="r mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row" style={delay(240)}>
              <ButtonLink href="/demo" size="lg" className="w-full shadow-[0_12px_32px_-12px_var(--accent)] sm:w-auto">
                <Play className="size-4 fill-current" aria-hidden /> Try the Demo
              </ButtonLink>
            </div>
            <p className="r mt-4 text-[13.5px] text-muted" style={delay(300)}>
              No sign-up needed.{" "}
              <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
                Or create your account
              </Link>
            </p>
            <HeroScene />
          </Reveal>
        </section>

        {/* 2 — The difference */}
        <CompareScene />

        <Thread label="It starts with context" />

        {/* 3 — Context */}
        <ContextScene />

        <Thread label="Then it acts" />

        {/* 4 — Actions */}
        <ActionScene />
        <DemoNudge text="See what it feels like — try the demo" />

        {/* 5 — Proactive check-ins by SMS */}
        <SmsScene />

        <Thread label="It sees more than your calendar" />

        {/* 6 — Health as context */}
        <BiggerPictureScene />
        <DemoNudge text="Try it with a full sample week" />

        {/* 6 — Personalization */}
        <PersonalityScene options={PERSONALITY_OPTIONS.map(({ value, title, body, example }) => ({ value, title, body, example }))} />

        {/* 7 — Demo CTA */}
        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8 md:pb-28" aria-labelledby="demo-title">
          <Reveal className="r glass glow relative overflow-hidden rounded-[32px]">
            <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-[420px] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--grad-from)_30%,transparent),transparent)]" />
            <div className="relative grid items-center gap-8 p-7 sm:p-10 md:grid-cols-[1.2fr_1fr] md:p-12">
              <div>
                <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-accent">Live demo</p>
                <h2 id="demo-title" className="mt-3 text-[32px] font-bold leading-[1.08] tracking-[-0.03em] sm:text-[42px]">
                  See what it feels like to have an AI that knows what you&apos;re working toward.
                </h2>
                <p className="mt-4 text-[17px] text-muted">A full account with goals, a schedule and history — ready in one click. Nothing to set up.</p>
                <ButtonLink href="/demo" size="lg" className="mt-7 w-full shadow-[0_12px_32px_-12px_var(--accent)] sm:w-auto">
                  <Play className="size-4 fill-current" aria-hidden /> Try the Demo
                </ButtonLink>
              </div>
              <ul className="flex flex-col gap-2.5" aria-label="Things to try in the demo">
                {DEMO_TRIES.map((t, i) => (
                  <li key={t.text} className="r flex items-center gap-3 rounded-2xl bg-surface-2/70 px-4 py-3 text-[15px]" style={delay(150 + i * 90)}>
                    <t.icon className="size-[18px] shrink-0 text-accent" aria-hidden /> {t.text}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </section>

        {/* 8 — Final CTA */}
        <section className="relative overflow-hidden border-t border-hairline" aria-labelledby="final-title">
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-full h-[520px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--grad-to)_35%,transparent),transparent)]" />
          <Reveal className="relative mx-auto max-w-4xl px-5 py-24 text-center sm:px-8 md:py-32">
            <h2 id="final-title" className="r text-[42px] font-bold leading-[1.02] tracking-[-0.04em] sm:text-[64px]">
              Stop keeping your life <span className="text-gradient">in your head.</span>
            </h2>
            <p className="r mx-auto mt-5 max-w-xl text-[18px] text-muted sm:text-[20px]" style={delay(100)}>
              Give your AI the context. Let it help you figure out what comes next.
            </p>
            <div className="r mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row" style={delay(200)}>
              <ButtonLink href="/demo" size="lg" className="w-full shadow-[0_12px_32px_-12px_var(--accent)] sm:w-auto">
                <Play className="size-4 fill-current" aria-hidden /> Try the Demo
              </ButtonLink>
              <ButtonLink href="/signup" size="lg" variant="ghost" className="w-full text-foreground sm:w-auto">
                Get Started <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
            </div>
          </Reveal>
        </section>
      </main>

      {/* 9 — Footer */}
      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-[14px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span className="flex items-center gap-3">
            <Logo className="text-foreground" />
            <span>
              © {new Date().getFullYear()} {brand.name}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/demo" className="hover:text-foreground hover:underline">
              Demo
            </Link>
            <Link href="/login" className="hover:text-foreground hover:underline">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-foreground hover:underline">
              Sign up
            </Link>
            <LegalLinks />
          </span>
        </div>
      </footer>
    </div>
  );
}
