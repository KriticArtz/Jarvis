"use client";

import { useEffect, useState, type CSSProperties } from "react";
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
 * Today as a time strip (the "command" composition): the waking day from
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
      <div aria-hidden className="relative mt-2 h-4 text-[11px] text-subtle">
        {hours.map((h) => (
          <span key={h} className="type-num absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0" style={{ left: `${x(h)}%` }}>
            {formatTime12(minutesToTime(h)).replace(":00", "")}
          </span>
        ))}
      </div>
    </figure>
  );
}

/**
 * Today as a sun path (the "canvas" composition): the waking day drawn as an
 * arc over a quiet landscape, the sun at the real time, and each scheduled
 * thing as a point on the arc. Hills and sky take the theme's own colours.
 * Position it from outside (it fills whatever box it's given).
 */
export function DayArc({ marks, window: win, timezone, initialNow, className }: Props) {
  const now = useNow(timezone, initialNow);
  const span = win.end - win.start;
  const t = (m: number) => clamp((m - win.start) / span);
  // The arc: an ellipse through (0, base) and (1, base) rising to `top`.
  const BASE = 0.86;
  const TOP = 0.16;
  const at = (u: number) => ({ x: u * 100, y: (BASE - (BASE - TOP) * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2))) * 100 });
  const sun = at(t(now));
  const travelled = (end: number) => {
    const pts: string[] = [];
    for (let u = 0; u < end; u += 0.01) pts.push(`${at(u).x.toFixed(2)},${at(u).y.toFixed(2)}`);
    pts.push(`${sun.x.toFixed(2)},${sun.y.toFixed(2)}`);
    return `M${pts.join(" L")}`;
  };
  const up = now >= win.start && now <= win.end;

  return (
    <figure className={cn("day-arc isolate overflow-hidden", className)} style={{ "--sun-x": `${sun.x}%`, "--sun-y": `${sun.y}%` } as CSSProperties}>
      <figcaption className="sr-only">{summary(marks, win, now)}</figcaption>
      <div aria-hidden className="absolute inset-0">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
          <path d={`M0,${BASE * 100} A50,${(BASE - TOP) * 100} 0 0 1 100,${BASE * 100}`} fill="none" className="stroke-line" strokeWidth="1.2" strokeDasharray="1.2 2.4" vectorEffect="non-scaling-stroke" />
          {/* the part of the day already travelled, as a solid line along the same arc */}
          {up ? <path d={travelled(t(now))} fill="none" className="stroke-now" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" /> : null}
        </svg>
        {/* Three layers of hills; drawn last-to-front so the arc ends sink behind them. */}
        <svg viewBox="0 0 1200 200" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-[38%] w-full">
          <path className="day-arc-hill-3" d="M0,92 C140,60 260,70 380,88 C520,108 640,52 800,58 C960,64 1060,96 1200,80 L1200,200 L0,200 Z" />
          <path className="day-arc-hill-2" d="M0,128 C160,104 300,118 450,132 C600,146 720,104 880,108 C1020,112 1110,132 1200,124 L1200,200 L0,200 Z" />
          <path className="day-arc-hill-1" d="M0,166 C200,146 380,160 560,170 C760,182 900,150 1200,158 L1200,200 L0,200 Z" />
        </svg>
        {marks.map((m) => {
          const p = at(t(timeToMinutes(m.start)));
          return (
            <span
              key={m.key}
              title={`${formatTime12(m.start)} · ${m.title}`}
              className={cn(
                "absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
                m.done ? "bg-accent" : m.kind === "event" ? "bg-surface-raised shadow-[0_0_0_1.5px_var(--muted)]" : "bg-surface-raised shadow-[0_0_0_2px_var(--accent)]",
              )}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            />
          );
        })}
        {up ? (
          <span className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${sun.x}%`, top: `${sun.y}%` }}>
            <span className="day-arc-sun block size-5 rounded-full" />
          </span>
        ) : null}
        <span className="type-num absolute bottom-2 left-3 text-[11px] text-muted">{formatTime12(minutesToTime(win.start))}</span>
        <span className="type-num absolute bottom-2 right-3 text-[11px] text-muted">{formatTime12(minutesToTime(win.end))}</span>
      </div>
    </figure>
  );
}
