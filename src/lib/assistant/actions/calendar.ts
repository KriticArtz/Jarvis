import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCommitments, getProfile, getTasksBetween } from "@/lib/data/queries";
import { busyBlocks, dayBounds } from "@/lib/planning/availability";
import { addDays, localMinutesNow } from "@/lib/time";
import { loadCalendar } from "@/lib/integrations/calendar/context";
import { busyEventsForDay } from "@/lib/integrations/calendar/local";
import { findFreeSlots, type DayAvailability } from "@/lib/integrations/calendar/free-time";
import {
  calendarWriteState,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEventDetails,
  loadOwnEvent,
  updateCalendarEvent,
  WRITE_ERROR_MESSAGE,
  type CalendarWriteError,
  type StoredEvent,
} from "@/lib/integrations/calendar/mutations";
import { allDayTimes, describeTimes, durationMinutes, localDateTime, rescheduleTimes, timedTimes } from "@/lib/integrations/calendar/times";
import { CALENDAR_SYNC_DAYS } from "@/lib/integrations/calendar/types";
import { resolveDate } from "./dates";
import { J, zDateInput, zId, zTime } from "./schema";
import { fail, info, ok, type ToolContext, type ToolDefinition, type ToolResult } from "./types";

/**
 * Calendar tools. Reads run immediately; EVERY write (create, update,
 * reschedule, delete) is a "confirm" tool: the model only creates a proposal
 * in assistant_actions and nothing touches Google until the user approves it
 * via confirm_action (same mechanism as every other consequential action).
 * Event ids are our own calendar_events ids, always looked up with the
 * session's user id — another user's id is simply "not found".
 */

const NOT_CONNECTED = "No calendar is connected. The user can connect Google Calendar in Settings.";

function writeFailure(reason: CalendarWriteError): ToolResult {
  const code = reason === "not_found" ? "not_found" : reason === "error" ? "server_error" : "not_allowed";
  return fail(code, WRITE_ERROR_MESSAGE[reason]);
}

/** Refuse to propose a change the connection can't make (read-only / disconnected). */
async function writeBlocker(ctx: ToolContext): Promise<ToolResult | null> {
  const state = await calendarWriteState(ctx.db, ctx.userId);
  if (state === "writable") return null;
  return writeFailure(state === "not_connected" ? "not_connected" : state === "read_only" ? "needs_write_access" : "reauth_required");
}

function adminOrFail(): ReturnType<typeof createAdminClient> {
  return createAdminClient();
}

const guestsNote = (ev: Pick<StoredEvent, "attendee_count">) => (ev.attendee_count > 0 ? `\nGuests (${ev.attendee_count}) will be notified.` : "");
const recurringNote = (ev: Pick<StoredEvent, "recurring_event_id">) => (ev.recurring_event_id ? "\nOnly this occurrence of the repeating event." : "");

async function ownEditable(ctx: ToolContext, id: string): Promise<StoredEvent | ToolResult> {
  const ev = await loadOwnEvent(ctx.db, ctx.userId, id);
  if (!ev) return fail("not_found", "I couldn't find that calendar event.");
  if (!ev.is_organizer) return writeFailure("not_editable");
  return ev;
}
const isResult = (v: unknown): v is ToolResult => typeof v === "object" && v !== null && "status" in v && "message" in v;

// --- find_calendar_events ---------------------------------------------------------

const findInput = z.object({
  query: z.string().trim().max(100).nullable(),
  from_date: zDateInput.nullable(),
  days: z.number().int().min(1).max(CALENDAR_SYNC_DAYS),
});

