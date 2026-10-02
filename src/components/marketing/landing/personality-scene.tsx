"use client";

import { useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { AssistantAvatar } from "@/components/app/assistant-avatar";
import { Reveal } from "./reveal";
import { ASSISTANT, delay, SectionIntro } from "./parts";

export interface PersonalityOption {
  value: string;
  title: string;
  body: string;
  example: string;
}

/**
 * Section 6: pick an accountability style and hear how the assistant would
 * sound. Uses the same styles users choose in Settings → Your AI.
 */
export function PersonalityScene({ options }: { options: PersonalityOption[] }) {
  const [active, setActive] = useState(0);
  const current = options[active];

  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (active + step + options.length) % options.length;
    setActive(next);
    document.getElementById(`style-${options[next].value}`)?.focus();
  };

  return (
    <section className="relative mx-auto max-w-6xl px-5 py-14 sm:px-8 md:py-20" aria-labelledby="style-title">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
        <Reveal>
          <SectionIntro eyebrow="Your style" title={<span id="style-title">Accountability, your way.</span>}>
            Your partner should work the way you work. Pick how {ASSISTANT} talks to you — gentle, blunt or somewhere in between — and give it a name.
            It adapts its tone, never its honesty.
          </SectionIntro>
          <div role="radiogroup" aria-label="Accountability style" className="r mt-7 flex flex-wrap gap-2" style={delay(200)} onKeyDown={onKey}>
            {options.map((o, i) => (
              <button
                key={o.value}
                id={`style-${o.value}`}
                type="button"
                role="radio"
                aria-checked={i === active}
                tabIndex={i === active ? 0 : -1}
                onClick={() => setActive(i)}
                className={cn(
                  "min-h-11 rounded-full px-4 text-[15px] font-medium transition-all duration-200",
                  i === active ? "bg-accent text-accent-foreground shadow-[0_8px_24px_-10px_var(--accent)]" : "bg-surface-2 text-muted hover:text-foreground",
                )}
              >
                {o.title}
              </button>
            ))}
          </div>
        </Reveal>

        <Reveal threshold={0.3} className="relative">
          <div aria-hidden className="pointer-events-none absolute inset-8 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--grad-to)_24%,transparent),transparent)] blur-xl" />
          <div className="r glass glow relative rounded-[28px] p-5 sm:p-7" style={delay(150)} aria-live="polite">
            <div className="flex items-center gap-3">
              <AssistantAvatar name={ASSISTANT} className="size-10 text-[16px]" />
              <div>
                <p className="text-[15px] font-semibold">{ASSISTANT}</p>
                <p className="text-[13px] text-muted">
                  {current.title} · {current.body}
                </p>
              </div>
            </div>
            <p key={current.value} className="mt-5 animate-fade-in rounded-[22px] rounded-bl-[8px] bg-surface-2 px-5 py-4 text-[19px] leading-snug sm:text-[21px]">
              {current.example.replace(/^“|”$/g, "")}
            </p>
            <div className="mt-5 grid grid-cols-5 gap-1.5" aria-hidden>
              {options.map((o, i) => (
                <span key={o.value} className={cn("h-1 rounded-full transition-colors duration-300", i === active ? "bg-accent" : "bg-surface-2")} />
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
