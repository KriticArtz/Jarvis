import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Bell, ChevronRight, Lock, Palette, Sparkles, User } from "lucide-react";
import { brand } from "@/config/brand";
import { designPreviewEnabled } from "@/lib/env";
import { APPEARANCES, THEMES, THEME_OPTIONS, type Appearance, type Theme } from "@/lib/personalization";
import { PersonalizationShell } from "@/components/app/personalization";
import { Presence } from "@/components/ui/presence";
import { Button, IconButton } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Loading, Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { ToastProvider } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { AppearanceDemo, PresenceDemo, SheetDemo, SwitchDemo, ToastDemo, ViewDemo } from "./demos";

export const metadata: Metadata = { title: "Design foundation", robots: { index: false, follow: false } };

/**
 * Internal design-system review (Phase 1 of the redesign). Not linked from
 * the app; gated by designPreviewEnabled(). Query params:
 *   view  = type | components
 *   mode  = light | dark | system
 *   theme = ocean | midnight | violet | rose | emerald | warm
 * All content is sample data — nothing here reads or writes user data.
 */
export default async function DesignPage({ searchParams }: PageProps<"/design">) {
  // Decide per request (the gate reads the runtime environment), never at build time.
  await connection();
  if (!designPreviewEnabled()) notFound();
  const p = await searchParams;
  const one = (v: unknown) => (typeof v === "string" ? v : undefined);
  const view = one(p.view) === "components" ? "components" : "type";
  const mode = (APPEARANCES as readonly string[]).includes(one(p.mode) ?? "") ? (one(p.mode) as Appearance) : "light";
  const theme = (THEMES as readonly string[]).includes(one(p.theme) ?? "") ? (one(p.theme) as Theme) : "ocean";
  const href = (patch: Record<string, string>) => `/design?${new URLSearchParams({ view, mode, theme, ...patch })}`;

  return (
    <PersonalizationShell assistantName={brand.assistantName} theme={theme} appearance={mode} className="min-h-dvh">
      <script dangerouslySetInnerHTML={{ __html: `document.documentElement.dataset.theme=${JSON.stringify(theme)};document.documentElement.dataset.mode=${JSON.stringify(mode)};` }} />
      <ToastProvider>
        <Controls href={href} view={view} mode={mode} theme={theme} />
        <main className="mx-auto w-full max-w-[1120px] px-4 pb-24 pt-8 sm:px-6 md:pt-12">
          {view === "type" ? <TypeView /> : <ComponentsView />}
        </main>
      </ToastProvider>
    </PersonalizationShell>
  );
}

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[13px] font-medium transition-colors",
        active ? "bg-foreground text-background" : "text-muted hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function Controls({ href, view, mode, theme }: { href: (p: Record<string, string>) => string; view: string; mode: Appearance; theme: Theme }) {
  return (
    <nav aria-label="Preview options" className="sticky top-0 z-30 border-b border-hairline bg-background/80 backdrop-blur-xl" data-testid="controls">
      <div className="no-scrollbar mx-auto flex max-w-[1120px] items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6">
        <Pill href={href({ view: "type" })} active={view === "type"}>
          Typography
        </Pill>
        <Pill href={href({ view: "components" })} active={view === "components"}>
          Components
        </Pill>
        <span className="mx-1.5 h-4 w-px shrink-0 bg-line" />
        {(["light", "dark"] as const).map((m) => (
          <Pill key={m} href={href({ mode: m })} active={mode === m}>
            {m === "light" ? "Light" : "Dark"}
          </Pill>
        ))}
        <span className="mx-1.5 h-4 w-px shrink-0 bg-line" />
        {THEME_OPTIONS.map((t) => (
          <Link key={t.value} href={href({ theme: t.value })} aria-label={t.title} aria-current={theme === t.value ? "page" : undefined} className="flex size-8 shrink-0 items-center justify-center">
            <span
              className={cn("size-4 rounded-full", theme === t.value && "ring-2 ring-foreground ring-offset-2 ring-offset-background")}
              style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }}
            />
          </Link>
        ))}
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------------- typography in context */

function Frame({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-label={label} className={cn("flex flex-col", className)}>
      <p className="mb-3 px-1 text-[12px] font-medium text-subtle">{label}</p>
      <div className="flex-1 rounded-sheet bg-background p-5 shadow-[0_0_0_1px_var(--hairline)] sm:p-7">{children}</div>
    </section>
  );
}