export const findCalendarEvents: ToolDefinition<typeof findInput> = {
  name: "find_calendar_events",
  description:
    "Search the user's calendar by words in the title or location (e.g. 'dentist') over a date range. Returns event ids for get_calendar_event, reschedule_calendar_event, update_calendar_event or delete_calendar_event.",
  parameters: J.object({
    query: J.nullable(J.string("Words to match in the event title or location. Null = all events.")),
    from_date: J.nullable(J.string("Start date: today, tomorrow or YYYY-MM-DD. Null = today.")),
    days: J.integer(`Number of days to search, 1–${CALENDAR_SYNC_DAYS}.`),
  }),
  input: findInput,
  risk: "read",
  runningLabel: () => "Searching your calendar…",
  async execute(ctx, args) {
    const from = resolveDate(args.from_date ?? "today", ctx.today);
    if (!from.ok) return fail("invalid_input", `That start date is ${from.reason}.`);
    const calendar = await loadCalendar(ctx.db, ctx.userId, { tz: ctx.timezone, from: from.date, days: args.days });
    if (!calendar) return info(NOT_CONNECTED, { connected: false });
    const q = args.query?.toLowerCase();
    const seen = new Set<string>();
    const events = calendar.days.flatMap((d) =>
      d.events
        .filter((e) => !q || e.title.toLowerCase().includes(q) || (e.location ?? "").toLowerCase().includes(q))
        .filter((e) => !e.id || (!seen.has(`${e.id}:${d.date}`) && seen.add(`${e.id}:${d.date}`)))
        .map((e) => ({ event_id: e.id, date: d.date, start: e.start, end: e.end, all_day: e.allDay, title: e.title, location: e.location, repeats: e.recurring, can_edit: e.editable })),
    );
    return info(events.length ? `Found ${events.length} event${events.length === 1 ? "" : "s"}.` : "No matching events.", { connected: true, writable: calendar.writable, events: events.slice(0, 50) });
  },
};

// --- get_calendar_event --------------------------------------------------------------

const getInput = z.object({ event_id: zId });

export const getCalendarEvent: ToolDefinition<typeof getInput> = {
  name: "get_calendar_event",
  description: "Full details of one calendar event: time, location, description, guests and whether it repeats.",
  parameters: J.object({ event_id: J.string("Event id from the context or a calendar search.") }),
  input: getInput,
  risk: "read",
  runningLabel: () => "Opening the event…",
  async execute(ctx, args) {
    const admin = adminOrFail();
    if (!admin) return writeFailure("not_configured");
    const res = await getCalendarEventDetails(admin, ctx.userId, args.event_id);
    if (!res.ok) return writeFailure(res.reason);
    const e = res.event;
    return info(`“${e.title}”`, {
      title: e.title,
      when: describeTimes(e, ctx.timezone),
      location: e.location,
      description: res.details.description?.slice(0, 1500) ?? null,
      guests: res.details.attendees.map((a) => a.name),
      organizer: res.details.organizer,
      repeats: res.details.recurring,
      can_edit: e.is_organizer,
    });
  },
};

// --- find_free_time ------------------------------------------------------------------

const freeInput = z.object({
  from_date: zDateInput.nullable(),
  days: z.number().int().min(1).max(14),
  duration_minutes: z.number().int().min(15).max(480),
  time_of_day: z.enum(["morning", "afternoon", "evening", "any"]),
});

export const findFreeTime: ToolDefinition<typeof freeInput> = {
  name: "find_free_time",
  description:
    "Find open time slots of a given length within the user's waking hours. Calendar events, work/school hours, recurring commitments and timed tasks are treated as busy. Use before proposing to schedule something.",
  parameters: J.object({
    from_date: J.nullable(J.string("First day: today, tomorrow or YYYY-MM-DD. Null = today.")),
    days: J.integer("How many days to look at, 1–14 (e.g. 2 for a weekend)."),
    duration_minutes: J.integer("Length of the block in minutes."),
    time_of_day: J.enumOf(["morning", "afternoon", "evening", "any"], "Preferred part of the day."),
  }),
  input: freeInput,
  risk: "read",
  runningLabel: (a) => `Finding ${a.duration_minutes} free minutes…`,
  async execute(ctx, args) {
    const from = resolveDate(args.from_date ?? "today", ctx.today);
    if (!from.ok) return fail("invalid_input", `That start date is ${from.reason}.`);
    if (from.date < ctx.today) return fail("invalid_input", "I can only look for free time from today on.");
    const profile = await getProfile(ctx.db, ctx.userId);
    if (!profile) return fail("not_found", "I couldn't load your schedule.");
    const to = addDays(from.date, args.days - 1);
    const [commitments, tasks, calendar] = await Promise.all([
      getCommitments(ctx.db, ctx.userId),
      getTasksBetween(ctx.db, ctx.userId, from.date, to),
      loadCalendar(ctx.db, ctx.userId, { tz: ctx.timezone, from: from.date, days: args.days }),
    ]);
    if (!profile.wake_time || !profile.sleep_time) {
      return info("I don't know the user's waking hours, so ask when they're usually free.", { slots: [] });
    }
    const days: DayAvailability[] = Array.from({ length: args.days }, (_, i) => {
      const date = addDays(from.date, i);
      const bounds = dayBounds(profile, null, date === ctx.today ? localMinutesNow(ctx.timezone) : null);
      return {
        date,
        bounds: bounds && bounds.end > bounds.start ? { start: bounds.start, end: bounds.end } : null,
        busy: busyBlocks(
          date,
          profile,
          commitments,
          tasks.filter((t) => t.task_date === date && t.status === "pending"),
          busyEventsForDay(calendar?.days.find((d) => d.date === date)),
        ),
      };
    });
    const slots = findFreeSlots(days, { durationMinutes: args.duration_minutes, timeOfDay: args.time_of_day });
    return info(slots.length ? `Found ${slots.length} open slot${slots.length === 1 ? "" : "s"}.` : "No open slot of that length in that range.", {
      calendar_connected: Boolean(calendar),
      slots,
    });
  },
};

