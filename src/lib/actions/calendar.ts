"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEventDetails,
  updateCalendarEvent,
  WRITE_ERROR_MESSAGE,
  type EventDetails,
} from "@/lib/integrations/calendar/mutations";
import { allDayTimes, timedTimes } from "@/lib/integrations/calendar/times";
import { isCalendarDate } from "@/lib/integrations/calendar/view";
import { timeToMinutes } from "@/lib/time";
import { uuid } from "@/lib/validation/schemas";
import { errorInfo, logError } from "@/lib/observability/log";
import { NOT_SIGNED_IN, type ActionResult } from "./result";

/**
 * Calendar changes made directly on the Calendar page. Pressing Save / Delete
 * in the event sheet IS the user's explicit confirmation (deleting has its
 * own "Yes, delete" step). The user always comes from the session — never
 * from the form — and every change is checked against that user's own event
 * and connection server-side before Google is called.
 */

const DEMO: ActionResult = { ok: false, error: "Calendar editing is available in your own account, not the shared demo." };

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time");
const date = z.string().refine(isCalendarDate, "Pick a date");

const eventForm = z
  .object({
    title: z.string().trim().min(1, "Give it a title").max(200),
    allDay: z.boolean(),
    date,
    /** All-day: last day (inclusive). */
    endDate: date.nullable(),
    startTime: time.nullable(),
    endTime: time.nullable(),
    location: z.string().trim().max(300).nullable(),
    /** Omitted on edit when the current description wasn't loaded: left unchanged. */
    description: z.string().trim().max(4000).nullable().optional(),
    colorId: z.string().regex(/^([1-9]|1[01])$/).nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.allDay) {
      if (v.endDate && v.endDate < v.date) ctx.addIssue({ code: "custom", path: ["endDate"], message: "The end can't be before the start" });
      if (v.endDate && Date.parse(v.endDate) - Date.parse(v.date) > 30 * 86_400_000) ctx.addIssue({ code: "custom", path: ["endDate"], message: "All-day events can span up to 31 days" });
    } else {
      if (!v.startTime) ctx.addIssue({ code: "custom", path: ["startTime"], message: "Pick a start time" });
      if (!v.endTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "Pick an end time" });
      if (v.startTime && v.endTime && v.endTime === v.startTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "End must be after the start" });
    }
  });

export type CalendarEventForm = z.input<typeof eventForm>;

function timesFor(v: z.output<typeof eventForm>, tz: string) {
  if (v.allDay) {
    const days = v.endDate ? Math.round((Date.parse(v.endDate) - Date.parse(v.date)) / 86_400_000) + 1 : 1;
    return allDayTimes(v.date, days, tz);
  }
  // An end time before the start means the event ends the next day (e.g. 11 PM – 1 AM).
  const minutes = (timeToMinutes(v.endTime!) - timeToMinutes(v.startTime!) + 1440) % 1440;
  return timedTimes(v.date, v.startTime!, minutes, tz);
}

function fieldErrors(error: z.ZodError): ActionResult {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return { ok: false, error: "Check the highlighted fields.", fieldErrors: out };
}

type Writer = { ok: true; userId: string; admin: NonNullable<ReturnType<typeof createAdminClient>>; tz: string } | { ok: false; result: ActionResult };

async function writer(): Promise<Writer> {
  const session = await getSessionUser();
  if (!session) return { ok: false, result: NOT_SIGNED_IN };
  if (session.isDemo) return { ok: false, result: DEMO };
  const admin = createAdminClient();
  if (!admin) return { ok: false, result: { ok: false, error: WRITE_ERROR_MESSAGE.not_configured } };
  const { data: profile } = await session.supabase.from("profiles").select("timezone").eq("id", session.userId).maybeSingle();
  return { ok: true, userId: session.userId, admin, tz: (profile?.timezone as string | undefined) || "UTC" };
}

function done(message: string): ActionResult {
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return { ok: true, message };
}

