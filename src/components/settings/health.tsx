"use client";

import { useState, useTransition } from "react";
import { Activity, Bed, Dumbbell, Flame, Footprints, HeartPulse, Lock, Route, Smartphone } from "lucide-react";
import { disconnectFitnessSource } from "@/lib/actions/integrations";
import type { FitnessConnectionState, FitnessIssue } from "@/lib/integrations/fitness/status";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { brand } from "@/config/brand";

export interface FitnessState {
  provider: "apple_health" | "health_connect";
  state: FitnessConnectionState;
  issue: FitnessIssue | null;
  lastSynced: string | null;
}

const CATEGORIES = [
  { label: "Steps", icon: Footprints },
  { label: "Active energy", icon: Flame },
  { label: "Distance", icon: Route },
  { label: "Sleep", icon: Bed },
  { label: "Workouts", icon: Dumbbell },
];

const SOURCES = {
  apple_health: {
    title: "Apple Health",
    detail: "HealthKit",
    device: "iPhone",
    app: `the ${brand.name} iPhone app`,
    icon: HeartPulse,
    steps: [
      `Install ${brand.name} on your iPhone and sign in with this account.`,
      "Tap Connect Apple Health and choose which data to share.",
      "Your activity syncs automatically whenever you open the app.",
    ],
    revoke: "You can change what's shared anytime in the Health app → Sharing → Apps → " + brand.name + ".",
  },
  health_connect: {
    title: "Health Connect",
    detail: "Google Health Connect",
    device: "Android",
    app: `the ${brand.name} Android app`,
    icon: Smartphone,
    steps: [
      `Install ${brand.name} on your Android phone and sign in with this account.`,
      "Tap Connect Health Connect and choose which data to share.",
      "Your activity syncs automatically whenever you open the app.",
    ],
    revoke: "You can change what's shared anytime in Settings → Health Connect → App permissions → " + brand.name + ".",
  },
} as const;

const STATUS: Record<FitnessConnectionState, { label: string; tone: "neutral" | "success" | "accent" | "warning" }> = {
  not_connected: { label: "Not connected", tone: "neutral" },
  syncing: { label: "Syncing", tone: "accent" },
  connected: { label: "Connected", tone: "success" },
  needs_attention: { label: "Needs attention", tone: "warning" },
};

function issueText(f: FitnessState, app: string): string {
  if (f.issue === "permission_denied") return `Health access was turned off on your phone. Open ${app} and reconnect to resume syncing.`;
  if (f.issue === "stale") return `No new data has arrived${f.lastSynced ? ` since ${f.lastSynced}` : " yet"}. Open ${app} to sync.`;
  return `Syncing ran into a problem. Open ${app} and reconnect.`;
}

/**
 * Health & Fitness in Settings. Apple Health and Health Connect can only be
 * read by the native apps on the user's phone, so "Connect" explains how to
 * connect there — the website never pretends to be connected. Status comes
 * from the server (what the phone has actually synced).
 */
export function HealthSettings({ sources, isDemo }: { sources: FitnessState[]; isDemo: boolean }) {
  const [open, setOpen] = useState<FitnessState["provider"] | null>(null);
  const [confirming, setConfirming] = useState<FitnessState["provider"] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const disconnect = (provider: FitnessState["provider"]) =>
    startTransition(async () => {
      setMsg(null);
      const res = await disconnectFitnessSource(provider);
      setMsg(res.ok ? { ok: true, text: res.message ?? "Disconnected." } : { ok: false, text: res.error ?? "Something went wrong." });
      setConfirming(null);
    });

  return (
    <section aria-labelledby="int-health">
      <h3 id="int-health" className="mb-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
        Health &amp; Fitness
      </h3>
      <p className="mb-3 text-[14px] leading-snug text-muted">
        Connect your health data to give your AI a better understanding of your activity, routines, and progress.
      </p>

      <div className="flex flex-col gap-2.5">
        {sources.map((f) => {
          const s = SOURCES[f.provider];
          const status = STATUS[f.state];
          const Icon = s.icon;
          const linked = f.state !== "not_connected";
          const expanded = open === f.provider;
          return (
            <div key={f.provider} className="rounded-[22px] bg-surface-2/70 p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-surface text-accent shadow-card" aria-hidden>
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="font-semibold">{s.title}</p>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  <p className="mt-0.5 text-[13px] leading-snug text-muted">
                    {s.detail} · {s.device}
                    {f.state === "connected" && f.lastSynced ? ` · synced ${f.lastSynced}` : ""}
                  </p>
                  {f.state === "syncing" ? (
                    <p className="mt-1.5 text-[13px] leading-snug text-muted">Connected on your phone — waiting for the first sync from {s.app}.</p>
                  ) : f.state === "needs_attention" ? (
                    <p className="mt-1.5 text-[13px] leading-snug text-warning">{issueText(f, s.app)}</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 pl-[52px]">
                {isDemo ? (
                  <p className="text-[13px] text-muted">Available in your own account. The shared demo never connects to health data.</p>
                ) : linked ? (
                  confirming === f.provider ? (
                    <>
                      <Button size="sm" variant="danger" disabled={pending} onClick={() => disconnect(f.provider)}>
                        {pending ? "Removing…" : "Yes, disconnect and delete"}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      {f.state === "needs_attention" ? (
                        <Button size="sm" variant="secondary" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : f.provider)}>
                          How to reconnect
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(f.provider)}>
                        Disconnect
                      </Button>
                    </>
                  )
                ) : (
                  <Button size="sm" aria-expanded={expanded} aria-controls={`connect-${f.provider}`} onClick={() => setOpen(expanded ? null : f.provider)}>
                    Connect
                  </Button>
                )}
              </div>

              {confirming === f.provider ? (
                <p className="mt-2 pl-[52px] text-[13px] text-muted" role="note">
                  This deletes the {s.title} data {brand.name} has stored. Data on your phone isn&apos;t touched.
                </p>
              ) : null}

              {expanded && !isDemo ? (
                <div id={`connect-${f.provider}`} className="mt-3 animate-fade-in rounded-2xl bg-surface p-4 shadow-card sm:ml-[52px]">
                  <p className="text-[14px] font-semibold">Connect from your {s.device}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-muted">
                    {s.title} data lives on your phone, so a website can&apos;t read it. Connecting requires {s.app}.
                  </p>
                  <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-[14px] leading-snug marker:text-muted">
                    {s.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  <p className="mt-3 text-[13px] leading-snug text-muted">{s.revoke}</p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-[22px] border border-hairline p-4">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <Activity className="size-4 text-accent" aria-hidden /> What {brand.name} can use
        </p>
        <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Supported health data">
          {CATEGORIES.map(({ label, icon: CatIcon }) => (
            <li key={label} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[13px] font-medium">
              <CatIcon className="size-3.5 text-muted" aria-hidden /> {label}
            </li>
          ))}
        </ul>
        <p className={cn("mt-3 flex items-start gap-2 text-[13px] leading-snug text-muted")}>
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            You control which health data you share with {brand.name}. Only daily totals and workout summaries are stored — no heart rate, locations or medical
            records — and disconnecting deletes them.
          </span>
        </p>
      </div>

      <div className="mt-3 min-h-5" aria-live="polite">
        {msg ? <FormMessage tone={msg.ok ? "success" : "error"}>{msg.text}</FormMessage> : null}
      </div>
    </section>
  );
}
