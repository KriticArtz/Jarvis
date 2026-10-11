import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CalendarDays, Check, CircleUserRound, Plus, Sprout, Sun } from "lucide-react";
import { designPreviewEnabled } from "@/lib/env";
import { MotionToggle, Seal, SealLab, type SealState } from "./seal";
// The supplied Arovenna logo, unmodified (byte-identical to the file provided). Preview only.
import logoReference from "./arovenna-logo-reference.webp";
import "./arovenna.css";

type Mode = "both" | "light" | "dark";
const SEAL_STATES: SealState[] = ["idle", "listening", "thinking", "acting", "complete"];

export const metadata: Metadata = {
  title: "Arovenna direction",
  robots: { index: false, follow: false },
};

/**
 * Arovenna brand direction — a PREVIEW, not the product. Gated exactly like
 * /design (on in development; 404 in production unless DESIGN_PREVIEW=true).
 * Everything is sample content and every style is scoped under .arv, so the
 * live app is untouched. The logo is the supplied reference image, used as-is
 * and only cropped for display (the seal face and the header wordmark).
 *
 *   ?mode=both (default)  product shown in ivory and forest side by side
 *   ?mode=light | dark    product, seal states and tokens in that mode only
 * The landing hero is always forest and the explainer always ivory — by design.
 */