// --- create_calendar_event (confirm) -------------------------------------------------

const createInput = z.object({
  title: z.string().trim().min(1).max(200),
  date: zDateInput,
  start_time: zTime.nullable(),
  duration_minutes: z.number().int().min(5).max(1440).nullable(),
  all_day_days: z.number().int().min(1).max(14).nullable(),
  location: z.string().trim().max(300).nullable(),
  description: z.string().trim().max(2000).nullable(),
});

const eventTimesSchema = z.discriminatedUnion("allDay", [
  z.object({ allDay: z.literal(false), startsAt: z.iso.datetime(), endsAt: z.iso.datetime(), timeZone: z.string().min(1).max(64) }),
  z.object({ allDay: z.literal(true), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), timeZone: z.string().min(1).max(64) }),
]);

const createStored = z.object({
  title: z.string().min(1).max(200),
  times: eventTimesSchema,
  location: z.string().max(300).nullable(),
  description: z.string().max(2000).nullable(),
  request_id: z.uuid(),
});

export const createCalendarEventTool: ToolDefinition<typeof createInput> = {
  name: "create_calendar_event",
  description:
    "Propose adding an event to the user's Google Calendar (e.g. a workout or study block). Creates a proposal the user must approve; nothing is added until then. Give start_time for a timed event, or null with all_day_days for an all-day event.",
  parameters: J.object({
    title: J.string("Event title"),
    date: J.string("today, tomorrow or YYYY-MM-DD"),
    start_time: J.nullable(J.string("Local start time, 24h HH:MM. Null = all-day event.")),
    duration_minutes: J.nullable(J.integer("Length in minutes for a timed event (default 60).")),
    all_day_days: J.nullable(J.integer("For all-day events: number of days (default 1).")),
    location: J.nullable(J.string("Optional location")),
    description: J.nullable(J.string("Optional notes")),
  }),
  input: createInput,
  risk: "confirm",
  storedInput: createStored,
  runningLabel: (a) => `Setting up “${a.title}”…`,
  async propose(ctx, args) {
    const blocked = await writeBlocker(ctx);
    if (blocked) return blocked;
    const date = resolveDate(args.date, ctx.today);
    if (!date.ok) return fail("invalid_input", `That date is ${date.reason}.`);
    const times = args.start_time
      ? timedTimes(date.date, args.start_time, args.duration_minutes ?? 60, ctx.timezone)
      : allDayTimes(date.date, args.all_day_days ?? 1, ctx.timezone);
    if (!times.allDay && Date.parse(times.startsAt) < Date.now() - 5 * 60_000) return fail("invalid_input", "That time has already passed.");
    const overlaps = times.allDay ? [] : await overlapping(ctx, times.startsAt, times.endsAt);
    const summary = `Add “${args.title}” to your calendar\n${describeTimes(times, ctx.timezone)}${args.location ? ` · ${args.location}` : ""}${
      overlaps.length ? `\nOverlaps: ${overlaps.map((t) => `“${t}”`).join(", ")}` : ""
    }`;
    return {
      summary,
      storedArgs: { title: args.title, times, location: args.location, description: args.description, request_id: randomUUID() },
      data: { overlaps },
    };
  },
  async execute(ctx, raw) {
    const args = raw as unknown as z.infer<typeof createStored>;
    const admin = adminOrFail();
    if (!admin) return writeFailure("not_configured");
    const res = await createCalendarEvent(
      admin,
      ctx.userId,
      { title: args.title, times: args.times, location: args.location, description: args.description },
      { idempotencyKey: `assistant:${args.request_id}` },
    );
    if (!res.ok) return writeFailure(res.reason);
    return ok(`Added “${res.event.title}” — ${describeTimes(res.event, ctx.timezone)}.`, { event_id: res.event.id });
  },
};

