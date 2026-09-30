import { freeWindows, type Block } from "@/lib/planning/availability";
import { minutesToTime } from "@/lib/time";

/**
 * Suggest open slots of a given length (pure). Busy time = work/school hours,
 * recurring commitments, timed tasks AND calendar events (hard constraints).
 * Only the user's waking hours are considered, and suggestions are spread out
 * (at most `perDay` per day) rather than filling every free minute.
 */

export type TimeOfDay = "morning" | "afternoon" | "evening" | "any";

const WINDOWS: Record<Exclude<TimeOfDay, "any">, [number, number]> = {
  morning: [5 * 60, 12 * 60],
  afternoon: [12 * 60, 17 * 60],
  evening: [17 * 60, 23 * 60 + 59],
};

export interface DayAvailability {
  date: string;
  /** Plannable bounds in minutes (waking hours; for today, from now). Null = unknown. */
  bounds: { start: number; end: number } | null;
  busy: Block[];
}

export interface FreeSlot {
  date: string;
  start: string;
  end: string;
  /** Total free minutes in the window this slot sits in. */
  windowMinutes: number;
}

const roundUp = (m: number, step = 15) => Math.ceil(m / step) * step;

export function findFreeSlots(days: DayAvailability[], opts: { durationMinutes: number; timeOfDay?: TimeOfDay; perDay?: number; max?: number }): FreeSlot[] {
  const perDay = opts.perDay ?? 2;
  const max = opts.max ?? 6;
  const out: FreeSlot[] = [];
  for (const day of days) {
    if (!day.bounds) continue;
    let start = day.bounds.start;
    let end = day.bounds.end;
    if (opts.timeOfDay && opts.timeOfDay !== "any") {
      start = Math.max(start, WINDOWS[opts.timeOfDay][0]);
      end = Math.min(end, WINDOWS[opts.timeOfDay][1]);
    }
    if (end - start < opts.durationMinutes) continue;
    let count = 0;
    for (const w of freeWindows(start, end, day.busy, opts.durationMinutes)) {
      const s = roundUp(w.start);
      if (w.end - s < opts.durationMinutes) continue;
      out.push({ date: day.date, start: minutesToTime(s), end: minutesToTime(s + opts.durationMinutes), windowMinutes: w.end - w.start });
      if (++count >= perDay || out.length >= max) break;
    }
    if (out.length >= max) break;
  }
  return out;
}
