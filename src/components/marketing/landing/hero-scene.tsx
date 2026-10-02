"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, BatteryMedium, CalendarDays, CheckSquare, RotateCcw, Sparkles, Target } from "lucide-react";
import { AssistantAvatar } from "@/components/app/assistant-avatar";
import { ProgressBar } from "@/components/ui/progress-bar";
import { cn } from "@/lib/cn";
import { ASSISTANT } from "./parts";

/**
 * The hero's interactive moment: the visitor sends one of a few example
 * messages and watches the assistant read the (sample) context — calendar,
 * goals, tasks, energy — then build a plan from it. Pure simulation: no AI,
 * no backend, no real data.
 */

type Kind = "calendar" | "goal" | "task" | "energy";
interface Ctx {
  id: string;
  kind: Kind;
  title: string;
  detail: string;
  progress?: number;
}
interface Step {
  id: string;
  status: string;
}
interface PlanItem {
  time: string;
  title: string;
  because: string;
  tone: string;
  muted?: boolean;
}
interface Script {
  key: string;
  chip: string;
  message: string;
  context: Ctx[];
  steps: Step[];
  reply: string;
  plan: PlanItem[];
  footnote: string;
}

const BASE_GOALS: Ctx[] = [
  { id: "g-fit", kind: "goal", title: "Work out 3×/week", detail: "1 of 3", progress: 0.33 },
  { id: "g-garage", kind: "goal", title: "Clear out the garage", detail: "20%", progress: 0.2 },
  { id: "g-save", kind: "goal", title: "Save $2,000 by June", detail: "45%", progress: 0.45 },
];

const SCRIPTS: Script[] = [
  {
    key: "shape",
    chip: "Get back into shape",
    message: "I want to get back into shape.",
    context: [
      { id: "c-work", kind: "calendar", title: "Work", detail: "9:00 – 5:30" },
      { id: "c-free", kind: "calendar", title: "Free", detail: "5:45 – 10:00 PM" },
      ...BASE_GOALS,
      { id: "t-1", kind: "task", title: "Grocery run", detail: "Today" },
      { id: "e-sleep", kind: "energy", title: "Slept 7h 30m", detail: "Good energy" },
    ],
    steps: [
      { id: "g-fit", status: "Checking your goals" },
      { id: "c-free", status: "Finding time that fits" },
      { id: "t-1", status: "Working around your to-dos" },
      { id: "e-sleep", status: "Checking your energy" },
    ],
    reply: "Let's keep it realistic. You're free after work, so a 45-minute workout at 6 — that's #2 of the 3 you wanted this week. Dinner after, and the rest of the night is yours.",
    plan: [
      { time: "6:00 PM", title: "Workout — 45 min", because: "Workout #2 of 3 this week", tone: "bg-success" },
      { time: "7:15 PM", title: "Dinner + grocery run", because: "On your list for today", tone: "bg-accent" },
      { time: "8:00 PM", title: "Free time", because: "Rest counts too", tone: "bg-[#a78bfa]" },
    ],
    footnote: "I'll check in at 5:45 to make sure it's still on.",
  },
  {
    key: "busy-day",
    chip: "Busy day tomorrow",
    message: "I've got a busy day tomorrow. Help me figure it out.",
    context: [
      { id: "c-work", kind: "calendar", title: "Meetings", detail: "9:00 – 2:00" },
      { id: "c-free", kind: "calendar", title: "Open", detail: "2:30 – 5:00" },
      ...BASE_GOALS,
      { id: "t-1", kind: "task", title: "Send the proposal", detail: "Due tomorrow" },
      { id: "e-sleep", kind: "energy", title: "Slept 6h 05m", detail: "A bit short" },
    ],
    steps: [
      { id: "c-work", status: "Checking tomorrow's calendar" },
      { id: "t-1", status: "Looking at what's due" },
      { id: "c-free", status: "Finding focus time" },
      { id: "e-sleep", status: "Factoring in your sleep" },
    ],
    reply: "Your morning is back-to-back until 2. I'd send the proposal in the 2:30 gap while it's quiet, leave by 5:15 for pickup, and keep tonight light — you're running short on sleep.",
    plan: [
      { time: "2:30 PM", title: "Finish + send the proposal", because: "Due tomorrow", tone: "bg-accent" },
      { time: "5:15 PM", title: "Leave for school pickup", because: "Pickup at 5:30", tone: "bg-success" },
      { time: "10:00 PM", title: "Lights out", because: "Only 6 hours last night", tone: "bg-[#a78bfa]" },
    ],
    footnote: "Your workout moves to Thursday — you're still on track for the week.",
  },
  {
    key: "putting-off",
    chip: "Putting something off",
    message: "I've been putting this project off all week.",
    context: [
      { id: "c-work", kind: "calendar", title: "Tonight", detail: "Free after 7:00" },
      { id: "c-free", kind: "calendar", title: "Saturday", detail: "Open until 1:00" },
      ...BASE_GOALS.map((g) => (g.id === "g-fit" ? { ...g, detail: "2 of 3", progress: 0.67 } : g)),
      { id: "t-1", kind: "task", title: "Donation drop-off", detail: "Sunday" },
      { id: "e-sleep", kind: "energy", title: "Slept 7h 10m", detail: "Okay energy" },
    ],
    steps: [
      { id: "g-garage", status: "Looking at the project" },
      { id: "c-work", status: "Checking tonight" },
      { id: "c-free", status: "Checking the weekend" },
      { id: "t-1", status: "Finding a finish line" },
    ],
    reply: "No judgment — big projects are easy to avoid. Let's make it small: 30 minutes tonight, just the shelves by the door. Saturday morning takes the rest, and Sunday's drop-off is the finish line.",
    plan: [
      { time: "7:30 PM", title: "Garage: just the shelves — 30 min", because: "Start small", tone: "bg-accent" },
      { time: "Sat 10:00 AM", title: "Garage: the rest — 2 hrs", because: "You're free all morning", tone: "bg-success" },
      { time: "Sunday", title: "Donation drop-off", because: "The finish line", tone: "bg-[#a78bfa]" },
    ],
    footnote: "I'll check in tomorrow — not to nag, just to see how it went.",
  },
];

