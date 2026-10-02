import { ArrowDown, ArrowRight, Bed, CalendarDays, HeartPulse, Plus, Smartphone, Sparkles, Target } from "lucide-react";
import { AssistantAvatar } from "@/components/app/assistant-avatar";
import { Reveal } from "./reveal";
import { ASSISTANT, delay, GoalRow } from "./parts";

const SLEEP = [7.4, 6.9, 7.8, 7.1, 6.5, 7.2, 5.2]; // sample hours, last 7 nights

/**
 * Health as CONTEXT, not a dashboard: one sleep number + one busy morning +
 * one goal → a better decision. Everything here is labeled sample data.
 */
export function BiggerPictureScene() {
  return (
    <section className="relative mx-auto max-w-6xl px-5 py-14 sm:px-8 md:py-20" aria-labelledby="bigger-title">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="r text-[13px] font-semibold uppercase tracking-[0.14em] text-accent">The bigger picture</p>
        <h2 id="bigger-title" className="r mt-3 text-[34px] font-bold leading-[1.06] tracking-[-0.03em] sm:text-[46px]" style={delay(60)}>
          Your AI sees the bigger picture.
        </h2>
        <p className="r mt-4 text-[17px] leading-relaxed text-muted sm:text-[18px]" style={delay(120)}>
          {ASSISTANT} doesn&apos;t track your health — it uses it as context. Sleep and activity from Apple Health or Health Connect, next to your calendar
          and goals, so the plan fits the day you&apos;re actually having.
        </p>
      </Reveal>

      <Reveal threshold={0.2} className="relative mt-10 md:mt-12">
        <p className="r mx-auto mb-5 flex w-fit items-center gap-2 rounded-full border border-dashed border-muted/40 px-3.5 py-1.5 text-[12.5px] font-medium text-muted">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">Example</span>
          Illustrative sample data — not your health information
        </p>

        <div className="grid items-center gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1.35fr]" role="group" aria-label="Illustrative example using made-up sample data">
          {/* Input 1: sleep */}
          <div className="r elevated rounded-[22px] p-4" style={delay(100)}>
            <p className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.09em] text-muted">
              <Bed className="size-3.5 text-accent" aria-hidden /> Sleep
            </p>
            <p className="mt-2 text-[24px] font-bold leading-none tracking-tight">5h 12m</p>
            <p className="mt-1 text-[12.5px] text-warning">2 hours under your usual</p>
            <div className="mt-3 flex h-9 items-end gap-1" aria-hidden>
              {SLEEP.map((h, i) => (
                <span
                  key={i}
                  className={i === SLEEP.length - 1 ? "flex-1 rounded-[4px] bg-warning" : "flex-1 rounded-[4px] bg-[color-mix(in_oklab,var(--accent)_40%,var(--surface-2))]"}
                  style={{ height: `${(h / 8) * 100}%` }}
                />
              ))}
            </div>
          </div>

          <Plus className="r mx-auto size-5 text-muted" aria-hidden style={delay(180)} />

          {/* Input 2: calendar */}
          <div className="r elevated rounded-[22px] p-4" style={delay(220)}>
            <p className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.09em] text-muted">
              <CalendarDays className="size-3.5 text-accent" aria-hidden /> This morning
            </p>
            <p className="mt-2 text-[16px] font-semibold leading-snug">Booked 8:00 – 12:00</p>
            <div className="mt-3 flex gap-1" aria-hidden>
              {["#039be5", "#8e24aa", "#039be5", "#33b679"].map((c, i) => (
                <span key={i} className="h-6 flex-1 rounded-md" style={{ background: `color-mix(in oklab, ${c} 55%, transparent)` }} />
              ))}
            </div>
            <p className="mt-2 text-[12.5px] text-muted">Workout planned at 7:00 AM</p>
          </div>

          <Plus className="r mx-auto size-5 text-muted" aria-hidden style={delay(300)} />

          {/* Input 3: goal */}
          <div className="r elevated rounded-[22px] p-4" style={delay(340)}>
            <p className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.09em] text-muted">
              <Target className="size-3.5 text-accent" aria-hidden /> Goal
            </p>
            <div className="mt-3">
              <GoalRow title="Work out 3×/week" detail="2 of 3" value={0.67} />
            </div>
            <p className="mt-3 text-[12.5px] text-muted">Free after 5:30 PM today</p>
          </div>

          <span className="r mx-auto text-accent" aria-hidden style={delay(450)}>
            <ArrowRight className="hidden size-6 lg:block" />
            <ArrowDown className="size-6 lg:hidden" />
          </span>

          {/* The decision */}
          <div className="r glass glow relative rounded-[24px] p-5" style={delay(560)}>
            <div className="flex items-center gap-2.5">
              <AssistantAvatar name={ASSISTANT} className="size-8 text-[13px]" />
              <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.09em] text-accent">
                <Sparkles className="size-3.5" aria-hidden /> Example · {ASSISTANT} suggests
              </p>
            </div>
            <p className="mt-3 text-[17px] font-medium leading-snug">
              You slept poorly and have a packed morning. I&apos;d move your workout to this evening — you&apos;re free after 5:30 and still on track for three
              this week.
            </p>
            <div className="mt-4 flex flex-wrap gap-2" aria-hidden>
              <span className="inline-flex min-h-10 items-center rounded-full bg-accent px-4 text-[14px] font-semibold text-accent-foreground">Move to 6:00 PM</span>
              <span className="inline-flex min-h-10 items-center rounded-full bg-surface-2 px-4 text-[14px] font-semibold">Keep 7:00 AM</span>
            </div>
          </div>
        </div>

        <div className="r mt-8 flex flex-col items-center gap-2 text-center text-[13px] text-muted" style={delay(700)}>
          <p className="flex items-center gap-2">
            <HeartPulse className="size-4" aria-hidden /> Apple Health <span aria-hidden>·</span> <Smartphone className="size-4" aria-hidden /> Health Connect <span aria-hidden>·</span> only
            what you choose to share
          </p>
          <p>All figures above are made up for illustration. Never medical advice — just a better plan.</p>
        </div>
      </Reveal>
    </section>
  );
}