function TypeView() {
  return (
    <div className="flex flex-col gap-10">
      <header className="max-w-2xl">
        <p className="type-eyebrow">Typography in context</p>
        <h1 className="type-display mt-2 text-display sm:text-hero">Instrument Serif, Geist, Geist Mono.</h1>
        <p className="mt-3 text-lead text-muted">
          Instrument Serif for moments of meaning — greetings, headlines, goal titles. Geist for the interface and the assistant&apos;s voice. Geist Mono
          for clock numerals.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        <Frame label="Today — greeting and recommendation">
          <TodaySample />
        </Frame>
        <Frame label="Assistant — a reply and an action">
          <AssistantSample />
        </Frame>
        <Frame label="Goal">
          <GoalSample />
        </Frame>
        <Frame label="Calendar — day">
          <CalendarSample />
        </Frame>
        <Frame label="You — settings" className="lg:col-span-2">
          <SettingsSample />
        </Frame>
      </div>
    </div>
  );
}

const THREAD = [
  { time: "09:00", kind: "Deep work", title: "Finish the proposal", ai: true },
  { time: "12:30", kind: "Workout", title: "45 minutes", ai: false },
  { time: "18:00", kind: "Personal", title: "Call Mom", ai: false },
];

function TodaySample() {
  return (
    <div>
      <p className="type-eyebrow">Thursday, October 8</p>
      <h2 className="type-display mt-2 text-display sm:text-hero">Good morning, Sam.</h2>
      <p className="mt-2 text-lead text-muted">A full day. Three things matter.</p>

      <ol className="relative mt-7 flex flex-col gap-5 pl-6 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-line">
        {THREAD.map((t, i) => (
          <li key={t.time} className="relative">
            <span
              aria-hidden
              className={cn("absolute -left-6 top-1.5 size-[11px] rounded-full border-2 border-background", i === 0 ? "bg-now" : "bg-line")}
            />
            <p className="type-time text-[13px] text-muted">{t.time}</p>
            <p className="mt-0.5 text-[16px] font-medium">{t.title}</p>
            <p className="text-[13px] text-muted">{t.kind}</p>
          </li>
        ))}
      </ol>

      <div className="bg-assistant mt-7 rounded-panel p-5 shadow-lift">
        <div className="flex items-start gap-3">
          <Presence size="sm" className="mt-1" />
          <p className="type-voice">Start with the proposal. You have a clear 90-minute window before your first meeting.</p>
        </div>
        <div className="mt-4 flex gap-2 pl-9">
          <Button>Start my day</Button>
          <Button variant="ghost">Not now</Button>
        </div>
      </div>
    </div>
  );
}