async function overlapping(ctx: ToolContext, startsAt: string, endsAt: string, exceptId?: string): Promise<string[]> {
  const { data } = await ctx.db
    .from("calendar_events")
    .select("id, title")
    .eq("user_id", ctx.userId)
    .neq("status", "cancelled")
    .eq("is_busy", true)
    .eq("all_day", false)
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt)
    .limit(5);
  return (data ?? []).filter((r) => r.id !== exceptId).map((r) => String(r.title));
}

// --- reschedule_calendar_event (confirm) ---------------------------------------------

const rescheduleInput = z.object({ event_id: zId, date: zDateInput, start_time: zTime.nullable() });
const rescheduleStored = z.object({ event_id: zId, times: eventTimesSchema });

export const rescheduleCalendarEvent: ToolDefinition<typeof rescheduleInput> = {
  name: "reschedule_calendar_event",
  description:
    "Propose moving an existing calendar event to another day and/or time, keeping its length. start_time null keeps the same time of day. The user must approve before anything changes.",
  parameters: J.object({
    event_id: J.string("Event id from the context or a calendar search."),
    date: J.string("New date: today, tomorrow or YYYY-MM-DD"),
    start_time: J.nullable(J.string("New local start time, 24h HH:MM. Null = keep the current time of day.")),
  }),
  input: rescheduleInput,
  risk: "confirm",
  storedInput: rescheduleStored,
  runningLabel: () => "Preparing the move…",
  async propose(ctx, args) {
    const blocked = await writeBlocker(ctx);
    if (blocked) return blocked;
    const ev = await ownEditable(ctx, args.event_id);
    if (isResult(ev)) return ev;
    const date = resolveDate(args.date, ctx.today);
    if (!date.ok) return fail("invalid_input", `That date is ${date.reason}.`);
    const times = rescheduleTimes(ev, { date: date.date, time: args.start_time }, ctx.timezone);
    if (!times.allDay && times.startsAt === new Date(ev.starts_at).toISOString()) return fail("invalid_input", "That's already when it is.");
    const overlaps = times.allDay ? [] : await overlapping(ctx, times.startsAt, times.endsAt, ev.id);
    const summary = `Move “${ev.title}”\nCurrent: ${describeTimes(ev, ctx.timezone)}\nNew: ${describeTimes(times, ctx.timezone)}${
      overlaps.length ? `\nOverlaps: ${overlaps.map((t) => `“${t}”`).join(", ")}` : ""
    }${recurringNote(ev)}${guestsNote(ev)}`;
    return { summary, storedArgs: { event_id: ev.id, times } };
  },
  async execute(ctx, raw) {
    const args = raw as unknown as z.infer<typeof rescheduleStored>;
    const admin = adminOrFail();
    if (!admin) return writeFailure("not_configured");
    const res = await updateCalendarEvent(admin, ctx.userId, args.event_id, { times: args.times });
    if (!res.ok) return writeFailure(res.reason);
    return ok(`Moved “${res.event.title}” to ${describeTimes(res.event, ctx.timezone)}.`, { event_id: res.event.id });
  },
};

// --- update_calendar_event (confirm) -------------------------------------------------

const updateInput = z.object({
  event_id: zId,
  title: z.string().trim().min(1).max(200).nullable(),
  location: z.string().trim().max(300).nullable(),
  description: z.string().trim().max(2000).nullable(),
  duration_minutes: z.number().int().min(5).max(1440).nullable(),
});
const updateStored = z.object({
  event_id: zId,
  title: z.string().min(1).max(200).optional(),
  location: z.string().max(300).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  times: eventTimesSchema.optional(),
});

