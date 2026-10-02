import { BellRing, CalendarCheck, MessageSquareText } from "lucide-react";
import { AssistantAvatar } from "@/components/app/assistant-avatar";
import { cn } from "@/lib/cn";
import { Reveal } from "./reveal";
import { ASSISTANT, delay, Typing } from "./parts";

/** The notification arrives first; the conversation follows. (ms after the scene is in view) */
const NOTIFY_AT = 250;
const THREAD: { from: "ai" | "me"; text: string; at: number }[] = [
  { from: "ai", text: "You said you'd go for a run at 6. Still happening?", at: 1300 },
  { from: "me", text: "Not tonight. I'm exhausted.", at: 2400 },
  { from: "ai", text: "Fair. Want to move it to tomorrow morning instead?", at: 3900 },
  { from: "me", text: "Yes.", at: 4900 },
  { from: "ai", text: "Done. I'll check in at 6:15. Get some sleep.", at: 5900 },
];

function Sms({ from, text, at }: { from: "ai" | "me"; text: string; at: number }) {
  return (
    <div className={cn("r flex", from === "me" ? "justify-end" : "justify-start")} style={delay(at)}>
      <p
        className={cn(
          "max-w-[80%] rounded-[19px] px-3.5 py-2 text-[15px] leading-[1.38]",
          from === "me" ? "rounded-br-[6px] bg-[#0a84ff] text-white" : "rounded-bl-[6px] bg-[var(--lp-sms-in)] text-[var(--lp-sms-in-text)]",
        )}
      >
        {text}
      </p>
    </div>
  );
}

/** Proactive check-ins by text: the assistant reaches out first, and you just reply. */
export function SmsScene() {
  return (
    <section className="relative overflow-hidden" aria-labelledby="sms-title">
      <div aria-hidden className="aura pointer-events-none absolute left-[62%] top-1/2 h-[620px] w-[760px] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--grad-to)_24%,transparent),transparent)]" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 py-14 sm:px-8 md:py-20 lg:grid-cols-[1fr_auto] lg:gap-20">
        <Reveal>
          <p className="r text-[13px] font-semibold uppercase tracking-[0.14em] text-accent">Check-ins</p>
          <h2 id="sms-title" className="r mt-3 max-w-xl text-[34px] font-bold leading-[1.06] tracking-[-0.03em] sm:text-[46px]" style={delay(60)}>
            It doesn&apos;t disappear when you close the app.
          </h2>
          <p className="r mt-6 text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[34px]" style={delay(140)}>
            <span className="text-gradient">No app to open.</span> <span className="text-muted">Just reply.</span>
          </p>
          <p className="r mt-4 max-w-md text-[17px] leading-relaxed text-muted" style={delay(200)}>
            {ASSISTANT} texts you before the things you said you&apos;d do. Tell it what&apos;s really going on and it rearranges your day.
          </p>
          <ul className="mt-8 flex flex-col gap-4">
            {[
              { icon: BellRing, title: "It reaches out first", body: "Before a workout, after a deadline, at the end of the day." },
              { icon: MessageSquareText, title: "Reply like you'd text a friend", body: "“Done”, “not tonight”, “move it to Saturday.”" },
              { icon: CalendarCheck, title: "Your plan keeps up", body: "What you change by text updates your day and calendar." },
            ].map((f, i) => (
              <li key={f.title} className="r flex gap-3.5" style={delay(260 + i * 100)}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <f.icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block text-[16px] font-semibold">{f.title}</span>
                  <span className="block text-[14.5px] leading-snug text-muted">{f.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal threshold={0.3} className="relative mx-auto pt-10 sm:pt-6">
          <p className="r mb-4 text-center text-[12.5px] text-muted" style={delay(0)}>
            Thursday, 5:45 PM · on the drive home
          </p>

          {/* The notification arrives */}
          <div
            className="notify absolute inset-x-3 top-16 z-20 rounded-[22px] bg-[var(--lp-notif)] p-3.5 shadow-[0_0_0_1px_var(--lp-glass-ring),0_24px_48px_-18px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:inset-x-auto sm:-left-16 sm:top-14 sm:w-[290px]"
            style={delay(NOTIFY_AT)}
          >
            <div className="flex items-start gap-3">
              <AssistantAvatar name={ASSISTANT} className="ping size-9 text-[14px]" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center justify-between gap-2 text-[12px] text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <MessageSquareText className="size-3.5 text-success" aria-hidden /> Messages
                  </span>
                  <span>now</span>
                </p>
                <p className="mt-0.5 text-[14px] font-semibold">{ASSISTANT}</p>
                <p className="text-[14px] leading-snug">You said you&apos;d go for a run at 6. Still happening?</p>
              </div>
            </div>
          </div>

          <figure
            className="r relative w-[318px] rounded-[54px] bg-[#0d0e10] p-[11px] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_50px_100px_-40px_rgba(0,0,0,0.75),0_30px_90px_-30px_color-mix(in_oklab,var(--grad-to)_45%,transparent)] sm:w-[350px]"
            aria-label={`Example text conversation with ${ASSISTANT}`}
          >
            <div className="overflow-hidden rounded-[44px] bg-[var(--lp-phone-screen)] text-[var(--lp-phone-text)]">
              <div className="relative flex items-center justify-between px-7 pt-3.5 text-[12.5px] font-semibold" aria-hidden>
                <span>5:46</span>
                <span className="absolute left-1/2 top-2.5 h-[26px] w-[92px] -translate-x-1/2 rounded-full bg-[#0d0e10]" />
                <span className="h-2.5 w-4 rounded-[3px] border border-current opacity-70" />
              </div>
              <div className="flex flex-col items-center gap-1 border-b border-[var(--lp-phone-line)] pb-3 pt-4">
                <AssistantAvatar name={ASSISTANT} className="size-11 text-[18px]" />
                <span className="text-[12px] font-medium opacity-80">{ASSISTANT}</span>
              </div>
              <div className="flex min-h-[400px] flex-col justify-end gap-1.5 px-3 pb-5 pt-4 sm:min-h-[430px]">
                <p className="r mb-2 text-center text-[11px] text-[var(--lp-phone-sub)]" style={delay(1100)}>
                  Today 5:45 PM
                </p>
                {THREAD.map((m, i) => (
                  <div key={i} className="contents">
                    {m.from === "ai" && i > 0 ? <Typing at={m.at - 900} life={900} /> : null}
                    <Sms {...m} />
                  </div>
                ))}
              </div>
              <div className="mx-3 mb-3 flex items-center rounded-full border border-[var(--lp-phone-line)] px-4 py-2 text-[13px] text-[var(--lp-phone-sub)]" aria-hidden>
                Text Message
              </div>
            </div>
          </figure>

          {/* What changed in the app */}
          <div className="r glass absolute -bottom-5 left-1/2 z-10 flex w-max -translate-x-1/2 items-center gap-2.5 rounded-2xl px-3.5 py-2.5 sm:left-auto sm:-right-12 sm:translate-x-0" style={delay(6500)}>
            <CalendarCheck className="size-4 text-success" aria-hidden />
            <span className="text-[13px]">
              <span className="font-semibold">Run</span> <span className="text-muted">moved to tomorrow, 6:30 AM</span>
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