export async function createEventAction(input: CalendarEventForm & { requestId: string }): Promise<ActionResult> {
  const parsed = eventForm.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);
  if (!uuid.safeParse(input.requestId).success) return { ok: false, error: "Please try again." };
  const w = await writer();
  if (!w.ok) return w.result;
  try {
    const v = parsed.data;
    const res = await createCalendarEvent(
      w.admin,
      w.userId,
      { title: v.title, times: timesFor(v, w.tz), location: v.location || null, description: v.description || null, colorId: v.colorId },
      // The form's request id: a double-submit or retry can't create a duplicate.
      { idempotencyKey: `ui:${input.requestId}` },
    );
    if (!res.ok) return { ok: false, error: WRITE_ERROR_MESSAGE[res.reason] };
    return done(`Added “${res.event.title}”.`);
  } catch (err) {
    logError("integrations", "calendar create action failed", { userId: w.userId, ...errorInfo(err) });
    return { ok: false, error: WRITE_ERROR_MESSAGE.error };
  }
}

export async function updateEventAction(input: CalendarEventForm & { id: string }): Promise<ActionResult> {
  const parsed = eventForm.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);
  if (!uuid.safeParse(input.id).success) return { ok: false, error: WRITE_ERROR_MESSAGE.not_found };
  const w = await writer();
  if (!w.ok) return w.result;
  try {
    const v = parsed.data;
    const res = await updateCalendarEvent(w.admin, w.userId, input.id, {
      title: v.title,
      times: timesFor(v, w.tz),
      location: v.location || null,
      ...(v.description === undefined ? {} : { description: v.description || null }),
      colorId: v.colorId,
    });
    if (!res.ok) {
      if (res.reason === "not_found") revalidatePath("/calendar");
      return { ok: false, error: WRITE_ERROR_MESSAGE[res.reason] };
    }
    return done(`Saved “${res.event.title}”.`);
  } catch (err) {
    logError("integrations", "calendar update action failed", { userId: w.userId, ...errorInfo(err) });
    return { ok: false, error: WRITE_ERROR_MESSAGE.error };
  }
}

export async function deleteEventAction(input: { id: string }): Promise<ActionResult> {
  if (!uuid.safeParse(input?.id).success) return { ok: false, error: WRITE_ERROR_MESSAGE.not_found };
  const w = await writer();
  if (!w.ok) return w.result;
  try {
    const res = await deleteCalendarEvent(w.admin, w.userId, input.id);
    if (!res.ok) {
      if (res.reason === "not_found") revalidatePath("/calendar");
      return { ok: false, error: WRITE_ERROR_MESSAGE[res.reason] };
    }
    return done(`Deleted “${res.event.title}”.`);
  } catch (err) {
    logError("integrations", "calendar delete action failed", { userId: w.userId, ...errorInfo(err) });
    return { ok: false, error: WRITE_ERROR_MESSAGE.error };
  }
}

export type EventDetailsResult = { ok: true; details: EventDetails } | { ok: false; error: string };

/** Description and guests for an event the user opened (fetched from Google, not stored). */
export async function getEventDetailsAction(input: { id: string }): Promise<EventDetailsResult> {
  if (!uuid.safeParse(input?.id).success) return { ok: false, error: WRITE_ERROR_MESSAGE.not_found };
  const session = await getSessionUser();
  if (!session) return { ok: false, error: NOT_SIGNED_IN.error! };
  if (session.isDemo) return { ok: false, error: DEMO.error! };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: WRITE_ERROR_MESSAGE.not_configured };
  try {
    const res = await getCalendarEventDetails(admin, session.userId, input.id);
    if (!res.ok) return { ok: false, error: WRITE_ERROR_MESSAGE[res.reason] };
    return { ok: true, details: res.details };
  } catch (err) {
    logError("integrations", "calendar details action failed", { userId: session.userId, ...errorInfo(err) });
    return { ok: false, error: WRITE_ERROR_MESSAGE.error };
  }
}
