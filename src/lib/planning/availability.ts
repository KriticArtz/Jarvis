import type { Profile, RecurringCommitment, Task } from "@/lib/types/domain";
import { isoWeekday, minutesToTime, timeToMinutes } from "@/lib/time";

export interface Block {
  start: number; // minutes since midnight
  end: number;
  label: string;
}

const DAY_END = 24 * 60 - 1;

function normalizeEnd(startMin: number, endMin: number): number {
  // A sleep/end time "earlier" than the start (e.g. 00:30) means after midnight.
  return endMin <= startMin ? DAY_END : endMin;
}

/** Fixed blocks on `date`: work/school, recurring commitments, timed tasks. */
export function busyBlocks(
  date: string,
  profile: Pick<Profile, "work_start" | "work_end" | "work_days" | "work_label">,
  commitments: Pick<RecurringCommitment, "title" | "days_of_week" | "start_time" | "end_time">[],
  tasks: Pick<Task, "title" | "scheduled_start" | "duration_minutes" | "status">[],
): Block[] {
  const weekday = isoWeekday(date);
  const blocks: Block[] = [];

  if (profile.work_start && profile.work_end && profile.work_days.includes(weekday)) {
    const s = timeToMinutes(profile.work_start);
    blocks.push({ start: s, end: normalizeEnd(s, timeToMinutes(profile.work_end)), label: profile.work_label || "Work" });
  }

  for (const c of commitments) {
    if (!c.days_of_week.includes(weekday)) continue;
    const s = timeToMinutes(c.start_time);
    blocks.push({ start: s, end: normalizeEnd(s, timeToMinutes(c.end_time)), label: c.title });
  }

  for (const t of tasks) {
    if (!t.scheduled_start || t.status === "skipped") continue;
    const s = timeToMinutes(t.scheduled_start);
    blocks.push({ start: s, end: Math.min(DAY_END, s + (t.duration_minutes ?? 30)), label: t.title });
  }

  return blocks.sort((a, b) => a.start - b.start);
}

/**
 * Free windows between `dayStart` and `dayEnd` not covered by busy blocks.
 * Returns an empty list if the bounds are unknown; callers must then ask the
 * user for availability rather than invent a schedule.
 */
export function freeWindows(dayStart: number, dayEnd: number, busy: Block[], minLength = 15): Block[] {
  const windows: Block[] = [];
  let cursor = dayStart;
  for (const b of [...busy].sort((a, c) => a.start - c.start)) {
    if (b.end <= cursor) continue;
    if (b.start > cursor) windows.push({ start: cursor, end: Math.min(b.start, dayEnd), label: "free" });
    cursor = Math.max(cursor, b.end);
    if (cursor >= dayEnd) break;
  }
  if (cursor < dayEnd) windows.push({ start: cursor, end: dayEnd, label: "free" });
  return windows.filter((w) => w.end - w.start >= minLength);
}

export interface DayBounds {
  start: number;
  end: number;
  source: "profile" | "user_input";
}

/**
 * Bounds of the plannable day. Explicit availability from the user wins;
 * otherwise wake/sleep times from the profile. Returns null when unknown.
 * `nowMinutes` (for planning today) trims the start so nothing is scheduled in the past.
 */
export function dayBounds(
  profile: Pick<Profile, "wake_time" | "sleep_time">,
  override: { start?: string | null; end?: string | null } | null,
  nowMinutes: number | null,
): DayBounds | null {
  let start: number | null = null;
  let end: number | null = null;
  let source: DayBounds["source"] = "profile";

  if (override?.start || override?.end) {
    source = "user_input";
    start = override.start ? timeToMinutes(override.start) : profile.wake_time ? timeToMinutes(profile.wake_time) : null;
    end = override.end ? timeToMinutes(override.end) : profile.sleep_time ? timeToMinutes(profile.sleep_time) : null;
  } else if (profile.wake_time && profile.sleep_time) {
    start = timeToMinutes(profile.wake_time);
    end = timeToMinutes(profile.sleep_time);
  }
  if (start == null || end == null) return null;
  end = normalizeEnd(start, end);
  if (nowMinutes != null) {
    // Round up to the next 15 minutes.
    start = Math.max(start, Math.ceil(nowMinutes / 15) * 15);
  }
  if (end - start < 15) return { start, end: start, source };
  return { start, end, source };
}

export function describeBlocks(blocks: Block[]): string {
  if (blocks.length === 0) return "none";
  return blocks.map((b) => `${minutesToTime(b.start)}–${minutesToTime(b.end)} ${b.label}`).join("; ");
}

export function totalMinutes(blocks: Block[]): number {
  return blocks.reduce((sum, b) => sum + (b.end - b.start), 0);
}
