import { CalendarDays, CheckSquare, HeartPulse, Repeat, Sparkles, Target } from "lucide-react";
import { AssistantAvatar } from "@/components/app/assistant-avatar";
import { Reveal } from "./reveal";
import { ASSISTANT, delay, SectionIntro } from "./parts";

const SOURCES = [
  { icon: CalendarDays, label: "Calendar", fact: "3 meetings tomorrow, first at 8:30" },
  { icon: Target, label: "Goals", fact: "Work out 3×/week · 1 of 3 so far" },
  { icon: CheckSquare, label: "Tasks", fact: "Send the proposal by Friday" },
  { icon: HeartPulse, label: "Health", fact: "Slept 5h 40m · 4,100 steps" },
  { icon: Repeat, label: "Habits", fact: "Usually works out after work" },
];

/** Section 2: many kinds of context flow into one assistant, which turns them into a plan. */
export function ContextScene() {
  return (
    <section className="relative mx-auto max-w-6xl px-5 py-14 sm:px-8 md:py-20" aria-labelledby="knows-title">
      <Reveal>
        <SectionIntro eyebrow="Context" title={<span id="knows-title">It knows your life.</span>} center>
          Your calendar, goals, tasks and health — in one place, so {ASSISTANT} can plan around how your days actually go.
        </SectionIntro>
      </Reveal>

      <Reveal threshold={0.2} className="relative mt-12 grid items-center gap-6 md:mt-16 md:grid-cols-[1fr_0.8fr_1fr] md:gap-0">
        {/* Connectors (desktop): five sources → assistant → recommendation */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 hidden size-full md:block" viewBox="0 0 100 100" preserveAspectRatio="none">
          {[10, 30, 50, 70, 90].map((y, i) => (
            <path
              key={y}
              d={`M 29.5 ${y} C 39 ${y}, 38 50, 46 50`}
              fill="none"
              stroke="var(--accent)"
              strokeOpacity="0.45"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              className="r flow-line"
              style={delay(300 + i * 80)}
            />
          ))}
          <path d="M 54 50 L 67 50" fill="none" stroke="var(--accent)" strokeOpacity="0.6" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="r flow-line" style={delay(900)} />
        </svg>

        <ul className="relative grid grid-cols-2 gap-2.5 md:grid-cols-1 md:gap-3 md:pr-[18%]">
          {SOURCES.map((s, i) => (
            <li key={s.label} className={`r glass flex items-start gap-3 rounded-2xl p-3.5 ${i === 4 ? "col-span-2 md:col-span-1" : ""}`} style={delay(120 + i * 90)}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <s.icon className="size-[18px]" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{s.label}</span>
                <span className="block text-[14px] leading-snug">{s.fact}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="relative flex flex-col items-center gap-3 py-2">
          <div aria-hidden className="h-8 w-px bg-gradient-to-b from-transparent to-accent/60 md:hidden" />
          <div className="r relative flex flex-col items-center" style={delay(700)}>
            <span aria-hidden className="absolute inset-0 -m-6 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--grad-to)_45%,transparent),transparent)] blur-md" />
            <AssistantAvatar name={ASSISTANT} className="relative size-20 text-[32px] shadow-[0_0_0_8px_color-mix(in_oklab,var(--accent)_14%,transparent),0_0_0_18px_color-mix(in_oklab,var(--accent)_6%,transparent)]" />
            <p className="relative mt-4 text-[15px] font-semibold">{ASSISTANT}</p>
            <p className="relative text-[13px] text-muted">Your accountability partner</p>
          </div>
          <div aria-hidden className="h-8 w-px bg-gradient-to-b from-accent/60 to-transparent md:hidden" />
        </div>

        <div className="relative md:pl-[6%]">
          <div className="r glass glow rounded-[24px] p-5" style={delay(1000)}>
            <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.09em] text-accent">
              <Sparkles className="size-3.5" aria-hidden /> Tomorrow, planned
            </p>
            <p className="mt-3 text-[17px] font-medium leading-snug">
              Proposal first thing, while it&apos;s quiet. Workout right after work. Lights out by 10:30 — you&apos;re short on sleep.
            </p>
            <ul className="mt-4 flex flex-col gap-1.5 text-[13px] text-muted">
              <li className="flex justify-between gap-3">
                <span>7:45 AM</span>
                <span className="text-foreground">Finish the proposal</span>
              </li>
              <li className="flex justify-between gap-3">
                <span>5:45 PM</span>
                <span className="text-foreground">Workout — 45 min</span>
              </li>
              <li className="flex justify-between gap-3">
                <span>10:30 PM</span>
                <span className="text-foreground">Lights out</span>
              </li>
            </ul>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
