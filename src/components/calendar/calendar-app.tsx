"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { syncCalendarNow } from "@/lib/actions/integrations";
import type { CalendarDay, LocalCalendarEvent } from "@/lib/integrations/calendar/local";
import type { EventDetails } from "@/lib/integrations/calendar/mutations";
import type { CalendarPageState } from "@/lib/integrations/calendar/page-data";
import { localDateTime } from "@/lib/integrations/calendar/times";
import { CALENDAR_VIEWS, calendarHref, shiftDate, viewTitle, type CalendarView } from "@/lib/integrations/calendar/view";
import { addDays, localMinutesNow, minutesToTime } from "@/lib/time";
import { Button, buttonClass } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { brand } from "@/config/brand";
import { Sheet } from "./sheet";
import { EventForm, type EventFormValues } from "./event-form";
import { EventDetailsView } from "./event-details";
import { AgendaList, MonthGrid, TimeGrid } from "./views";

const VIEW_LABEL: Record<CalendarView, string> = { day: "Day", week: "Week", month: "Month" };

type Panel =
  | { kind: "details"; event: LocalCalendarEvent }
  | { kind: "create"; initial: EventFormValues }
  | { kind: "edit"; event: LocalCalendarEvent; initial: EventFormValues }
  | null;

function syncedLabel(iso: string | null): string | null {
  if (!iso) return null;
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

function editValues(e: LocalCalendarEvent, details: EventDetails | null, tz: string, fallbackDate: string): EventFormValues {
  const start = e.startsAt ? localDateTime(e.startsAt, tz) : { date: fallbackDate, time: "09:00" };
  const end = e.endsAt ? localDateTime(e.endsAt, tz) : { date: fallbackDate, time: "10:00" };
  return {
    title: e.title,
    allDay: e.allDay,
    date: start.date,
    // All-day ends are exclusive; the form shows the last day.
    endDate: e.allDay ? addDays(end.date, -1) : end.date,
    startTime: e.allDay ? "09:00" : start.time,
    endTime: e.allDay ? "10:00" : end.time,
    location: e.location ?? "",
    description: details ? (details.description ?? "") : undefined,
    colorId: e.colorId ?? null,
  };
}

export function CalendarApp({
  view,
  date,
  today,
  timezone,
  days,
  state,
  lastSyncedAt,
  isDemo,
  configured,
}: {
  view: CalendarView;
  date: string;
  today: string;
  timezone: string;
  days: CalendarDay[];
  state: CalendarPageState;
  lastSyncedAt: string | null;
  isDemo: boolean;
  configured: boolean;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [syncing, startSync] = useTransition();
  const writable = state === "writable" && !isDemo;
  const connected = state === "writable" || state === "read_only";
  const canConnect = configured && !isDemo;

  function newEvent(at?: { date: string; time: string | null }) {
    if (!writable) return;
    let startMin: number;
    if (at?.time) startMin = Number(at.time.slice(0, 2)) * 60 + Number(at.time.slice(3, 5));
    else {
      // Next half hour today, otherwise 9 AM.
      const d = at?.date ?? (view === "day" ? date : today);
      startMin = d === today ? Math.min(Math.ceil((localMinutesNow(timezone) + 1) / 30) * 30, 22 * 60) : 9 * 60;
    }
    setPanel({
      kind: "create",
      initial: {
        title: "",
        allDay: false,
        date: at?.date ?? (view === "day" ? date : today),
        endDate: "",
        startTime: minutesToTime(startMin),
        endTime: minutesToTime(Math.min(startMin + 60, 23 * 60 + 59)),
        location: "",
        description: "",
        colorId: null,
      },
    });
  }

  function saved(text: string) {
    setPanel(null);
    setMsg({ ok: true, text });
    router.refresh();
  }

  function sync() {
    setMsg(null);
    startSync(async () => {
      const res = await syncCalendarNow();
      setMsg(res.ok ? { ok: true, text: res.message ?? "Synced." } : { ok: false, text: res.error ?? "Couldn't sync." });
      router.refresh();
    });
  }

  const title = viewTitle(view, date);
  const lastSynced = syncedLabel(lastSyncedAt);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[28px] font-bold leading-tight sm:text-[32px]">Calendar</h1>
            <p className="mt-0.5 truncate text-[14px] text-muted">
              {connected ? `Google Calendar${lastSynced ? ` · synced ${lastSynced}` : ""}` : "Your schedule, in one place"}
              {" · "}
              {timezone.replaceAll("_", " ")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {connected && !isDemo ? (
              <Button variant="secondary" size="sm" onClick={sync} disabled={syncing} aria-label="Sync now" className="h-11 px-3.5 sm:px-4">
                <RefreshCw className={cn("size-4", syncing && "animate-spin")} aria-hidden />
                <span className="hidden sm:inline">{syncing ? "Syncing…" : "Sync now"}</span>
              </Button>
            ) : null}
            <Button
              size="sm"
              onClick={() => newEvent()}
              disabled={!writable}
              aria-describedby={!writable ? "calendar-status" : undefined}
              className="h-11 px-3.5 sm:px-4"
            >
              <Plus className="size-4" aria-hidden /> <span>New event</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Link href={calendarHref(view, shiftDate(view, date, -1))} className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2" aria-label={`Previous ${view}`}>
              <ChevronLeft className="size-5" aria-hidden />
            </Link>
            <Link href={calendarHref(view, today)} className={buttonClass("secondary", "sm", "h-11")}>
              Today
            </Link>
            <Link href={calendarHref(view, shiftDate(view, date, 1))} className="flex size-11 items-center justify-center rounded-full hover:bg-surface-2" aria-label={`Next ${view}`}>
              <ChevronRight className="size-5" aria-hidden />
            </Link>
            <h2 className="ml-1 text-[17px] font-semibold" aria-live="polite">
              {title}
            </h2>
          </div>
          <nav aria-label="Calendar view" className="flex rounded-full bg-surface-2 p-1">
            {CALENDAR_VIEWS.map((v) => (
              <Link
                key={v}
                href={calendarHref(v, date)}
                aria-current={v === view ? "page" : undefined}
                className={cn(
                  "flex min-h-9 min-w-[4.25rem] items-center justify-center rounded-full px-3 text-[14px] font-medium transition-colors",
                  v === view ? "bg-surface text-foreground shadow-card" : "text-muted hover:text-foreground",
                )}
              >
                {VIEW_LABEL[v]}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div id="calendar-status" className="empty:-mb-4">
        {isDemo ? (
          <Banner tone="info">Calendar sync is available in your own {brand.name} account. The shared demo never connects to a real calendar.</Banner>
        ) : state === "not_connected" ? (
          <Banner tone="info" action={canConnect ? <a href="/api/integrations/google/start" className={buttonClass("primary", "sm")}>Connect Google Calendar</a> : null}>
            {canConnect ? "Connect Google Calendar to see your events here and let your assistant plan around them." : "Calendar sync isn't configured on this server yet."}
          </Banner>
        ) : state === "reauth_required" ? (
          <Banner tone="warning" action={canConnect ? <a href="/api/integrations/google/start" className={buttonClass("primary", "sm")}>Reconnect</a> : null}>
            Google access was revoked or expired, so these events may be out of date. Reconnect to keep syncing.
          </Banner>
        ) : state === "read_only" ? (
          <Banner tone="warning" action={canConnect ? <a href="/api/integrations/google/start" className={buttonClass("primary", "sm")}>Reconnect to enable editing</a> : null}>
            Your calendar is connected read-only. Reconnect and allow editing to add, move and delete events from {brand.name}.
          </Banner>
        ) : null}
      </div>

      <div aria-live="polite" className="empty:-mb-4">{msg ? <FormMessage tone={msg.ok ? "success" : "error"}>{msg.text}</FormMessage> : null}</div>

      {view === "month" ? (
        <MonthGrid key={date.slice(0, 7)} days={days} month={date.slice(0, 7)} today={today} onOpen={(event) => setPanel({ kind: "details", event })} />
      ) : view === "week" ? (
        <>
          <div className="md:hidden">
            <AgendaList days={days} today={today} onOpen={(event) => setPanel({ kind: "details", event })} emptyText="Nothing scheduled this week." />
          </div>
          <div className="hidden md:block">
            <TimeGrid days={days} today={today} timezone={timezone} showHeader onOpen={(event) => setPanel({ kind: "details", event })} onCreateAt={writable ? (d, t) => newEvent({ date: d, time: t }) : null} />
          </div>
        </>
      ) : (
        <TimeGrid days={days} today={today} timezone={timezone} showHeader={false} onOpen={(event) => setPanel({ kind: "details", event })} onCreateAt={writable ? (d, t) => newEvent({ date: d, time: t }) : null} />
      )}

      <Sheet open={panel !== null} onClose={() => setPanel(null)} title={panel?.kind === "create" ? "New event" : panel?.kind === "edit" ? "Edit event" : "Event"}>
        {panel?.kind === "details" ? (
          <EventDetailsView
            key={panel.event.id ?? panel.event.title}
            event={panel.event}
            timezone={timezone}
            writable={writable}
            canConnect={canConnect}
            onEdit={(details) => setPanel({ kind: "edit", event: panel.event, initial: editValues(panel.event, details, timezone, date) })}
            onDeleted={saved}
          />
        ) : panel?.kind === "create" ? (
          <EventForm mode="create" initial={panel.initial} onSaved={saved} onCancel={() => setPanel(null)} />
        ) : panel?.kind === "edit" ? (
          <EventForm
            mode="edit"
            eventId={panel.event.id}
            initial={panel.initial}
            recurring={panel.event.recurring}
            onSaved={saved}
            onCancel={() => setPanel({ kind: "details", event: panel.event })}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function Banner({ tone, action, children }: { tone: "info" | "warning"; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-3 rounded-[22px] px-4 py-3.5 text-[14px] leading-snug sm:flex-row sm:items-center sm:justify-between",
        tone === "warning" ? "bg-warning-soft text-warning" : "bg-accent-soft text-foreground",
      )}
    >
      <p>{children}</p>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
