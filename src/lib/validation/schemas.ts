import { z } from "zod";
import { isValidTimeZone } from "@/lib/time";

const emptyToNull = (v: unknown) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v);

export const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use HH:MM");
export const optionalTime = z.preprocess(emptyToNull, timeString.transform((t) => t.slice(0, 5)).nullable());
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const optionalDate = z.preprocess(emptyToNull, isoDate.nullable());
export const uuid = z.uuid();

/** Normalize a phone number to E.164. Bare 10-digit numbers are treated as US/Canada. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Enter a phone number")
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Enter a valid phone number, e.g. +1 555 123 4567" });
      return z.NEVER;
    }
    return n;
  });

export const timezoneSchema = z.string().trim().min(1).max(64).refine(isValidTimeZone, "Unknown timezone");

export const accountabilityStyle = z.enum(["gentle", "balanced", "direct"]);

export const nameSchema = z.object({
  display_name: z.string().trim().min(1, "Please enter a name").max(80),
  timezone: timezoneSchema.optional(),
});

export const weekdays = z.array(z.coerce.number().int().min(1).max(7)).max(7);

export const scheduleSchema = z
  .object({
    wake_time: optionalTime,
    sleep_time: optionalTime,
    work_start: optionalTime,
    work_end: optionalTime,
    work_days: weekdays.default([1, 2, 3, 4, 5]),
    work_label: z.preprocess(emptyToNull, z.string().trim().max(40).nullable()).transform((v) => v ?? "Work"),
  })
  .refine((v) => !v.work_start || !v.work_end || v.work_end > v.work_start, {
    message: "End time must be after start time",
    path: ["work_end"],
  });

export const commitmentSchema = z
  .object({
    title: z.string().trim().min(1, "Give it a name").max(120),
    days_of_week: weekdays.min(1, "Pick at least one day"),
    start_time: timeString.transform((t) => t.slice(0, 5)),
    end_time: timeString.transform((t) => t.slice(0, 5)),
  })
  .refine((v) => v.end_time > v.start_time, { message: "End time must be after start time", path: ["end_time"] });

export const goalSchema = z
  .object({
    title: z.string().trim().min(1, "Give your goal a title").max(120),
    description: z.preprocess(emptyToNull, z.string().trim().max(1000).nullable()),
    category: z.string().trim().min(1).max(40).transform((v) => v.toLowerCase()),
    goal_type: z.enum(["recurring", "one_time"]),
    target_value: z.preprocess(emptyToNull, z.coerce.number().positive("Target must be positive").max(1_000_000).nullable()),
    target_unit: z.preprocess(emptyToNull, z.string().trim().max(24).nullable()),
    period: z.preprocess(emptyToNull, z.enum(["day", "week", "month"]).nullable()),
    due_date: optionalDate,
    priority: z.enum(["high", "medium", "low"]).default("medium"),
  })
  .refine((v) => v.goal_type === "one_time" || v.period !== null, {
    message: "Choose how often (per day, week or month)",
    path: ["period"],
  })
  .transform((v) => ({
    ...v,
    period: v.goal_type === "recurring" ? v.period : null,
    due_date: v.goal_type === "one_time" ? v.due_date : null,
    target_unit: v.target_value != null ? (v.target_unit ?? "times") : v.target_unit,
  }));

export type GoalInput = z.infer<typeof goalSchema>;

export const goalStatusSchema = z.enum(["active", "paused", "completed", "archived"]);

export const progressSchema = z.object({
  goal_id: uuid,
  amount: z.coerce.number().positive("Amount must be positive").max(100_000),
  note: z.preprocess(emptyToNull, z.string().trim().max(500).nullable()),
  logged_for: optionalDate,
});

export const taskSchema = z.object({
  title: z.string().trim().min(1, "Task needs a title").max(200),
  goal_id: z.preprocess(emptyToNull, uuid.nullable()),
  scheduled_start: optionalTime,
  duration_minutes: z.preprocess(emptyToNull, z.coerce.number().int().min(5).max(720).nullable()),
  is_priority: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

export const checkInSchema = z.object({
  kind: z.enum(["morning", "evening"]),
  rating: z.preprocess(emptyToNull, z.coerce.number().int().min(1).max(5).nullable()),
  content: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()),
});

export const memorySchema = z.object({
  content: z.string().trim().min(1, "Write something to remember").max(500),
});

export const notificationPrefsSchema = z.object({
  morning_checkin_enabled: z.boolean(),
  morning_checkin_time: timeString.transform((t) => t.slice(0, 5)),
  evening_checkin_enabled: z.boolean(),
  evening_checkin_time: timeString.transform((t) => t.slice(0, 5)),
  task_reminders_enabled: z.boolean(),
  quiet_hours_start: optionalTime,
  quiet_hours_end: optionalTime,
});

export const chatRequestSchema = z.object({
  conversationId: uuid.nullable().optional(),
  message: z.string().trim().min(1, "Message is empty").max(4000, "Message is too long"),
});

export const planRequestSchema = z.object({
  availableStart: optionalTime.optional(),
  availableEnd: optionalTime.optional(),
  note: z.preprocess(emptyToNull, z.string().trim().max(1000).nullable()).optional(),
});

export const planItemSchema = z.object({
  task_id: uuid.nullable(),
  title: z.string().trim().min(1).max(200),
  goal_id: uuid.nullable(),
  start_time: z.preprocess(emptyToNull, timeString.transform((t) => t.slice(0, 5)).nullable()),
  duration_minutes: z.coerce.number().int().min(5).max(720),
  is_priority: z.boolean(),
  rationale: z.string().max(500).nullable(),
});

export const planAcceptSchema = z.object({
  planId: uuid,
  items: z.array(planItemSchema).min(1, "Keep at least one item").max(12),
});

/** First error message per field, for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