export const updateCalendarEventTool: ToolDefinition<typeof updateInput> = {
  name: "update_calendar_event",
  description:
    "Propose changing an existing calendar event's title, location, notes or length (use reschedule_calendar_event to move it). Null = leave unchanged; an empty string clears location/notes. The user must approve first.",
  parameters: J.object({
    event_id: J.string("Event id from the context or a calendar search."),
    title: J.nullable(J.string("New title, or null")),
    location: J.nullable(J.string("New location, empty string to clear, or null")),
    description: J.nullable(J.string("New notes, empty string to clear, or null")),
    duration_minutes: J.nullable(J.integer("New length in minutes (timed events), or null")),
  }),
  input: updateInput,
  risk: "confirm",
  storedInput: updateStored,
  runningLabel: () => "Preparing the change…",
  async propose(ctx, args) {
    const blocked = await writeBlocker(ctx);
    if (blocked) return blocked;
    const ev = await ownEditable(ctx, args.event_id);
    if (isResult(ev)) return ev;
    const stored: z.infer<typeof updateStored> = { event_id: ev.id };
    const lines: string[] = [];
    if (args.title && args.title !== ev.title) {
      stored.title = args.title;
      lines.push(`Title: “${ev.title}” → “${args.title}”`);
    }
    if (args.location !== null && args.location !== (ev.location ?? "")) {
      stored.location = args.location || null;
      lines.push(args.location ? `Location: ${args.location}` : "Remove the location");
    }
    if (args.description !== null) {
      stored.description = args.description || null;
      lines.push(args.description ? "Update the notes" : "Remove the notes");
    }
    if (args.duration_minutes && !ev.all_day && args.duration_minutes !== durationMinutes(ev)) {
      const local = localDateTime(ev.starts_at, ctx.timezone);
      stored.times = timedTimes(local.date, local.time, args.duration_minutes, ctx.timezone);
      lines.push(`Time: ${describeTimes(ev, ctx.timezone)} → ${describeTimes(stored.times, ctx.timezone)}`);
    }
    if (!lines.length) return fail("invalid_input", "There's nothing to change.");
    return { summary: `Update “${ev.title}”\n${lines.join("\n")}${recurringNote(ev)}${guestsNote(ev)}`, storedArgs: stored };
  },
  async execute(ctx, raw) {
    const args = raw as unknown as z.infer<typeof updateStored>;
    const admin = adminOrFail();
    if (!admin) return writeFailure("not_configured");
    const { event_id, ...patch } = args;
    const res = await updateCalendarEvent(admin, ctx.userId, event_id, patch);
    if (!res.ok) return writeFailure(res.reason);
    return ok(`Updated “${res.event.title}”.`, { event_id: res.event.id });
  },
};

// --- delete_calendar_event (confirm) -------------------------------------------------

const deleteInput = z.object({ event_id: zId });

export const deleteCalendarEventTool: ToolDefinition<typeof deleteInput> = {
  name: "delete_calendar_event",
  description: "Propose deleting (cancelling) an event from the user's Google Calendar. The user must approve first.",
  parameters: J.object({ event_id: J.string("Event id from the context or a calendar search.") }),
  input: deleteInput,
  risk: "confirm",
  runningLabel: () => "Preparing to cancel…",
  async propose(ctx, args) {
    const blocked = await writeBlocker(ctx);
    if (blocked) return blocked;
    const ev = await ownEditable(ctx, args.event_id);
    if (isResult(ev)) return ev;
    return {
      summary: `Delete “${ev.title}” from your calendar\n${describeTimes(ev, ctx.timezone)}${recurringNote(ev)}${guestsNote(ev)}`,
      storedArgs: { event_id: ev.id },
    };
  },
  async execute(ctx, args) {
    const admin = adminOrFail();
    if (!admin) return writeFailure("not_configured");
    const res = await deleteCalendarEvent(admin, ctx.userId, args.event_id);
    if (!res.ok) return writeFailure(res.reason);
    return ok(`Deleted “${res.event.title}” from your calendar.`);
  },
};

export const CALENDAR_TOOLS = [
  findCalendarEvents,
  getCalendarEvent,
  findFreeTime,
  createCalendarEventTool,
  rescheduleCalendarEvent,
  updateCalendarEventTool,
  deleteCalendarEventTool,
] as ToolDefinition[];
