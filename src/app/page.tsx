import type { Metadata } from "next";
import { ArrowRight, CalendarClock, MessageSquareText, Target, TrendingUp } from "lucide-react";
import { brand } from "@/config/brand";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";
import { PhoneMock } from "@/components/marketing/phone-mock";

export const metadata: Metadata = { title: { absolute: `${brand.name} — ${brand.tagline}` } };

const features = [
  {
    icon: Target,
    title: "It knows what you're working toward",
    body: "Workouts, coursework, savings, a side business — rank what matters most and your assistant keeps it front and center.",
  },
  {
    icon: CalendarClock,
    title: "It plans a day that actually fits",
    body: "It works around your real schedule and commitments, and never plans over the things you can't move.",
  },
  {
    icon: MessageSquareText,
    title: "It checks in — and you can text back",
    body: "A nudge before the workout you planned. A question at the end of the day. Reply like you would to a friend.",
  },
  {
    icon: TrendingUp,
    title: "It shows you what's working",
    body: "A weekly review built only from what you actually did, with honest suggestions for next week.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="sticky top-0 z-20 border-b border-transparent bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
          <Logo />
          <nav className="flex items-center gap-1.5">
            <ButtonLink href="/login" variant="ghost" size="sm" className="text-foreground">
              Log in
            </ButtonLink>
            <ButtonLink href="/signup" size="sm">
              Get Started
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative">
          <div aria-hidden className="bg-assistant pointer-events-none absolute inset-x-0 top-0 h-[560px] opacity-70 blur-3xl" />
          <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-14 text-center sm:px-8 md:pt-24">
            <p className="mx-auto inline-flex animate-fade-in items-center gap-2 rounded-full bg-surface px-3.5 py-1.5 text-[13px] font-medium text-muted shadow-card">
              <span className="size-1.5 rounded-full bg-brand-gradient" /> Personal AI accountability assistant
            </p>
            <h1 className="mx-auto mt-6 max-w-4xl animate-rise text-[44px] font-bold leading-[1.04] tracking-[-0.035em] sm:text-[64px] md:text-[76px]">
              Your AI <span className="text-gradient">accountability partner.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl animate-rise text-[20px] font-medium text-foreground/85 [animation-delay:80ms] sm:text-[24px]">{brand.subheadline}</p>
            <p className="mx-auto mt-4 max-w-2xl animate-rise text-[17px] leading-relaxed text-muted [animation-delay:140ms]">{brand.description}</p>
            <div className="mt-9 flex animate-rise flex-col items-center justify-center gap-3 [animation-delay:200ms] sm:flex-row">
              <ButtonLink href="/signup" size="lg" className="w-full sm:w-auto">
                Get Started
              </ButtonLink>
              <ButtonLink href="/demo" size="lg" variant="secondary" className="w-full sm:w-auto">
                Try the live demo <ArrowRight className="size-4" />
              </ButtonLink>
            </div>
            <a href="#how-it-works" className="mt-5 inline-block text-[15px] font-medium text-accent hover:underline">
              See How It Works
            </a>

            <div className="relative mx-auto mt-16 flex max-w-4xl flex-col items-center gap-10 md:flex-row md:items-center md:justify-center md:gap-14">
              <PhoneMock
                messages={[
                  { from: "ai", text: "You said you'd work out at 7. Still happening?", time: "Today 6:45 PM" },
                  { from: "me", text: "Can't tonight, work ran late." },
                  { from: "ai", text: "Got it — let's adjust. You're free at 7 tomorrow before class. Want to plan it then?" },
                  { from: "me", text: "Yes. What should I focus on tonight instead?" },
                  { from: "ai", text: "You've got about 2 hours. Do 45 min on your capstone first — you're at 2 of 5 hours this week." },
                ]}
              />
              <div className="max-w-sm text-left">
                <h2 className="text-[28px] font-bold leading-tight">It doesn&apos;t wait for you to open an app.</h2>
                <p className="mt-3 text-[17px] leading-relaxed text-muted">
                  {brand.name} remembers your goals, your schedule and what you said you&apos;d do — and follows up. When plans change, it helps you
                  adjust instead of letting the day slip.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-16 bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
            <p className="text-[14px] font-semibold uppercase tracking-[0.1em] text-accent">How it works</p>
            <h2 className="mt-2 max-w-2xl text-[34px] font-bold leading-tight sm:text-[44px]">From “I should” to “I did.”</h2>
            <div className="mt-12 grid gap-x-10 gap-y-12 sm:grid-cols-2">
              {features.map((f) => (
                <div key={f.title}>
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                    <f.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-[21px] font-semibold">{f.title}</h3>
                  <p className="mt-2 text-[16px] leading-relaxed text-muted">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div>
              <h2 className="text-[34px] font-bold leading-tight sm:text-[40px]">Accountability, your way.</h2>
              <p className="mt-4 text-[17px] leading-relaxed text-muted">
                Choose how you want to be held accountable. Your assistant adapts its tone — never its honesty. It only works with what
                you&apos;ve told it and what you&apos;ve actually done.
              </p>
            </div>
            <ul className="flex flex-col gap-3">
              {[
                ["Gentle", "Encouraging, focused on the next small step."],
                ["Balanced", "Friendly and honest about what slipped."],
                ["Direct", "Concise, candid, pushes for a commitment."],
              ].map(([t, d]) => (
                <li key={t} className="rounded-[22px] bg-surface p-5 shadow-card">
                  <p className="font-semibold">{t}</p>
                  <p className="mt-0.5 text-[15px] text-muted">{d}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-brand-gradient relative mt-24 overflow-hidden rounded-[36px] px-8 py-14 text-center text-white sm:py-16">
            <h2 className="text-[32px] font-bold leading-tight sm:text-[40px]">Start with one goal.</h2>
            <p className="mt-2 text-[17px] opacity-90">Setup takes about three minutes. Or look around first.</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink href="/signup" size="lg" className="w-full bg-white text-[#0b3b4a] hover:bg-white/90 sm:w-auto">
                Get Started
              </ButtonLink>
              <ButtonLink href="/demo" size="lg" className="w-full bg-white/15 text-white hover:bg-white/25 sm:w-auto">
                Try the live demo
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-[14px] text-muted sm:flex-row sm:justify-between sm:px-8">
          <span>
            © {new Date().getFullYear()} {brand.name}
          </span>
          <span>{brand.subheadline}</span>
        </div>
      </footer>
    </div>
  );
}
