"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Repeat, Users } from "lucide-react";
import type { CalendarDay, LocalCalendarEvent } from "@/lib/integrations/calendar/local";
import { calendarHref, eventColor, layoutTimedEvents } from "@/lib/integrations/calendar/view";
import { formatTime12, localDate, localMinutesNow, minutesToTime } from "@/lib/time";
import { cn } from "@/lib/cn";

const HOUR_PX = 52;
const weekdayShort = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const dayNum = (iso: string) => Number(iso.slice(8, 10));
const hourLabel = (h: number) => (h === 0 ? "" : formatTime12(`${String(h).padStart(2, "0")}:00`).replace(":00", ""));

export type OpenEvent = (event: LocalCalendarEvent, date: string) => void;
export type CreateAt = (date: string, time: string | null) => void;

/** Colored surface for an event; the color comes from Google's palette (or the theme accent). */
function evStyle(e: LocalCalendarEvent): React.CSSProperties {
  return { ["--ev" as string]: eventColor(e.colorId) ?? "var(--accent)" };
}
const evClass =
  "border-l-[3px] border-[var(--ev)] bg-[color-mix(in_oklab,var(--ev)_16%,var(--surface))] text-foreground hover:bg-[color-mix(in_oklab,var(--ev)_24%,var(--surface))]";

function timeRange(e: LocalCalendarEvent): string {
  if (e.allDay || !e.start) return "All day";
  return `${formatTime12(e.start)} – ${formatTime12(e.end)}`;
}

function eventLabel(e: LocalCalendarEvent): string {
  return [e.title, timeRange(e), e.location, e.recurring ? "repeats" : null, e.tentative ? "tentative" : null].filter(Boolean).join(", ");
}

