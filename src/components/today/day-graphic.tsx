"use client";

import { useEffect, useState } from "react";
import { formatTime12, localMinutesNow, minutesToTime, timeToMinutes } from "@/lib/time";
import { cn } from "@/lib/cn";

/** One timed thing on today's graphic — a calendar event or a scheduled task. */
export interface DayMark {
  key: string;
  kind: "event" | "task";
  title: string;
  start: string;
  end: string | null;
  done: boolean;
  priority: boolean;
}

interface Props {
  marks: DayMark[];
  /** The waking day, in minutes since midnight (see dayWindow). */
  window: { start: number; end: number };
  timezone: string;
  /** Server-rendered "now", so the first client render matches. */
  initialNow: number;
  className?: string;
}

/** Minutes since local midnight, refreshed every minute. */
function useNow(timezone: string, initial: number) {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    const id = window.setInterval(() => setNow(localMinutesNow(timezone)), 60_000);
    return () => window.clearInterval(id);
  }, [timezone]);
  return now;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** What the graphic shows, for screen readers (the drawing itself is hidden from them). */
function summary(marks: DayMark[], win: Props["window"], now: number) {
  const left = marks.filter((m) => !m.done && timeToMinutes(m.start) >= now).length;
  return `Your waking day runs ${formatTime12(minutesToTime(win.start))} to ${formatTime12(minutesToTime(win.end))}. It's ${formatTime12(minutesToTime(now))}; ${
    marks.length ? `${left} of ${marks.length} timed ${marks.length === 1 ? "thing is" : "things are"} still ahead.` : "nothing is scheduled at a set time."
  }`;
}

/**
 * Today as a time strip: the waking day from
 * wake to sleep, each scheduled thing as a block at its real time and length,
 * finished ones filled, and a live "now" line. Read-only; the timeline below
 * is where things are done.
 */
export function DayStrip({ marks, window: win, timezone, initialNow, className }: Props) {
  const now = useNow(timezone, initialNow);
  const span = win.end - win.start;
  const x = (m: number) => clamp((m - win.start) / span) * 100;
  const hours: number[] = [];
  for (let h = Math.ceil(win.start / 180) * 180; h <= win.end; h += 180) hours.push(h);
  const nowX = x(now);
  const inDay = now >= win.start && now <= win.end;

  return (
    <figure className={cn("relative", className)}>
      <figcaption className="sr-only">{summary(marks, win, now)}</figcaption>
      <div aria-hidden className="relative h-14 overflow-hidden rounded-tile bg-surface-2/70 shadow-[inset_0_0_0_1px_var(--hairline)]">
        {/* the part of the day already behind you */}
        <div className="absolute inset-y-0 left-0 bg-foreground/[0.045]" style={{ width: `${inDay ? nowX : now > win.end ? 100 : 0}%` }} />
        {hours.map((h) => (
          <span key={h} className="absolute inset-y-0 w-px bg-hairline" style={{ left: `${x(h)}%` }} />
        ))}
        {marks.map((m) => {
          const s = timeToMinutes(m.start);
          const e = m.end ? timeToMinutes(m.end) : s + 30;
          return (
            <span
              key={m.key}
              title={`${formatTime12(m.start)} · ${m.title}`}
              className={cn(
                "absolute top-2 bottom-2 min-w-[6px] rounded-[7px]",
                m.kind === "event"
                  ? "bg-surface-raised shadow-[inset_0_0_0_1px_var(--line)]"
                  : m.done
                    ? "bg-accent/75"
                    : "bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--accent)]",
              )}
              style={{ left: `${x(s)}%`, width: `${Math.max(0.6, x(e) - x(s))}%` }}
            >
              {m.priority && !m.done ? <span className="absolute -top-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-now" /> : null}
            </span>
          );
        })}
        {inDay ? (
          <span className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-now" style={{ left: `${nowX}%` }}>
            <span className="now-pulse absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-now" />
          </span>
        ) : null}
      </div>
      <div aria-hidden className="relative mt-2 h-4 text-[11px] text-muted">
        {hours.map((h) => (
          <span key={h} className="type-num absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0" style={{ left: `${x(h)}%` }}>
            {formatTime12(minutesToTime(h)).replace(":00", "")}
          </span>
        ))}
      </div>
    </figure>
  );
}
