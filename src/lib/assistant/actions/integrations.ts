import "server-only";
import { z } from "zod";
import { loadCalendar } from "@/lib/integrations/calendar/context";
import { CALENDAR_SYNC_DAYS } from "@/lib/integrations/calendar/types";
import { loadFitnessSummary } from "@/lib/integrations/fitness/store";
import { resolveDate } from "./dates";
import { J, zDateInput } from "./schema";
import { fail, info, type ToolDefinition } from "./types";

/**
 * Read-only integration tools. Calendar is read-only by design (no write
 * tools exist), and fitness data is only fetched when the model decides a
 * request needs it — it is never placed in the context up front.
 */

// --- list_calendar_events -------------------------------------------------------

const listCalendarInput = z.object({
  from_date: zDateInput.nullable(),
  days: z.number().int().min(1).max(14),
});

export const listCalendarEvents: ToolDefinition<typeof listCalendarInput> = {
  name: "list_calendar_events",
  description:
    "Read the user's connected calendar for a date range, e.g. to see how busy tomorrow or next week is. Returns event ids. Use the calendar write tools (with the user's OK) to change events.",
  parameters: J.object({
    from_date: J.nullable(J.string("Start date: today, tomorrow or YYYY-MM-DD. Null = today.")),
    days: J.integer("Number of days to include, 1–14."),
  }),
  input: listCalendarInput,
  risk: "read",
  runningLabel: () => "Checking your calendar…",
  async execute(ctx, args) {
    const from = resolveDate(args.from_date ?? "today", ctx.today);
    if (!from.ok) return fail("invalid_input", `That start date is ${from.reason}.`);
    const daysAhead = (Date.parse(`${from.date}T00:00:00Z`) - Date.parse(`${ctx.today}T00:00:00Z`)) / 86_400_000;
    if (daysAhead < 0 || daysAhead + args.days > CALENDAR_SYNC_DAYS) {
      return fail("invalid_input", `I can see today through the next ${CALENDAR_SYNC_DAYS} days of the calendar.`);
    }
    const calendar = await loadCalendar(ctx.db, ctx.userId, { tz: ctx.timezone, from: from.date, days: args.days });
    if (!calendar) return info("No calendar is connected. The user can connect Google Calendar in Settings.", { connected: false });
    const total = calendar.days.reduce((n, d) => n + d.events.length, 0);
    return info(total ? `Found ${total} calendar event${total === 1 ? "" : "s"}.` : "No calendar events in that range.", {
      connected: true,
      provider: calendar.provider,
      days: calendar.days,
    });
  },
};

// --- get_fitness_summary ----------------------------------------------------------

const fitnessInput = z.object({ days: z.number().int().min(1).max(30) });

export const getFitnessSummary: ToolDefinition<typeof fitnessInput> = {
  name: "get_fitness_summary",
  description:
    "Daily activity aggregates (steps, active energy, distance, sleep) and workouts from the user's connected fitness source for the last N days. Only call this when the request needs activity data. Never use it to diagnose or give medical advice.",
  parameters: J.object({ days: J.integer("How many recent days, 1–30.") }),
  input: fitnessInput,
  risk: "read",
  runningLabel: () => "Checking your activity…",
  async execute(ctx, args) {
    const summary = await loadFitnessSummary(ctx.db, ctx.userId, { tz: ctx.timezone, today: ctx.today, days: args.days });
    if (!summary) {
      return info("No fitness source is connected. Apple Health and Health Connect arrive with the mobile apps.", { connected: false });
    }
    return info(`Activity from ${summary.sources.join(", ")} for ${summary.from} to ${summary.to}.`, { connected: true, ...summary });
  },
};