/** Minutes since local midnight in the user's zone, updated every minute (client only, to avoid hydration drift). */
function useNow(timezone: string): { date: string; minutes: number } | null {
  const [now, setNow] = useState<{ date: string; minutes: number } | null>(null);
  useEffect(() => {
    const tick = () => setNow({ date: localDate(timezone), minutes: localMinutesNow(timezone) });
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [timezone]);
  return now;
}

function AllDayRow({ days, onOpen }: { days: CalendarDay[]; onOpen: OpenEvent }) {
  if (!days.some((d) => d.events.some((e) => e.allDay))) return null;
  return (
    <div className="grid border-b border-hairline" style={{ gridTemplateColumns: `3.25rem repeat(${days.length}, minmax(0, 1fr))` }}>
      <div className="py-1.5 pr-2 text-right text-[11px] text-muted">all-day</div>
      {days.map((d) => (
        <div key={d.date} className="flex min-w-0 flex-col gap-0.5 border-l border-hairline p-0.5">
          {d.events
            .filter((e) => e.allDay)
            .map((e, i) => (
              <button
                key={`${e.id ?? e.title}-${i}`}
                type="button"
                onClick={() => onOpen(e, d.date)}
                style={evStyle(e)}
                aria-label={eventLabel(e)}
                className={cn(evClass, "min-h-7 truncate rounded-md px-1.5 text-left text-[12px] font-medium", e.tentative && "opacity-70")}
              >
                {e.title}
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}

/** Day / week time grid with overlapping events side by side and a current-time line. */
export function TimeGrid({
  days,
  today,
  timezone,
  onOpen,
  onCreateAt,
  showHeader,
}: {
  days: CalendarDay[];
  today: string;
  timezone: string;
  onOpen: OpenEvent;
  onCreateAt: CreateAt | null;
  showHeader: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const now = useNow(timezone);

  // Start scrolled to ~7 AM, or just above "now" when today is visible.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const showsToday = days.some((d) => d.date === today);
    const minutes = showsToday ? Math.max(0, localMinutesNow(timezone) - 90) : 7 * 60;
    el.scrollTop = (minutes / 60) * HOUR_PX;
  }, [days, today, timezone]);

  const cols = `3.25rem repeat(${days.length}, minmax(0, 1fr))`;
  return (
    <div className="overflow-hidden rounded-[24px] bg-surface shadow-card">
      {showHeader ? (
        <div className="grid border-b border-hairline" style={{ gridTemplateColumns: cols }}>
          <div />
          {days.map((d) => (
            <Link
              key={d.date}
              href={calendarHref("day", d.date)}
              className="flex min-h-12 flex-col items-center justify-center border-l border-hairline py-1 text-center hover:bg-surface-2/60"
              aria-label={`Open ${d.date === today ? "today" : d.date} in day view`}
            >
              <span className={cn("text-[11px] font-medium uppercase tracking-wide", d.date === today ? "text-accent" : "text-muted")}>{weekdayShort(d.date)}</span>
              <span
                className={cn(
                  "mt-0.5 flex size-7 items-center justify-center rounded-full text-[15px] font-semibold",
                  d.date === today && "bg-accent text-accent-foreground",
                )}
              >
                {dayNum(d.date)}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
      <AllDayRow days={days} onOpen={onOpen} />
      <div ref={scroller} className="relative max-h-[min(68dvh,720px)] overflow-y-auto overscroll-contain">
        <div className="relative grid" style={{ gridTemplateColumns: cols, height: HOUR_PX * 24 }}>
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted" style={{ top: h * HOUR_PX }}>
                {hourLabel(h)}
              </span>
            ))}
          </div>
          {days.map((d) => (
            <div
              key={d.date}
              className={cn("relative border-l border-hairline", onCreateAt && "cursor-cell")}
              onClick={(e) => {
                if (!onCreateAt || e.target !== e.currentTarget) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const minutes = Math.floor(((e.clientY - rect.top) / HOUR_PX) * 2) * 30;
                onCreateAt(d.date, minutesToTime(Math.min(minutes, 23 * 60 + 30)));
              }}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-hairline" style={{ top: h * HOUR_PX }} aria-hidden />
              ))}
              {layoutTimedEvents(d.events).map((p, i) => {
                const short = p.height < 40;
                return (
                  <button
                    key={`${p.event.id ?? p.event.title}-${i}`}
                    type="button"
                    onClick={() => onOpen(p.event, d.date)}
                    style={{
                      ...evStyle(p.event),
                      top: (p.top / 60) * HOUR_PX + 1,
                      height: (p.height / 60) * HOUR_PX - 2,
                      left: `calc(${(p.column / p.columns) * 100}% + 2px)`,
                      width: `calc(${100 / p.columns}% - 4px)`,
                    }}
                    aria-label={eventLabel(p.event)}
                    className={cn(
                      evClass,
                      "absolute overflow-hidden rounded-lg px-1.5 text-left text-[12px] leading-tight shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-colors",
                      short ? "flex items-center gap-1 py-0" : "py-1",
                      p.event.tentative && "opacity-70",
                    )}
                  >
                    <span className="block truncate font-semibold">
                      {p.event.title}
                      {p.event.recurring ? <Repeat className="ml-1 inline size-3 opacity-60" aria-hidden /> : null}
                    </span>
                    {short ? null : <span className="block truncate text-muted">{timeRange(p.event)}</span>}
                    {!short && p.event.location && p.height >= 70 ? <span className="block truncate text-muted">{p.event.location}</span> : null}
                  </button>
                );
              })}
              {now && now.date === d.date ? (
                <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: (now.minutes / 60) * HOUR_PX }} aria-hidden>
                  <div className="relative border-t-2 border-danger">
                    <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-danger" />
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Upcoming-first list of days (the mobile week view and the month view's selected day). */
export function AgendaList({ days, today, onOpen, emptyText }: { days: CalendarDay[]; today: string; onOpen: OpenEvent; emptyText?: string }) {
  const any = days.some((d) => d.events.length);
  if (!any) return <p className="rounded-[24px] bg-surface px-5 py-6 text-[15px] text-muted shadow-card">{emptyText ?? "Nothing scheduled."}</p>;
  return (
    <ol className="flex flex-col gap-3">
      {days.map((d) => (
        <li key={d.date} className={cn("rounded-[24px] bg-surface p-3 shadow-card", !d.events.length && "py-2.5")}>
          <Link href={calendarHref("day", d.date)} className="flex min-h-9 items-center gap-2 px-1.5">
            <span className={cn("text-[13px] font-semibold uppercase tracking-wide", d.date === today ? "text-accent" : "text-muted")}>
              {d.date === today ? "Today" : weekdayShort(d.date)}
            </span>
            <span className="text-[13px] text-muted">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d.date}T00:00:00Z`))}</span>
            {!d.events.length ? <span className="ml-auto text-[13px] text-muted/80">Free</span> : null}
          </Link>
          {d.events.length ? (
            <ul className="mt-1 flex flex-col gap-1.5">
              {d.events.map((e, i) => (
                <li key={`${e.id ?? e.title}-${i}`}>
                  <button
                    type="button"
                    onClick={() => onOpen(e, d.date)}
                    style={evStyle(e)}
                    aria-label={eventLabel(e)}
                    className={cn(evClass, "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left", e.tentative && "opacity-70")}
                  >
                    <span className="w-[4.75rem] shrink-0 text-[13px] leading-tight text-muted tabular-nums">
                      {e.allDay ? "All day" : (
                        <>
                          {formatTime12(e.start)}
                          <br />
                          {formatTime12(e.end)}
                        </>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{e.title}</span>
                      {e.location ? <span className="block truncate text-[13px] text-muted">{e.location}</span> : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-muted">
                      {e.recurring ? <Repeat className="size-3.5" aria-hidden /> : null}
                      {e.attendeeCount ? <Users className="size-3.5" aria-hidden /> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** Month grid. Desktop shows event titles; phones show dots and the selected day's agenda below. */
export function MonthGrid({ days, month, today, onOpen }: { days: CalendarDay[]; month: string; today: string; onOpen: OpenEvent }) {
  const [selected, setSelected] = useState(() => (today.slice(0, 7) === month ? today : `${month}-01`));
  const selectedDay = days.find((d) => d.date === selected);
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-[24px] bg-surface shadow-card">
        <div className="grid grid-cols-7 border-b border-hairline">
          {days.slice(0, 7).map((d) => (
            <div key={d.date} className="py-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted">
              {weekdayShort(d.date)}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const inMonth = d.date.slice(0, 7) === month;
            const isToday = d.date === today;
            const shown = d.events.slice(0, 3);
            return (
              <div key={d.date} className={cn("min-h-[64px] border-hairline p-0.5 md:min-h-[108px] md:p-1", i % 7 !== 0 && "border-l", i >= 7 && "border-t", !inMonth && "bg-surface-2/40")}>
                {/* Phones: the whole cell selects the day. */}
                <button
                  type="button"
                  onClick={() => setSelected(d.date)}
                  aria-pressed={selected === d.date}
                  aria-label={`${d.date}${d.events.length ? `, ${d.events.length} event${d.events.length === 1 ? "" : "s"}` : ""}`}
                  className={cn("flex h-full min-h-11 w-full flex-col items-center gap-1 rounded-xl pt-1 md:hidden", selected === d.date && "bg-accent-soft")}
                >
                  <span className={cn("flex size-7 items-center justify-center rounded-full text-[14px]", isToday && "bg-accent font-semibold text-accent-foreground", !inMonth && !isToday && "text-muted")}>
                    {dayNum(d.date)}
                  </span>
                  <span className="flex gap-0.5" aria-hidden>
                    {shown.map((e, j) => (
                      <span key={j} className="size-1.5 rounded-full" style={{ background: eventColor(e.colorId) ?? "var(--accent)" }} />
                    ))}
                  </span>
                </button>
                {/* Larger screens: titles, and the date opens the day. */}
                <div className="hidden h-full flex-col gap-0.5 md:flex">
                  <Link
                    href={calendarHref("day", d.date)}
                    className={cn(
                      "ml-auto flex size-7 items-center justify-center rounded-full text-[13px] hover:bg-surface-2",
                      isToday && "bg-accent font-semibold text-accent-foreground hover:bg-accent",
                      !inMonth && !isToday && "text-muted",
                    )}
                    aria-label={`Open ${d.date} in day view`}
                  >
                    {dayNum(d.date)}
                  </Link>
                  {shown.map((e, j) => (
                    <button
                      key={`${e.id ?? e.title}-${j}`}
                      type="button"
                      onClick={() => onOpen(e, d.date)}
                      style={evStyle(e)}
                      aria-label={eventLabel(e)}
                      className={cn(evClass, "truncate rounded-md px-1.5 py-0.5 text-left text-[12px]", !inMonth && "opacity-70")}
                    >
                      {e.allDay ? null : <span className="text-muted">{formatTime12(e.start).replace(":00", "").replace(" ", "").toLowerCase()} </span>}
                      {e.title}
                    </button>
                  ))}
                  {d.events.length > shown.length ? (
                    <Link href={calendarHref("day", d.date)} className="px-1.5 text-[12px] font-medium text-muted hover:text-foreground">
                      +{d.events.length - shown.length} more
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="md:hidden">
        {selectedDay ? <AgendaList days={[selectedDay]} today={today} onOpen={onOpen} emptyText="Nothing scheduled that day." /> : null}
      </div>
    </div>
  );
}
