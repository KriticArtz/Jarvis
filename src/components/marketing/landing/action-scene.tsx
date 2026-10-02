"use client";

import { useState } from "react";
import { Check, Clock, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Reveal } from "./reveal";
import { AssistantHeader, Bubble, delay, SectionIntro } from "./parts";

type Phase = "proposed" | "confirmed" | "cancelled";

const HOURS = ["5 PM", "6 PM", "7 PM", "8 PM", "9 PM"];
const ROW = 52; // px per hour

/**
 * Section 3: the assistant proposes a calendar change and only makes it after
 * the visitor presses Confirm (the same Confirm / Cancel the real chat shows).
 * Nothing moves until the visitor clicks Confirm or Cancel; Replay resets it.
 */
export function ActionScene() {
  const [phase, setPhase] = useState<Phase>("proposed");
  const [run, setRun] = useState(0);

  const replay = () => {
    setPhase("proposed");
    setRun((r) => r + 1);
  };

  const moved = phase === "confirmed";

  return (
    <section className="relative mx-auto max-w-6xl px-5 py-14 sm:px-8 md:py-20" aria-labelledby="acts-title">
      <div className="grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
        <Reveal>
          <SectionIntro eyebrow="Actions" title={<span id="acts-title">It doesn&apos;t just plan. It acts.</span>}>
            Ask it to move, add or cancel something and it does the work — your tasks, your goals, your Google Calendar. Anything that changes your
            calendar waits for your OK.
          </SectionIntro>
          <ul className="r mt-6 flex flex-col gap-2 text-[15px]" style={delay(200)}>
            {["Finds a real opening in your schedule", "Shows exactly what will change", "Nothing happens until you confirm"].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <span className="flex size-5 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <Check className="size-3" strokeWidth={3} aria-hidden />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal threshold={0.35} className="r glass glow relative overflow-hidden rounded-[28px]">
          <div className="grid sm:grid-cols-[minmax(0,1fr)_230px]">
            <div className="flex flex-col">
              <AssistantHeader subtitle="Connected to Google Calendar" />
              <div key={run} className="flex flex-1 flex-col justify-end gap-3 px-4 py-5 sm:px-5" aria-live="polite">
                <Bubble from="me" style={delay(200)}>
                  Move my study session to tomorrow at 7.
                </Bubble>
                <Bubble from="ai" style={delay(900)}>
                  Tomorrow at 7 PM is open. Want me to move it?
                </Bubble>
                <div className="r" style={delay(1400)}>
                  {phase === "proposed" ? (
                    <div className="inline-flex max-w-full flex-col rounded-2xl bg-warning-soft px-3 py-2.5 text-[13px] leading-snug text-warning">
                      <span className="inline-flex items-start gap-1.5">
                        <Clock className="mt-[2px] size-3.5 shrink-0" aria-hidden />
                        <span>
                          Waiting for your OK: Move “Study session”
                          <br />
                          Current: Today, 8:00 PM–9:00 PM
                          <br />
                          New: Tomorrow, 7:00 PM–8:00 PM
                        </span>
                      </span>
                      <span className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setPhase("confirmed")}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-semibold text-accent-foreground transition-transform active:scale-95"
                        >
                          <Check className="size-4" aria-hidden /> Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setPhase("cancelled")}
                          className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-[14px] font-semibold text-foreground transition-transform active:scale-95"
                        >
                          Cancel
                        </button>
                      </span>
                    </div>
                  ) : phase === "confirmed" ? (
                    <p className="inline-flex animate-fade-in items-start gap-1.5 rounded-2xl bg-success-soft px-3 py-1.5 text-[13px] text-success">
                      <Check className="mt-[2px] size-3.5 shrink-0" strokeWidth={3} aria-hidden /> Moved “Study session” to Tomorrow, 7:00 PM–8:00 PM.
                    </p>
                  ) : (
                    <p className="inline-flex animate-fade-in items-start gap-1.5 rounded-2xl bg-surface-2 px-3 py-1.5 text-[13px] text-muted">
                      <X className="mt-[2px] size-3.5 shrink-0" aria-hidden /> Okay — I won&apos;t make that change.
                    </p>
                  )}
                </div>
                {phase !== "proposed" ? (
                  <button type="button" onClick={replay} className="inline-flex min-h-11 items-center gap-1.5 self-start text-[13px] font-medium text-muted hover:text-foreground">
                    <RotateCcw className="size-3.5" aria-hidden /> Replay
                  </button>
                ) : null}
              </div>
            </div>

            {/* Mini calendar: the event slides from Today 8 PM to Tomorrow 7 PM when confirmed. */}
            <div className="border-t border-hairline p-4 sm:border-l sm:border-t-0" aria-label={moved ? "Calendar: Study session tomorrow at 7 PM" : "Calendar: Study session today at 8 PM"}>
              <div className="grid grid-cols-[34px_1fr_1fr] text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
                <span />
                <span>Today</span>
                <span className="text-accent">Tomorrow</span>
              </div>
              <div className="relative mt-2 grid grid-cols-[34px_1fr_1fr]" style={{ height: ROW * HOURS.length }} aria-hidden>
                <div className="relative">
                  {HOURS.map((h, i) => (
                    <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-muted" style={{ top: i * ROW }}>
                      {h}
                    </span>
                  ))}
                </div>
                {[0, 1].map((col) => (
                  <div key={col} className="relative border-l border-hairline">
                    {HOURS.map((h, i) => (
                      <div key={h} className="absolute inset-x-0 border-t border-hairline" style={{ top: i * ROW }} />
                    ))}
                  </div>
                ))}
                {/* Fixed events */}
                <div className="absolute rounded-md border-l-[3px] border-[#33b679] bg-[color-mix(in_oklab,#33b679_18%,var(--surface))] px-1.5 py-1 text-left text-[10.5px] font-medium" style={{ left: "calc(34px + 2px)", width: "calc((100% - 34px) / 2 - 4px)", top: ROW * 1 + 2, height: ROW - 4 }}>
                  Dinner
                </div>
                <div className="absolute rounded-md border-l-[3px] border-[#f4511e] bg-[color-mix(in_oklab,#f4511e_18%,var(--surface))] px-1.5 py-1 text-left text-[10.5px] font-medium" style={{ left: "calc(34px + (100% - 34px) / 2 + 2px)", width: "calc((100% - 34px) / 2 - 4px)", top: ROW * 0.5 + 2, height: ROW * 1.25 - 4 }}>
                  Soccer practice
                </div>
                {/* The moving event */}
                <div
                  className={cn(
                    "absolute rounded-md border-l-[3px] border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_24%,var(--surface))] overflow-hidden px-1.5 py-1 text-left text-[10.5px] font-semibold leading-tight transition-all duration-700 ease-[cubic-bezier(0.2,0.7,0.2,1)]",
                    moved && "shadow-[0_0_0_2px_color-mix(in_oklab,var(--accent)_45%,transparent),0_10px_24px_-10px_var(--accent)]",
                  )}
                  style={{
                    left: moved ? "calc(34px + (100% - 34px) / 2 + 2px)" : "calc(34px + 2px)",
                    width: "calc((100% - 34px) / 2 - 4px)",
                    top: (moved ? ROW * 2 : ROW * 3) + 2,
                    height: ROW - 4,
                  }}
                >
                  <span className="block truncate">Study session</span>
                  <span className="block truncate font-normal text-muted">{moved ? "7 – 8 PM" : "8 – 9 PM"}</span>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