export default async function ArovennaPreview({ searchParams }: PageProps<"/design/arovenna">) {
  await connection();
  if (!designPreviewEnabled()) notFound();
  const requested = (await searchParams).mode;
  const mode: Mode = requested === "light" || requested === "dark" ? requested : "both";
  const modes: ("light" | "dark")[] = mode === "both" ? ["light", "dark"] : [mode];
  const sectionMode = modes.length === 1 ? modes[0] : "light";
  const emblem = logoReference.src;

  return (
    <div className="arv" data-mode={mode === "both" ? "system" : mode}>
      {/* ------------------------------------------------ review tooling (not part of the design) */}
      <div className="arv" data-mode="light">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-8">
          <p className="eyebrow">Design preview</p>
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Preview mode" className="flex items-center gap-1 rounded-full p-1" style={{ background: "var(--surface-2)" }}>
              {(["both", "light", "dark"] as const).map((m) => (
                <a
                  key={m}
                  href={m === "both" ? "?" : `?mode=${m}`}
                  aria-current={mode === m ? "page" : undefined}
                  className="inline-flex min-h-9 items-center rounded-full px-3 text-[13px] font-semibold capitalize"
                  style={mode === m ? { background: "var(--ink)", color: "var(--bg)" } : { color: "var(--muted)" }}
                >
                  {m}
                </a>
              ))}
            </nav>
            <MotionToggle />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ landing: dark-green hero */}
      <section className="arv" data-mode="dark" aria-labelledby="hero-title">
        <div className="arv-canvas px-4 pb-14 pt-5 sm:px-8 sm:pb-20 sm:pt-6">
          <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4">
            <span className="flex items-center gap-3">
              <Seal size={36} emblem={emblem} />
              <Wordmark emblem={emblem} width={148} />
            </span>
            <a href="#app" className="btn btn-ghost">
              Sign in
            </a>
          </div>
          <div className="mx-auto mt-10 grid max-w-[1180px] items-center gap-12 sm:mt-16 md:mt-24 md:grid-cols-[1.3fr_1fr]">
            <div>
              <p className="eyebrow eyebrow-gold">Your accountability partner</p>
              <h1 id="hero-title" className="serif mt-3 text-[42px] leading-[1.02] sm:mt-4 sm:text-[72px]">
                Turn what you want to do into what you <em>actually</em> do.
              </h1>
              <p className="muted mt-5 max-w-[46ch] text-[17px] leading-relaxed sm:mt-6 sm:text-[18px]">
                Arovenna knows your goals, your calendar and your energy. It plans the day with you, checks in, and helps you follow through.
              </p>
              <div className="mt-7 flex flex-col gap-1 sm:mt-9 sm:flex-row sm:items-center sm:gap-3">
                {/* The one place gold is a fill: the conversion moment. */}
                <a href="#app" className="btn btn-cta">
                  Start free
                </a>
                <a href="#how" className="btn btn-ghost justify-center">
                  See how it works
                </a>
              </div>
            </div>
            {/* The emblem as a still brand moment — no implied activity on a page where nothing is happening. */}
            <div className="hidden justify-center md:flex">
              <Seal size={232} emblem={emblem} />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ landing: light, readable, converts */}
      <section className="arv" data-mode="light" id="how" aria-labelledby="how-title">
        <div className="mx-auto max-w-[1180px] px-4 py-16 sm:px-8 sm:py-20">
          <p className="eyebrow">How it works</p>
          <h2 id="how-title" className="serif mt-3 max-w-[22ch] text-[36px] leading-[1.05] sm:text-[52px]">
            A plan that fits the day you actually have.
          </h2>
          <div className="mt-10 grid gap-8 sm:mt-12 sm:gap-10 md:grid-cols-3">
            {[
              ["Plans around your calendar", "It sees your real schedule and finds the time for what matters — not an idealized day."],
              ["Checks in where you are", "In the app, by text or by email. Reply naturally; it keeps the thread going."],
              ["Follows through with you", "It notices when things slip and helps you reset — supportive, direct or tough love, your choice."],
            ].map(([t, b], i) => (
              <div key={t} className="hair border-t pt-6">
                <span className="num text-[13px] font-semibold" style={{ color: "var(--gold-ink)" }}>
                  0{i + 1}
                </span>
                <h3 className="mt-3 text-[19px] font-semibold">{t}</h3>
                <p className="muted mt-2 text-[15px] leading-relaxed">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ the product: Today, re-skinned (same structure as the live screen) */}
      <section id="app" aria-labelledby="app-title" className="arv" data-mode={sectionMode}>
        <div className="mx-auto max-w-[1180px] px-4 pt-6 sm:px-8">
          <div className="gold-rule" />
          <h2 id="app-title" className="eyebrow mt-10">
            The product · Today
          </h2>
        </div>
        <div className={`mx-auto grid gap-6 px-4 py-8 sm:px-8 ${modes.length === 2 ? "max-w-[1180px] lg:grid-cols-2" : "max-w-[760px]"}`}>
          {modes.map((m) => (
            <TodayMock key={m} mode={m} emblem={emblem} />
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ the logo, as supplied */}
      <section aria-labelledby="logo-title" className="arv" data-mode={sectionMode}>
        <div className="mx-auto max-w-[1180px] px-4 pt-10 sm:px-8">
          <h2 id="logo-title" className="eyebrow">
            The logo · as supplied
          </h2>
          <div className="mt-6 grid items-center gap-8 md:grid-cols-[260px_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element -- the reference file itself, shown unmodified */}
            <img src={emblem} alt="Arovenna logo: a gold A emblem above the AROVENNA wordmark on a forest-green tile" width={260} height={260} className="rounded-[20px]" />
            <div className="max-w-[60ch] text-[15px] leading-relaxed">
              <p>
                The seal and the header use this file directly — cropped for display, never redrawn. The seal face is a circular crop around the A; the
                header shows the supplied wordmark, blended into the dark hero.
              </p>
              <p className="muted mt-3">
                The file is a finished app-icon composition with its own background, so on ivory it can only appear as a tile. A transparent asset is
                needed before it can sit on ivory, in the light navigation, or as a favicon.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ small sizes */}
      <section aria-labelledby="small-title" className="arv" data-mode={sectionMode}>
        <div className="mx-auto max-w-[1180px] px-4 pt-10 sm:px-8">
          <h2 id="small-title" className="eyebrow">
            The seal · small sizes
          </h2>
          <div className={`mt-6 grid gap-6 ${modes.length === 2 ? "lg:grid-cols-2" : ""}`}>
            {modes.map((m) => (
              <div key={m} className="arv panel p-6" data-mode={m}>
                <p className="eyebrow">{m === "light" ? "Ivory" : "Forest"}</p>
                <ul className="mt-6 flex flex-wrap items-end gap-x-7 gap-y-5">
                  {[16, 20, 24, 32, 40, 48, 64].map((px) => (
                    <li key={px} className="flex flex-col items-center gap-2">
                      <Seal size={px} emblem={emblem} />
                      <span className="muted num text-[12px]">{px}px</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ the seal */}
      <section aria-labelledby="states-title" className="arv" data-mode={sectionMode}>
        <div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-8">
          <h2 id="states-title" className="eyebrow">
            The seal · five states
          </h2>
          <p className="muted mt-3 max-w-[70ch] text-[15px] leading-relaxed">
            In the product the seal changes only when the assistant really does: <strong>listening</strong> while you type to it, <strong>thinking</strong> while
            a reply is being written, <strong>acting</strong> while it changes your plan, <strong>complete</strong> once when that finishes. Otherwise it is
            still — including on navigation and on pages where nothing is happening.
          </p>
          <div className={`mt-6 grid gap-6 ${modes.length === 2 ? "lg:grid-cols-2" : ""}`}>
            {modes.map((m) => (
              <div key={m} className="arv panel p-6" data-mode={m}>
                <p className="eyebrow">{m === "light" ? "Ivory" : "Forest"}</p>
                <ul className="mt-6 grid grid-cols-5 gap-2">
                  {SEAL_STATES.map((s) => (
                    <li key={s} className="flex flex-col items-center gap-3">
                      <Seal state={s} size={64} emblem={emblem} />
                      <Seal state={s} size={28} emblem={emblem} />
                      <span className="muted text-[12px] capitalize">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="arv panel mt-6 p-6 sm:p-8" data-mode={modes.length === 1 ? modes[0] : "dark"}>
            <p className="eyebrow">Simulated for review</p>
            <p className="muted mt-2 text-[14px]">Step through the states by hand to judge each one at full size. Nothing here is connected to a real assistant.</p>
            <div className="mt-8">
              <SealLab emblem={emblem} />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ tokens */}
      <section aria-labelledby="tokens-title" className="arv" data-mode={sectionMode}>
        <div className="mx-auto max-w-[1180px] px-4 pb-24 pt-6 sm:px-8">
          <h2 id="tokens-title" className="eyebrow">
            Tokens · measured contrast
          </h2>
          <div className={`mt-6 grid gap-6 ${modes.length === 2 ? "lg:grid-cols-2" : ""}`}>
            {modes.includes("light") ? (
              <Swatches
                mode="light"
                rows={[
                  ["Ivory paper", "#F6F1E6", "page"],
                  ["Ivory surface", "#FFFCF5", "raised"],
                  ["Forest ink", "#13241B", "14.4:1 text"],
                  ["Muted", "#55655B", "5.5:1 text"],
                  ["Forest action", "#1D5A42", "7.2:1 · ivory on it 7.9:1"],
                  ["Gold ornament", "#94733A", "3.9:1 non-text"],
                  ["Gold ink", "#7A5C22", "5.5:1 text"],
                ]}
              />
            ) : null}
            {modes.includes("dark") ? (
              <Swatches
                mode="dark"
                rows={[
                  ["Forest night", "#0A1310", "page"],
                  ["Forest surface", "#111D18", "raised"],
                  ["Ivory", "#ECE6D6", "15.1:1 text"],
                  ["Muted", "#A3AD9F", "7.5:1 text"],
                  ["Sage action", "#8FCBA9", "10.1:1 · ink on it 10.1:1"],
                  ["Champagne", "#D8BE80", "10.4:1 text & ornament"],
                  ["Seal face", "#0F3B2C", "emblem ground"],
                ]}
              />
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Today, re-skinned only: the same blocks in the same order as the live
 * screen (src/app/(app)/dashboard) — date + Plan my day, greeting, the day as
 * one line with a "now" marker, the assistant's recommendation, "Later" with
 * add-a-task, and Momentum. Nothing new is added.
 */
function TodayMock({ mode, emblem }: { mode: "light" | "dark"; emblem: string | null }) {
  const nav = [
    { icon: Sun, label: "Today", active: true },
    { icon: CalendarDays, label: "Calendar" },
    { icon: null, label: "Arovenna" },
    { icon: Sprout, label: "Progress" },
    { icon: CircleUserRound, label: "You" },
  ];
  const day: { time: string; title: string; meta: string; done?: boolean; event?: boolean }[] = [
    { time: "7:00 AM", title: "Morning run", meta: "30 min", done: true },
    { time: "10:00 AM", title: "Course module 4", meta: "45 min" },
    { time: "1:00 PM", title: "Call with Priya", meta: "Calendar · 30 min", event: true },
  ];
  return (
    <div className="arv overflow-hidden rounded-[24px]" data-mode={mode} style={{ boxShadow: "var(--shadow)" }}>
      <div className="arv-canvas flex">
        <nav aria-label={`Sample navigation (${mode})`} className="hair hidden w-[76px] shrink-0 flex-col items-center gap-5 border-r py-6 sm:flex">
          {nav.map(({ icon: Icon, label, active }) => (
            <span key={label} className="flex flex-col items-center gap-1 text-[11px]" style={{ color: active ? "var(--ink)" : "var(--muted)" }}>
              {Icon ? (
                <span className="grid size-9 place-items-center rounded-full" style={{ background: active ? "var(--surface-2)" : undefined }}>
                  <Icon className="size-[18px]" aria-hidden />
                </span>
              ) : (
                // Navigation never animates the seal: being on a page isn't assistant activity.
                <Seal size={34} emblem={emblem} />
              )}
              {label}
            </span>
          ))}
        </nav>
        <div className="min-w-0 flex-1 p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow">Thursday, October 8</p>
            <span className="btn btn-secondary">Plan my day</span>
          </div>
          <h3 className="serif mt-3 text-[40px] leading-[1.02] sm:text-[44px]">Good morning, Sam.</h3>
          <p className="muted mt-2 text-[17px] leading-snug">Two things planned, one call.</p>

          {/* The day as one line */}
          <ol className="mt-7" aria-label="Today">
            {day.slice(0, 1).map((e) => (
              <DayRow key={e.title} {...e} />
            ))}
            <li className="grid grid-cols-[4.5rem_1fr] items-center gap-x-3 py-1.5" aria-label="Now, 9:42 AM">
              <span className="num flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--gold-ink)" }}>
                <span className="now-dot" aria-hidden /> 9:42
              </span>
              <span className="h-px" style={{ background: "var(--gold)", opacity: 0.6 }} />
            </li>
            {day.slice(1).map((e) => (
              <DayRow key={e.title} {...e} />
            ))}
          </ol>

          {/* The assistant's recommendation */}
          <section className="panel mt-6 p-5 sm:p-6" aria-label="Recommendation">
            <div className="flex items-center gap-2.5">
              <Seal size={22} emblem={emblem} />
              <p className="eyebrow">Start with this</p>
            </div>
            <p className="serif mt-3 text-[28px] leading-[1.1]">Course module 4</p>
            <p className="muted mt-2 text-[15px] leading-relaxed">It&rsquo;s at 10:00 and your morning is clear until the call at 1.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="btn btn-primary">
                <Check className="size-4" aria-hidden /> Mark done
              </span>
            </div>
          </section>

          {/* Later: untimed tasks + add */}
          <p className="eyebrow mt-8">Later</p>
          <ul className="mt-2">
            {["Reply to Dana about Friday", "Grocery list"].map((t) => (
              <li key={t} className="hair flex min-h-12 items-center gap-3 border-b">
                <span className="size-[22px] shrink-0 rounded-full border" style={{ borderColor: "var(--line)" }} aria-hidden />
                <span className="text-[15px]">{t}</span>
              </li>
            ))}
            <li className="flex min-h-12 items-center gap-3 text-[15px]" style={{ color: "var(--muted)" }}>
              <Plus className="size-[18px]" aria-hidden /> Add a task
            </li>
          </ul>

          {/* Momentum */}
          <p className="eyebrow mt-8">Momentum</p>
          <div className="mt-3">
            <div className="flex items-baseline justify-between gap-4">
              <p className="serif truncate text-[22px] leading-tight">Run three times a week</p>
              <p className="shrink-0 text-[14px] font-medium" style={{ color: "var(--action)" }}>
                On track
              </p>
            </div>
            <div className="mt-2.5 flex items-center gap-3">
              <div className="h-1 flex-1 rounded-full" style={{ background: "var(--surface-2)" }}>
                <div className="h-full w-2/3 rounded-full" style={{ background: "var(--action)" }} />
              </div>
              <p className="num muted shrink-0 text-[14px]">2 of 3</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/*
 * The supplied wordmark, cropped from the logo file (image px x 180–1074,
 * y 836–950; ratio 894:114). `lighten` lets the tile's near-black green fall
 * away against the darker-or-equal hero, so only the gold letters show. It
 * works on dark grounds only; ivory needs a transparent asset.
 *   background-size  1254/894                 = 140.27%
 *   position x       (180/894)/(1254/894 − 1) = 50%
 *   position y       (836/114)/(1254/114 − 1) = 73.33%
 */
function Wordmark({ emblem, width }: { emblem: string; width: number }) {
  return (
    <span
      role="img"
      aria-label="Arovenna"
      className="block shrink-0"
      style={{
        width,
        height: Math.round((width * 114) / 894),
        backgroundImage: `url(${emblem})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: "140.27% auto",
        backgroundPosition: "50% 73.33%",
        mixBlendMode: "lighten",
      }}
    />
  );
}

function DayRow({ time, title, meta, done, event }: { time: string; title: string; meta: string; done?: boolean; event?: boolean }) {
  return (
    <li className="grid min-h-14 grid-cols-[4.5rem_1fr] items-center gap-x-3">
      <span className="num muted text-[12px]">{time}</span>
      <span className="flex items-center gap-3">
        {event ? (
          <span className="h-6 w-[3px] shrink-0 rounded-full" style={{ background: "var(--action)", opacity: 0.55 }} aria-hidden />
        ) : (
          <span
            className="grid size-[22px] shrink-0 place-items-center rounded-full border"
            style={done ? { background: "var(--action)", borderColor: "var(--action)", color: "var(--action-ink)" } : { borderColor: "var(--line)" }}
            aria-hidden
          >
            {done ? <Check className="size-3" strokeWidth={3} /> : null}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium" style={done ? { color: "var(--muted)", textDecoration: "line-through" } : undefined}>
            {title}
          </span>
          <span className="muted block text-[12px]">{meta}</span>
        </span>
      </span>
    </li>
  );
}

function Swatches({ mode, rows }: { mode: "light" | "dark"; rows: [string, string, string][] }) {
  return (
    <div className="arv panel p-6" data-mode={mode}>
      <p className="eyebrow">{mode === "light" ? "Light · ivory" : "Dark · forest"}</p>
      <ul className="mt-4 divide-y" style={{ borderColor: "var(--hairline)" }}>
        {rows.map(([name, hex, note]) => (
          <li key={name} className="flex items-center gap-4 py-3" style={{ borderColor: "var(--hairline)" }}>
            <span className="size-9 shrink-0 rounded-full" style={{ background: hex, boxShadow: "inset 0 0 0 1px var(--line)" }} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">{name}</span>
              <span className="muted num block font-mono text-[12px]">{hex}</span>
            </span>
            <span className="muted text-right text-[12px]">{note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
