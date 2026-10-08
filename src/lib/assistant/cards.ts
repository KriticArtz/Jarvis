import { z } from "zod";
import { addDays, formatDuration, formatTime12, formatShortDate, isoWeekday, timeToMinutes } from "@/lib/time";

/**
 * Structured results of assistant actions ("cards"), shared by the server and
 * the chat UI. A card is built ONLY by server-side tool code from the rows it
 * just read or changed — never from model output — and is validated against
 * this explicit, whitelisted schema before it is streamed, stored
 * (assistant_actions.result) or rendered. Anything that doesn't match is
 * dropped and the action falls back to its plain status line.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const text = (max: number) => z.string().trim().min(1).max(max);
const minutes = z.number().int().min(1).max(1440);

export const whenSchema = z
  .object({
    date: z.string().regex(DATE),
    /** Local start "HH:MM", or null for a task without a set time. */
    start: z.string().regex(TIME).nullable(),
    end: z.string().regex(TIME).nullable(),
    allDay: z.boolean(),
    /** Last day of a multi-day all-day event. */
    lastDate: z.string().regex(DATE).nullable(),
  })
  .strict();
export type When = z.infer<typeof whenSchema>;

const taskCard = z
  .object({
    v: z.literal(1),
    kind: z.literal("task"),
    action: z.enum(["created", "completed", "moved", "skipped", "deleted"]),
    title: text(200),
    when: whenSchema.nullable(),
    durationMinutes: minutes.nullable(),
    /** Where it was before a move. */
    previous: whenSchema.nullable(),
  })
  .strict();

const eventCard = z
  .object({
    v: z.literal(1),
    kind: z.literal("event"),
    action: z.enum(["created", "moved", "updated", "deleted"]),
    title: text(200),
    when: whenSchema.nullable(),
    previous: whenSchema.nullable(),
    location: text(300).nullable(),
    /** Short facts the user should know before approving (overlaps, guests, recurrence, field changes). */
    notes: z.array(text(240)).max(6),
  })
  .strict();

const goalCard = z
  .object({
    v: z.literal(1),
    kind: z.literal("goal"),
    action: z.enum(["created", "updated", "paused", "resumed", "completed", "progress", "deleted"]),
    title: text(120),
    /** Target or progress, e.g. "4 times per week" or "Logged 1 time · now 2 of 4 this week". */
    detail: text(240).nullable(),
  })
  .strict();

const planItem = z.object({ title: text(200), start: z.string().regex(TIME).nullable(), durationMinutes: minutes.nullable() }).strict();

const planCard = z
  .object({
    v: z.literal(1),
    kind: z.literal("plan"),
    action: z.enum(["proposed", "applied"]),
    date: z.string().regex(DATE),
    items: z.array(planItem).max(30),
    notes: z.array(text(300)).max(5),
  })
  .strict();

export const actionCardSchema = z.discriminatedUnion("kind", [taskCard, eventCard, goalCard, planCard]);
export type ActionCard = z.infer<typeof actionCardSchema>;
export type TaskCard = z.infer<typeof taskCard>;
export type EventCard = z.infer<typeof eventCard>;
export type GoalCard = z.infer<typeof goalCard>;
export type PlanCard = z.infer<typeof planCard>;

/** The only way a card gets in or out: anything unexpected becomes null. */
export function sanitizeCard(value: unknown): ActionCard | null {
  const parsed = actionCardSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// --- Wording (pure; used by the UI and tests) -----------------------------------

const WEEKDAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "Today", "Tomorrow", "Yesterday" or "Thu, Oct 9". */
export function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  if (date === addDays(today, -1)) return "Yesterday";
  return `${WEEKDAYS[isoWeekday(date)]}, ${formatShortDate(date)}`;
}

/** "5:30 PM", "2:00–3:30 PM" or "11:00 AM–12:30 PM". */
export function timeRange(start: string, end: string | null): string {
  if (!end || timeToMinutes(end) <= timeToMinutes(start)) return formatTime12(start);
  const a = formatTime12(start);
  const b = formatTime12(end);
  const sameHalf = a.slice(-2) === b.slice(-2);
  return `${sameHalf ? a.slice(0, -3) : a}–${b}`;
}

/** "Tomorrow · 5:30 PM", "Today · 2:00–3:30 PM", "Thu, Oct 9 · All day". */
export function whenLabel(when: When, today: string): string {
  const day = when.allDay && when.lastDate && when.lastDate > when.date ? `${dayLabel(when.date, today)} – ${dayLabel(when.lastDate, today)}` : dayLabel(when.date, today);
  if (when.allDay) return `${day} · All day`;
  return when.start ? `${day} · ${timeRange(when.start, when.end)}` : day;
}

/** "Moved from today · 6:00 PM" (a lowercase day word reads naturally mid-sentence). */
export function previousLabel(previous: When, today: string): string {
  const label = whenLabel(previous, today);
  return `Moved from ${/^(Today|Tomorrow|Yesterday)/.test(label) ? label[0].toLowerCase() + label.slice(1) : label}`;
}

export const durationLabel = (m: number | null) => (m ? formatDuration(m) : null);

/** Small heading for a finished action ("Moved", "Added to your calendar"…). */
export function resultHeading(card: ActionCard): string {
  switch (card.kind) {
    case "task":
      return { created: "Added", completed: "Done", moved: "Moved", skipped: "Skipped", deleted: "Deleted" }[card.action];
    case "event":
      return { created: "Added to your calendar", moved: "Moved on your calendar", updated: "Updated on your calendar", deleted: "Removed from your calendar" }[card.action];
    case "goal":
      return { created: "New goal", updated: "Goal updated", paused: "Goal paused", resumed: "Goal resumed", completed: "Goal complete", progress: "Progress logged", deleted: "Goal deleted" }[card.action];
    case "plan":
      return card.action === "applied" ? "Today's plan updated" : "Your day";
  }
}

/** The approve button for a proposal — says what will happen. */
export function confirmLabel(card: ActionCard | null): string {
  if (!card) return "Confirm";
  switch (card.kind) {
    case "task":
      return card.action === "deleted" ? "Delete it" : card.action === "skipped" ? "Skip it" : "Confirm";
    case "event":
      return { created: "Add to calendar", moved: "Move it", updated: "Update it", deleted: "Delete it" }[card.action];
    case "goal":
      return card.action === "deleted" ? "Delete goal" : "Update goal";
    case "plan":
      return "Use this plan";
  }
}

/** Removals get the quieter "danger" treatment on their approve button. */
export const isDestructive = (card: ActionCard | null) => Boolean(card && "action" in card && card.action === "deleted");

/** Short reference for a declined proposal ("Move “Client call”"). */
export function proposalTitle(card: ActionCard): string {
  if (card.kind === "plan") return "the new plan for today";
  return `“${card.title}”`;
}
