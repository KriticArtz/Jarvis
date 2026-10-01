"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, RefreshCw } from "lucide-react";
import type { ActionResult } from "@/lib/actions/result";
import { disconnectCalendar, syncCalendarNow } from "@/lib/actions/integrations";
import { HealthSettings, type FitnessState } from "./health";
import { Badge } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { brand } from "@/config/brand";

export interface CalendarState {
  configured: boolean;
  status: "not_connected" | "connected" | "error";
  lastSynced: string | null;
  upcoming: number;
  /** The grant allows creating/changing events; false = connected read-only (Phase 1 grant). */
  writable: boolean;
}

export type { FitnessState } from "./health";

/** Messages for the OAuth round-trip result (?calendar=… on return from Google). */
const FLASH: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Google Calendar connected. Your upcoming events are synced." },
  connected_sync_failed: { ok: false, text: "Connected, but the first sync failed. Try “Sync now”." },
  denied: { ok: false, text: "Google Calendar wasn't connected — access was declined." },
  scope_denied: { ok: false, text: "Calendar access wasn't granted, so nothing changed. To connect or enable editing, try again and allow access to your calendar events." },
  invalid_state: { ok: false, text: "That connection attempt couldn't be verified. Please try again." },
  expired: { ok: false, text: "That connection attempt expired. Please try again." },
  not_configured: { ok: false, text: "Calendar sync isn't configured on this server yet." },
  demo: { ok: false, text: "Integrations are available in your own account, not the shared demo." },
  error: { ok: false, text: "Couldn't connect to Google Calendar. Please try again." },
};

function Row({ icon, title, subtitle, status, children }: { icon: React.ReactNode; title: string; subtitle: React.ReactNode; status: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="rounded-[22px] bg-surface-2/70 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-surface text-accent shadow-card" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-semibold">{title}</p>
            {status}
          </div>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">{subtitle}</p>
        </div>
      </div>
      {children ? <div className="mt-3 flex flex-wrap gap-2 pl-[52px]">{children}</div> : null}
    </div>
  );
}

export function IntegrationsSettings({ calendar, fitness, isDemo, flash }: { calendar: CalendarState; fitness: FitnessState[]; isDemo: boolean; flash: string | null }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(flash && FLASH[flash] ? FLASH[flash] : null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"sync" | "disconnect" | string | null>(null);

  const router = useRouter();
  // Show the OAuth result once: drop ?calendar=… (through the router, so later
  // refreshes don't bring it back) and a reload won't repeat a stale message.
  useEffect(() => {
    if (flash) router.replace("/settings#integrations", { scroll: false });
  }, [flash, router]);

  const run = (which: string, action: () => Promise<ActionResult>) =>
    startTransition(async () => {
      setBusy(which);
      setMsg(null);
      const res = await action();
      setMsg(res.ok ? { ok: true, text: res.message ?? "Done." } : { ok: false, text: res.error ?? "Something went wrong." });
      setBusy(null);
      setConfirming(false);
    });

  const connected = calendar.status === "connected";
  const needsReconnect = calendar.status === "error";

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="int-calendar">
        <h3 id="int-calendar" className="mb-2.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
          Calendar
        </h3>
        <Row
          icon={<CalendarDays className="size-5" />}
          title="Google Calendar"
          status={
            connected ? (
              calendar.writable ? (
                <Badge tone="success">Connected</Badge>
              ) : (
                <Badge tone="warning">Read-only</Badge>
              )
            ) : needsReconnect ? (
              <Badge tone="warning">Needs reconnecting</Badge>
            ) : (
              <Badge>Not connected</Badge>
            )
          }
          subtitle={
            isDemo
              ? "Available in your own account. The shared demo never connects to real calendars."
              : !calendar.configured
                ? "Not configured on this server yet."
                : connected
                  ? `${calendar.upcoming} event${calendar.upcoming === 1 ? "" : "s"} in the next 30 days${calendar.lastSynced ? ` · synced ${calendar.lastSynced}` : ""}. ${
                      calendar.writable
                        ? "You can add and change events from the Calendar page, and your assistant can too — only after you confirm each change."
                        : "Connected read-only, so events can't be added or changed from here. Reconnect to enable editing — Google will ask you to allow it."
                    }`
                  : needsReconnect
                    ? "Google access was revoked or expired. Reconnect to keep your events up to date."
                    : `Your primary calendar's events, so your assistant can plan around your real commitments. You can add and change events from ${brand.name}; your assistant always asks before changing anything.`
          }
        >
          {isDemo || !calendar.configured ? null : connected ? (
            <>
              {!calendar.writable ? (
                <a href="/api/integrations/google/start" className={buttonClass("primary", "sm")}>
                  Reconnect to enable editing
                </a>
              ) : null}
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("sync", syncCalendarNow)}>
                <RefreshCw className={cn("size-4", busy === "sync" && "animate-spin")} aria-hidden /> {busy === "sync" ? "Syncing…" : "Sync now"}
              </Button>
              {confirming ? (
                <>
                  <Button size="sm" variant="danger" disabled={pending} onClick={() => run("disconnect", disconnectCalendar)}>
                    {busy === "disconnect" ? "Disconnecting…" : "Yes, disconnect"}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(true)}>
                  Disconnect
                </Button>
              )}
            </>
          ) : (
            <>
              <a href="/api/integrations/google/start" className={buttonClass("primary", "sm")}>
                {needsReconnect ? "Reconnect" : "Connect"}
              </a>
              {needsReconnect ? (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("disconnect", disconnectCalendar)}>
                  {busy === "disconnect" ? "Removing…" : "Disconnect"}
                </Button>
              ) : null}
            </>
          )}
        </Row>
        {confirming ? (
          <p className="mt-2 px-1 text-[13px] text-muted" role="note">
            Disconnecting revokes access at Google and deletes the synced events from this app. Your Google Calendar itself isn&apos;t touched.
          </p>
        ) : null}
        <div className="mt-3 min-h-5" aria-live="polite">
          {msg ? <FormMessage tone={msg.ok ? "success" : "error"}>{msg.text}</FormMessage> : null}
        </div>
      </section>

      <HealthSettings sources={fitness} isDemo={isDemo} />
    </div>
  );
}