function AssistantSample() {
  return (
    <div className="flex flex-col gap-5">
      <p className="ml-auto max-w-[80%] rounded-[20px] rounded-br-[6px] bg-accent px-4 py-2.5 text-[15px] leading-snug text-accent-foreground">
        Can we move my workout? I&apos;m wiped.
      </p>
      <div className="flex gap-3">
        <Presence size="sm" className="mt-1" />
        <div className="min-w-0 flex-1">
          <p className="type-voice">Of course. Tomorrow at 6 is open, so I moved it there and kept tonight light. Get some rest — you&apos;ve trained three days straight.</p>
          <div className="mt-4 overflow-hidden rounded-tile bg-surface-raised shadow-card">
            <div className="flex items-center gap-2 border-b border-hairline px-4 py-2">
              <span className="size-1.5 rounded-full bg-success" />
              <span className="type-eyebrow text-success">Moved</span>
            </div>
            <div className="px-4 py-3">
              <p className="text-[16px] font-semibold">Workout</p>
              <p className="type-num mt-0.5 text-[14px]">Tomorrow · 6:00 PM</p>
              <p className="type-num mt-1 text-[13px] text-subtle line-through decoration-subtle/60">Today · 6:00 PM</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoalSample() {
  return (
    <div>
      <p className="type-eyebrow">Goal · Fitness</p>
      <h2 className="type-display mt-2 text-headline sm:text-display">Run a half marathon</h2>
      <p className="mt-2 text-[15px] text-muted">For the March race — and to prove I can finish what I start.</p>
      <div className="mt-6 flex items-baseline gap-2">
        <span className="type-display text-[40px] leading-none">18</span>
        <span className="type-num text-[15px] text-muted">/ 42 miles this month</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="bg-brand-gradient h-full w-[43%] rounded-full" />
      </div>
      <p className="mt-3 flex items-center gap-2 text-[15px] font-medium text-success">
        <span className="size-1.5 rounded-full bg-success" /> You&apos;re on track.
      </p>
      <div className="mt-6 border-t border-hairline pt-4">
        <p className="type-eyebrow">Next</p>
        <p className="mt-1.5 text-[16px] font-medium">Easy 3-mile run</p>
        <p className="type-num text-[14px] text-muted">Tomorrow · 6:00 PM</p>
      </div>
    </div>
  );
}

const HOURS = ["8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM"];

function CalendarSample() {
  const ROW = 52;
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="type-eyebrow">Thursday</p>
          <h2 className="type-display mt-1 text-headline">October 8</h2>
        </div>
        <ViewDemo />
      </div>
      <div className="relative mt-5" style={{ height: ROW * HOURS.length }}>
        {HOURS.map((h, i) => (
          <div key={h} className="absolute inset-x-0 flex items-start gap-3" style={{ top: i * ROW }}>
            <span className="type-time w-12 shrink-0 -translate-y-2 text-right text-[11px] text-subtle">{h}</span>
            <span className="mt-0 h-px flex-1 bg-hairline" />
          </div>
        ))}
        <Event top={ROW * 1} height={ROW * 0.5} title="Team standup" time="9:00 – 9:30" />
        <Event top={ROW * 1.5} height={ROW * 1.5} title="Deep work · Proposal" time="9:30 – 11:00" ai />
        <Event top={ROW * 4.5} height={ROW * 0.75} title="Workout" time="12:30 – 1:15" />
        <div className="absolute inset-x-0 flex items-center gap-3" style={{ top: ROW * 2.25 }}>
          <span className="type-time w-12 shrink-0 -translate-y-px text-right text-[11px] font-semibold text-now">10:15</span>
          <span className="relative h-[2px] flex-1 rounded-full bg-now before:absolute before:-left-1 before:-top-[3px] before:size-2 before:rounded-full before:bg-now" />
        </div>
      </div>
    </div>
  );
}

function Event({ top, height, title, time, ai }: { top: number; height: number; title: string; time: string; ai?: boolean }) {
  return (
    <div
      className={cn(
        "absolute left-[60px] right-0 overflow-hidden rounded-control px-3 py-1.5",
        ai ? "bg-assistant shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--presence-b)_35%,transparent)]" : "bg-surface-2 shadow-[inset_0_0_0_1px_var(--hairline)]",
      )}
      style={{ top: top + 2, height: height - 4 }}
    >
      <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold">
        {ai ? <Presence size="xs" /> : null}
        {title}
        {height < 48 ? <span className="type-num truncate text-[11px] font-normal text-muted">{time}</span> : null}
      </p>
      {height < 48 ? null : <p className="type-num truncate text-[11px] text-muted">{time}</p>}
    </div>
  );
}

function SettingsSample() {
  return (
    <div className="grid gap-8 md:grid-cols-[1fr_1.2fr]">
      <div>
        <h2 className="type-display text-display">You</h2>
        <p className="mt-2 text-[15px] text-muted">How {brand.assistantName} works with you.</p>
        <div className="mt-6 flex items-center gap-4">
          <Presence size="lg" />
          <div>
            <p className="text-title font-semibold">{brand.assistantName}</p>
            <p className="text-[14px] text-muted">Direct · “Here&apos;s what needs to happen.”</p>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-6">
        <ListGroup title="Your AI">
          <ListRow leading={<Sparkles className="size-5" aria-hidden />} title="Personality" trailing="Direct" href="#" />
          <ListRow leading={<Palette className="size-5" aria-hidden />} title="Appearance" below={<AppearanceDemo size="sm" />} />
        </ListGroup>
        <ListGroup title="Account" footer="Your data is private to you and can be deleted anytime.">
          <ListRow leading={<User className="size-5" aria-hidden />} title="Profile" description="Sam · sam@example.com" href="#" />
          <ListRow leading={<Bell className="size-5" aria-hidden />} title="Check-ins" description="Morning and evening" trailing={<SwitchDemo label="Check-ins" />} />
          <ListRow leading={<Lock className="size-5" aria-hidden />} title="Privacy & data" href="#" />
        </ListGroup>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- tokens & primitives */

function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-hairline pt-6">
      <div className="mb-5">
        <h2 className="text-title font-semibold">{title}</h2>
        {note ? <p className="mt-1 max-w-2xl text-[14px] text-muted">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

const SWATCHES = [
  ["background", "Canvas"],
  ["surface-raised", "Raised"],
  ["surface-2", "Fill"],
  ["foreground", "Ink"],
  ["muted", "Muted"],
  ["subtle", "Subtle"],
  ["accent", "Accent"],
  ["accent-soft", "Accent soft"],
  ["success", "Success"],
  ["warning", "Warning"],
  ["danger", "Danger"],
] as const;

const SCALE = [
  ["text-hero", "48 / Hero"],
  ["text-display", "36 / Display"],
  ["text-headline", "28 / Headline"],
  ["text-title", "20 / Title"],
  ["text-lead", "17 / Lead"],
  ["text-body", "15 / Body"],
  ["text-caption", "13 / Caption"],
  ["text-micro", "11 / Micro"],
] as const;

const RADII = [
  ["rounded-chip", "chip"],
  ["rounded-control", "control"],
  ["rounded-tile", "tile"],
  ["rounded-panel", "panel"],
  ["rounded-sheet", "sheet"],
] as const;

function ComponentsView() {
  return (
    <div className="flex flex-col gap-12">
      <header className="max-w-2xl">
        <p className="type-eyebrow">Design foundation</p>
        <h1 className="type-display mt-2 text-display sm:text-hero">Editorial calm, one living presence.</h1>
        <p className="mt-3 text-lead text-muted">Tokens and primitives for the redesign. Everything below is built from the shared components in src/components/ui.</p>
      </header>

      <Block title="Presence" note="The AI's identity — survives a rename. Idle breathes; listening brightens; thinking ripples; acting sends a pulse out. Holds still with reduced motion.">
        <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-center">
          <PresenceDemo />
          <div className="grid grid-cols-4 gap-4 text-center">
            {(["idle", "listening", "thinking", "acting"] as const).map((s) => (
              <div key={s} className="flex flex-col items-center gap-3">
                <Presence size="lg" state={s} />
                <span className="text-[12px] text-muted capitalize">{s}</span>
              </div>
            ))}
            {(["xs", "sm", "md"] as const).map((s) => (
              <div key={s} className="flex flex-col items-center justify-end gap-3">
                <Presence size={s} />
                <span className="text-[12px] text-muted">{s}</span>
              </div>
            ))}
          </div>
        </div>
      </Block>

      <Block title="Color" note="Paper and ink are designed separately. The gradient belongs to the AI; the accent marks meaning.">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {SWATCHES.map(([token, label]) => (
            <div key={token}>
              <div className="h-14 rounded-tile shadow-[inset_0_0_0_1px_var(--hairline)]" style={{ background: `var(--${token})` }} />
              <p className="mt-1.5 text-[12px] font-medium">{label}</p>
              <p className="type-time text-[11px] text-subtle">--{token}</p>
            </div>
          ))}
          <div>
            <div className="bg-brand-gradient h-14 rounded-tile" />
            <p className="mt-1.5 text-[12px] font-medium">Presence</p>
            <p className="type-time text-[11px] text-subtle">--presence-a/b</p>
          </div>
        </div>
      </Block>

      <Block title="Type" note="Geist for UI, the display role for moments of meaning, Geist Mono for times.">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            {SCALE.map(([k, label]) => (
              <div key={k} className="flex items-baseline gap-4">
                <span className="type-time w-24 shrink-0 text-[11px] text-subtle">{label}</span>
                <span className={cn("min-w-0 truncate font-medium", k)}>What matters today</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-4">
            <p className="type-eyebrow">Eyebrow · Up next</p>
            <p className="type-display text-display">Good evening.</p>
            <p className="type-voice">You finished the proposal and kept your workout. That&apos;s the day you planned.</p>
            <p className="text-[15px]">
              <span className="type-time">09:00 · 12:30 · 18:00</span> <span className="type-num text-muted">· 42.5 miles · 3 of 4 done</span>
            </p>
          </div>
        </div>
      </Block>

      <Block title="Radius & depth" note="Five radii: chip 8 · control 12 · tile 18 · panel 24 · sheet 28 (plus full for pills).">
        <div className="flex flex-wrap items-end gap-4">
          {RADII.map(([cls, r]) => (
            <div key={r} className="text-center">
              <div className={cn("size-20 bg-surface-raised shadow-card", cls)} />
              <p className="mt-2 text-[12px] text-muted">{r}</p>
            </div>
          ))}
          <div className="text-center">
            <div className="size-20 rounded-panel bg-surface-raised shadow-lift" />
            <p className="mt-2 text-[12px] text-muted">lift</p>
          </div>
        </div>
      </Block>

      <Block title="Buttons">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Start my day</Button>
            <Button variant="secondary">Re-plan</Button>
            <Button variant="ghost">Not now</Button>
            <Button variant="danger">Delete goal</Button>
            <Button disabled>Disabled</Button>
            <IconButton aria-label="More">
              <ChevronRight className="size-5" aria-hidden />
            </IconButton>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
        </div>
      </Block>

      <Block title="Fields & controls">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <Field label="Goal" htmlFor="d-goal" hint="Be as specific as you like.">
              <Input id="d-goal" placeholder="Run a half marathon" />
            </Field>
            <Field label="Why it matters" htmlFor="d-why">
              <Textarea id="d-why" placeholder="For the March race" />
            </Field>
            <Field label="Repeats" htmlFor="d-rep" error="Choose how often.">
              <Select id="d-rep" aria-invalid defaultValue="">
                <option value="">Choose…</option>
                <option>Weekly</option>
              </Select>
            </Field>
          </div>
          <div className="flex flex-col gap-5">
            <AppearanceDemo />
            <ViewDemo />
            <div className="flex items-center gap-4">
              <SwitchDemo label="Demo on" />
              <SwitchDemo label="Demo off" initial={false} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>Neutral</Badge>
              <Badge tone="accent">Accent</Badge>
              <Badge tone="success">On track</Badge>
              <Badge tone="warning">Behind</Badge>
              <Badge tone="danger">Failed</Badge>
            </div>
          </div>
        </div>
      </Block>

      <Block title="Lists" note="Grouped rows replace stacks of cards for settings and short lists.">
        <div className="grid gap-6 md:grid-cols-2">
          <ListGroup title="Notifications" footer="Check-ins arrive at the times you choose.">
            <ListRow title="Morning check-in" description="8:00 AM" trailing={<SwitchDemo label="Morning check-in" />} />
            <ListRow title="Evening check-in" description="8:30 PM" trailing={<SwitchDemo label="Evening check-in" initial={false} />} />
            <ListRow title="Quiet hours" trailing="10 PM – 7 AM" href="#" />
          </ListGroup>
          <ListGroup title="Data">
            <ListRow title="Export my data" href="#" />
            <ListRow title="Delete account" tone="danger" onClick={undefined} />
          </ListGroup>
        </div>
      </Block>

      <Block title="Surfaces" note="Raised for things you act on, plain inside a raised parent, AI for what the assistant authored.">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <p className="font-semibold">Raised</p>
            <p className="mt-1 text-[14px] text-muted">An action, a result, a form.</p>
          </Card>
          <Card variant="plain">
            <p className="font-semibold">Plain</p>
            <p className="mt-1 text-[14px] text-muted">Grouping inside a raised surface.</p>
          </Card>
          <Card variant="ai">
            <div className="flex items-center gap-2">
              <Presence size="xs" />
              <p className="font-semibold">AI</p>
            </div>
            <p className="mt-1 text-[14px] text-muted">Authored by the assistant.</p>
          </Card>
        </div>
      </Block>

      <Block title="Loading" note="Skeletons take the shape of the real content.">
        <Loading label="Loading today" className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-9 w-64" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-4 w-12" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="mt-2 h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-panel bg-surface-raised p-5 shadow-card">
            <div className="flex gap-3">
              <Skeleton className="size-6 rounded-full" />
              <SkeletonText lines={3} className="flex-1" />
            </div>
          </div>
        </Loading>
      </Block>

      <Block title="Sheet & toast" note="Sheets rise from the bottom on phones (drag down to dismiss) and center on larger screens. Toasts spring in above the tab bar.">
        <div className="flex flex-wrap items-start gap-3">
          <SheetDemo />
          <ToastDemo />
        </div>
      </Block>

      <Block title="Motion" note="Short, causal motion. Every animation stops under prefers-reduced-motion.">
        <ul className="grid gap-2 text-[14px] sm:grid-cols-2">
          {[
            ["--dur-1 · 120ms", "press feedback"],
            ["--dur-2 · 200ms", "hover, color, small state changes"],
            ["--dur-3 · 320ms", "switches, segmented indicator, sheets"],
            ["--dur-4 · 520ms", "entrances, plan assembly"],
            ["ease-soft", "default — quick out, gentle settle"],
            ["ease-spring", "physical things: thumbs, toasts, completions"],
            ["ease-swift", "exits and cross-fades"],
          ].map(([k, v]) => (
            <li key={k} className="flex justify-between gap-4 border-b border-hairline py-2">
              <span className="type-time">{k}</span>
              <span className="text-muted">{v}</span>
            </li>
          ))}
        </ul>
      </Block>
    </div>
  );
}
