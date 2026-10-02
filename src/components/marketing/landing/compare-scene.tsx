import type { CSSProperties } from "react";
import { ArrowRight, Bell, Brain, CalendarCheck, MessageSquare, MessagesSquare, RefreshCw, Sparkles, Target, Wand2 } from "lucide-react";
import { AssistantAvatar } from "@/components/app/assistant-avatar";
import { Reveal } from "./reveal";
import { ASSISTANT, delay } from "./parts";

const LOOP = [
  { icon: Target, label: "Tell it what matters" },
  { icon: Brain, label: "Remembers context" },
  { icon: Sparkles, label: "Plans" },
  { icon: Wand2, label: "Acts" },
  { icon: Bell, label: "Checks in" },
  { icon: RefreshCw, label: "Adapts" },
];
const CYCLE = 6.6; // seconds for the highlight to travel the loop

const RECOVERY = [
  {
    user: "Didn't get my workout in today.",
    reply: "That's okay. You've still got 40 minutes tonight. Want to move it there, or leave today and adjust the rest of the week?",
  },
  {
    user: "I didn't finish the project.",
    reply: "No problem. You have 45 minutes free tomorrow morning. Want me to build that into your plan?",
  },
];

/**
 * "ChatGPT answers. Jarvis follows through." Not a knock on general AI — a
 * fair picture of the difference: general AI is built around a conversation;
 * Jarvis is built around continuity with your goals, schedule and progress
 * (a highlight travels through the loop continuously). Then two examples of
 * how it helps when the day doesn't go to plan.
 */
export function CompareScene() {
  return (
    <section className="relative mx-auto max-w-6xl px-5 pb-10 pt-6 sm:px-8 md:pb-14 md:pt-10" aria-labelledby="compare-title">
      <Reveal className="text-center">
        <p className="r text-[13px] font-semibold uppercase tracking-[0.14em] text-accent">The difference</p>
        <h2 id="compare-title" className="r mx-auto mt-3 max-w-3xl text-[36px] font-bold leading-[1.04] tracking-[-0.035em] sm:text-[54px]" style={delay(60)}>
          ChatGPT answers.
          <br />
          <span className="text-gradient">{ASSISTANT} follows through.</span>
        </h2>
        <p className="r mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-muted sm:text-[18px]" style={delay(120)}>
          General AI is great at answers. {ASSISTANT} is built for what happens next — it stays with your goals, your schedule and your progress from
          one day to the next.
        </p>
      </Reveal>

      <Reveal threshold={0.25} className="mt-12 flex flex-col gap-4 md:mt-14">
        {/* General AI: a line that ends */}
        <div className="r glass rounded-[24px] p-4 sm:p-5" style={delay(100)}>
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">General AI chat</p>
          <ol className="flex flex-wrap items-center gap-2 sm:gap-3" aria-label="Ask, answer, conversation">
            {[
              { icon: MessageSquare, label: "Ask" },
              { icon: Sparkles, label: "Answer" },
            ].map((n, i) => (
              <li key={n.label} className="flex items-center gap-2 sm:gap-3">
                <span className="inline-flex min-h-10 items-center gap-2 rounded-full bg-surface-2 px-3.5 text-[14px] font-medium">
                  <n.icon className="size-4 text-muted" aria-hidden /> {n.label}
                </span>
                {i === 0 ? <ArrowRight className="size-4 text-muted" aria-hidden /> : null}
              </li>
            ))}
            <li className="flex items-center gap-2 sm:gap-3">
              <ArrowRight className="size-4 text-muted" aria-hidden />
              <span className="inline-flex min-h-10 items-center gap-2 rounded-full bg-surface-2 px-3.5 text-[14px] font-medium">
                <MessagesSquare className="size-4 text-muted" aria-hidden /> Conversation
              </span>
            </li>
          </ol>
          <p className="mt-3 text-[13.5px] text-muted">Great for questions, ideas and drafts. Turning the answer into a routine is up to you.</p>
        </div>

        {/* Jarvis: a loop that keeps going */}
        <div className="r glass glow relative overflow-hidden rounded-[24px] p-4 sm:p-6" style={delay(250)}>
          <div className="mb-4 flex items-center gap-2.5">
            <AssistantAvatar name={ASSISTANT} className="size-7 text-[12px]" />
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent">{ASSISTANT}</p>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-muted">
              <RefreshCw className="size-3.5" aria-hidden /> Keeps going
            </span>
          </div>
          <ol className="relative grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 lg:gap-0" aria-label="Tell it what matters, it remembers the context, plans, acts, checks in and adapts — then repeats">
            {/* Track connecting the steps (wide screens) */}
            <span aria-hidden className="absolute inset-x-[8%] top-[22px] hidden h-px bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--accent)_45%,transparent)_10%,color-mix(in_oklab,var(--accent)_45%,transparent)_90%,transparent)] lg:block" />
            {LOOP.map((n, i) => (
              <li key={n.label} className="relative flex flex-col items-center gap-2 rounded-2xl p-2.5 text-center lg:p-1">
                <span
                  className="loop-node relative flex size-11 items-center justify-center rounded-full bg-surface-2 text-accent"
                  style={{ "--i": i, "--n": LOOP.length, "--cycle": `${CYCLE}s` } as CSSProperties}
                >
                  <n.icon className="size-[18px]" aria-hidden />
                </span>
                <span className="text-[13.5px] font-medium leading-tight">{n.label}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex items-center justify-center gap-2 text-[13px] text-muted">
            <RefreshCw className="size-3.5 text-accent" aria-hidden />
            <span>…and it starts again tomorrow, already knowing what happened today.</span>
          </div>
          <div className="mt-4 grid gap-2 border-t border-hairline pt-4 text-[13.5px] sm:grid-cols-3">
            <p className="flex items-center gap-2">
              <CalendarCheck className="size-4 shrink-0 text-success" aria-hidden /> Puts the plan on your calendar
            </p>
            <p className="flex items-center gap-2">
              <Bell className="size-4 shrink-0 text-success" aria-hidden /> Texts you when it matters
            </p>
            <p className="flex items-center gap-2">
              <RefreshCw className="size-4 shrink-0 text-success" aria-hidden /> Adjusts when plans change
            </p>
          </div>
        </div>
      </Reveal>

      {/* When the day doesn't go to plan: recover and keep going — never a guilt trip. */}
      <Reveal threshold={0.25} className="mt-10 md:mt-12">
        <p className="r text-center text-[13px] font-semibold uppercase tracking-[0.14em] text-muted">When the day doesn&apos;t go to plan</p>
        <p className="r mx-auto mt-2 max-w-xl text-center text-[22px] font-semibold leading-snug tracking-[-0.02em] sm:text-[26px]" style={delay(60)}>
          Okay, today changed. <span className="text-muted">What can we do now?</span>
        </p>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {RECOVERY.map((ex, i) => (
            <div key={ex.user} className="r glass flex flex-col gap-2.5 rounded-[24px] p-4 sm:p-5" style={delay(150 + i * 120)}>
              <p className="ml-auto max-w-[85%] rounded-[20px] rounded-br-[7px] bg-accent px-4 py-2.5 text-[15px] leading-[1.45] text-accent-foreground">{ex.user}</p>
              <div className="flex items-end gap-2">
                <AssistantAvatar name={ASSISTANT} className="size-7 text-[12px]" />
                <p className="max-w-[88%] rounded-[20px] rounded-bl-[7px] bg-surface-2 px-4 py-2.5 text-[15px] leading-[1.45]">{ex.reply}</p>
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