const KIND_ICON = { calendar: CalendarDays, goal: Target, task: CheckSquare, energy: BatteryMedium } as const;

/** Event timings (ms from start) for a script. */
function timeline(s: Script) {
  const user = 250;
  const thinking = user + 650;
  const steps = s.steps.map((_, i) => thinking + 350 + i * 700);
  const reply = steps[steps.length - 1] + 900;
  const plan = s.plan.map((_, i) => reply + 700 + i * 320);
  const done = plan[plan.length - 1] + 500;
  return { user, thinking, steps, reply, plan, done };
}

export function HeroScene() {
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(-1);
  const [instant, setInstant] = useState(false);
  const timers = useRef<number[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const script = SCRIPTS[index];
  const t = timeline(script);

  const play = useCallback((i: number) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setIndex(i);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setInstant(reduce);
    if (reduce) {
      setElapsed(Number.MAX_SAFE_INTEGER);
      return;
    }
    setElapsed(0);
    const tl = timeline(SCRIPTS[i]);
    const marks = [tl.user, tl.thinking, ...tl.steps, tl.reply, ...tl.plan, tl.done];
    for (const m of marks) timers.current.push(window.setTimeout(() => setElapsed(m), m));
  }, []);

  // Start when the scene is on screen.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const pending = timers.current;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          play(0);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      pending.forEach(clearTimeout);
    };
  }, [play]);

  const at = (ms: number) => elapsed >= ms;
  const activeStep = script.steps.findLastIndex((_, i) => at(t.steps[i]));
  const thinking = at(t.thinking) && !at(t.reply);
  const scanned = new Set(script.steps.filter((_, i) => at(t.steps[i])).map((s) => s.id));
  const scanning = thinking && activeStep >= 0 ? script.steps[activeStep].id : null;
  const done = at(t.done);
  const status = !at(t.user) ? "Ready when you are" : thinking ? (activeStep >= 0 ? script.steps[activeStep].status : "Thinking") : at(t.reply) ? "Plan ready" : "Reading";

  const ctxItem = (c: Ctx, compact = false) => {
    const Icon = KIND_ICON[c.kind];
    return (
      <li
        key={c.id}
        data-on={scanning === c.id}
        className={cn(
          "scan rounded-xl",
          compact ? "inline-flex shrink-0 items-center gap-1.5 bg-surface-2 px-2.5 py-1.5 text-[12.5px]" : "px-2.5 py-2",
          !compact && (scanned.has(c.id) ? "bg-[color-mix(in_oklab,var(--accent)_12%,var(--surface-2))]" : "bg-surface-2/60"),
        )}
      >
        {compact ? (
          <>
            <Icon className="size-3.5 text-accent" aria-hidden />
            <span className="font-medium">{c.title}</span>
            <span className="text-muted">{c.detail}</span>
          </>
        ) : (
          <>
            <span className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="truncate font-medium">{c.title}</span>
              <span className="shrink-0 text-[12px] text-muted">{c.detail}</span>
            </span>
            {c.progress != null ? (
              <span aria-hidden className="mt-1.5 block">
                <ProgressBar value={c.progress} label={c.title} />
              </span>
            ) : null}
          </>
        )}
      </li>
    );
  };

  const group = (kind: Kind, label: string) => {
    const Icon = KIND_ICON[kind];
    return (
      <div>
        <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
          <Icon className="size-3.5 text-accent" aria-hidden />
          {label}
        </p>
        <ul className="flex flex-col gap-1.5">{script.context.filter((c) => c.kind === kind).map((c) => ctxItem(c))}</ul>
      </div>
    );
  };

  return (
    <div ref={root} className="relative mx-auto mt-12 max-w-6xl sm:mt-14">
      <div aria-hidden className="aura pointer-events-none absolute -inset-x-10 -top-12 bottom-0 rounded-[64px] bg-[radial-gradient(60%_60%_at_50%_40%,color-mix(in_oklab,var(--grad-to)_26%,transparent),transparent_70%)] blur-2xl" />
      <figure className="glass glow relative overflow-hidden rounded-[28px] text-left" aria-label={`Interactive example: ${ASSISTANT} plans around sample calendar, goals and tasks`}>
        {/* Window bar */}
        <div className="flex items-center gap-3 border-b border-hairline px-4 py-3 sm:px-5">
          <span className="relative shrink-0">
            <AssistantAvatar name={ASSISTANT} className="size-9 text-[15px]" />
            <span className={cn("absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-[var(--surface)] bg-success", thinking && "ping")} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-tight">{ASSISTANT}</p>
            <p className="flex items-center gap-1.5 truncate text-[12.5px] text-muted" role="status">
              {thinking ? (
                <span className="dots inline-flex gap-[3px] text-accent" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
              ) : null}
              {status}
            </p>
          </div>
          <span className="ml-auto shrink-0 rounded-full border border-dashed border-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted">Example · sample data</span>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[250px_minmax(0,1fr)_290px]">
          {/* What it knows */}
          <aside className="hidden flex-col gap-4 border-r border-hairline p-4 lg:flex" aria-label="What it knows (sample)">
            {group("calendar", "Calendar")}
            {group("goal", "Goals")}
            {group("task", "Tasks")}
            {group("energy", "Energy")}
          </aside>

          {/* Conversation */}
          <div className="flex min-h-[380px] flex-col sm:min-h-[430px]">
            <ul className="flex gap-1.5 overflow-x-auto border-b border-hairline px-4 py-2.5 no-scrollbar lg:hidden" aria-label="What it knows (sample)">
              {script.context.filter((c) => c.kind !== "goal" || script.steps.some((st) => st.id === c.id)).map((c) => ctxItem(c, true))}
            </ul>
            <div className="flex flex-1 flex-col justify-start gap-3 px-4 py-5 sm:px-6" aria-live="polite">
              {at(t.user) ? (
                <div key={`u-${script.key}`} className={cn("flex justify-end", !instant && "pop")}>
                  <p className="max-w-[88%] rounded-[20px] rounded-br-[7px] bg-accent px-4 py-2.5 text-[15px] leading-[1.45] text-accent-foreground sm:max-w-[80%]">{script.message}</p>
                </div>
              ) : null}
              {thinking ? (
                <div className={cn("flex items-center gap-2 text-[13px] text-muted", !instant && "pop")} aria-hidden>
                  <span className="dots inline-flex gap-1 rounded-[18px] rounded-bl-[7px] bg-surface-2 px-3.5 py-3 text-muted">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>
                    Reading your context · {scanned.size} of {script.steps.length}
                  </span>
                </div>
              ) : null}
              {at(t.reply) ? (
                <div key={`a-${script.key}`} className={cn("flex", !instant && "pop")}>
                  <p className="max-w-[92%] rounded-[20px] rounded-bl-[7px] bg-surface-2 px-4 py-2.5 text-[15px] leading-[1.45] sm:max-w-[85%]">{script.reply}</p>
                </div>
              ) : null}
            </div>

            {/* The visitor drives it */}
            <div className="border-t border-hairline px-3 py-3 sm:px-5">
              <p className="mb-2 px-1 text-[12px] font-medium text-muted">{done ? "Try another:" : "Example messages:"}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {SCRIPTS.map((s, i) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => play(i)}
                    aria-pressed={i === index}
                    className={cn(
                      "inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-medium transition-colors",
                      i === index ? "bg-accent text-accent-foreground" : "bg-surface-2 text-foreground hover:bg-[color-mix(in_oklab,var(--accent)_14%,var(--surface-2))]",
                    )}
                  >
                    {i === index && done ? <RotateCcw className="size-3.5" aria-hidden /> : null}
                    {s.chip}
                  </button>
                ))}
                <span className="ml-auto hidden items-center gap-2 rounded-full bg-surface-2 py-1 pl-3.5 pr-1 text-[13px] text-muted xl:inline-flex" aria-hidden>
                  Message {ASSISTANT}…
                  <span className="flex size-7 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <ArrowUp className="size-3.5" />
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* The plan it builds */}
          <div className="border-t border-hairline p-4 sm:p-5 lg:border-l lg:border-t-0">
            <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              <Sparkles className="size-3.5 text-accent" aria-hidden /> {at(t.reply) ? "Here's what I'd do" : "Plan"}
            </p>
            <ol className="flex flex-col gap-2.5">
              {script.plan.map((p, i) =>
                at(t.plan[i]) ? (
                  <li key={`${script.key}-${i}`} className={cn("elevated flex gap-3 rounded-2xl p-3", !instant && "pop", p.muted && "opacity-75")}>
                    <span className={cn("w-1 shrink-0 rounded-full", p.tone)} aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[12px] font-semibold tabular-nums text-muted">{p.time}</span>
                      <span className="block text-[14.5px] font-semibold leading-snug">{p.title}</span>
                      <span className="mt-1 inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-[11.5px] font-medium text-accent">because: {p.because}</span>
                    </span>
                  </li>
                ) : (
                  <li key={`${script.key}-${i}-ph`} className="rounded-2xl border border-dashed border-hairline p-3" aria-hidden>
                    <span className="block h-2.5 w-14 rounded-full bg-surface-2" />
                    <span className="mt-2 block h-3 w-32 rounded-full bg-surface-2" />
                    <span className="mt-2 block h-2.5 w-20 rounded-full bg-surface-2" />
                  </li>
                ),
              )}
              {done ? <li className={cn("px-1 pt-1 text-[12.5px] text-muted", !instant && "pop")}>{script.footnote}</li> : null}
            </ol>
          </div>
        </div>
      </figure>
    </div>
  );
}
