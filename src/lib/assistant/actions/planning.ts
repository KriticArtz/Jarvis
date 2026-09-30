import "server-only";
import { z } from "zod";
import { planDay } from "@/lib/ai/planner";
import { applyPlan } from "@/lib/planning/apply";
import { formatDuration, formatTime12 } from "@/lib/time";
import type { PlanItem } from "@/lib/types/domain";
import { J, zId, zNullableText, zTime } from "./schema";
import { fail, info, ok, type ToolDefinition } from "./types";

const replanInput = z
  .object({
    available_start: zTime.nullable(),
    available_end: zTime.nullable(),
    note: zNullableText(500),
  })
  .refine((v) => !v.available_start || !v.available_end || v.available_end > v.available_start, {
    message: "The end of the free time must be after the start.",
  });

const storedInput = z.object({ plan_id: zId });

function describeItems(items: PlanItem[]): string {
  if (!items.length) return "nothing new to schedule";
  return items
    .map((i) => `${i.start_time ? `${formatTime12(i.start_time)} ` : ""}${i.title}${i.duration_minutes ? ` (${formatDuration(i.duration_minutes)})` : ""}`)
    .join("; ");
}

/**
 * Rebuild today's plan, optionally around a new constraint ("I have to work
 * late tonight" → free from 21:00). Always a proposal first: the plan is built
 * with the existing planner (existing tasks become movable), shown to the user,
 * and only applied after they confirm.
 */
export const replanToday: ToolDefinition<typeof replanInput> = {
  name: "replan_today",
  description:
    "Rebuild or rearrange the rest of today's schedule, e.g. when the user says they have to work late, lost an hour, or asks to redo their day. Pass the hours they're actually free if they said so. Existing tasks get re-timed. Always requires confirmation: this proposes a new schedule for the user to approve.",
  parameters: J.object({
    available_start: J.nullable(J.string("24h HH:MM when the user is free from today, or null if unchanged")),
    available_end: J.nullable(J.string("24h HH:MM when the user's free time ends, or null for their usual bedtime")),
    note: J.nullable(J.string("The user's constraint in their words, e.g. \"working late until 9pm\", or null")),
  }),
  input: replanInput,
  storedInput,
  risk: "confirm",
  runningLabel: () => "Reworking your day…",
  async propose(ctx, args) {
    const result = await planDay(ctx.db, ctx.userId, {
      availableStart: args.available_start,
      availableEnd: args.available_end,
      note: args.note,
      reflow: true,
    });
    if (result.status === "needs_info") return info(result.question, { needs_more_info: true });
    const items = result.plan.proposal.items;
    const warnings = result.plan.proposal.warnings;
    return {
      summary: `New plan for today: ${describeItems(items)}`.slice(0, 480),
      storedArgs: { plan_id: result.plan.id },
      data: { items: items.map(({ title, start_time, duration_minutes }) => ({ title, start_time, duration_minutes })), warnings },
    };
  },
  // On confirmation `args` are the stored { plan_id }, validated by storedInput.
  async execute(ctx, args) {
    const { plan_id } = storedInput.parse(args);
    const result = await applyPlan(ctx.db, ctx.userId, { planId: plan_id, items: null, today: ctx.today, unscheduleOthers: true });
    if (!result.ok) {
      if (result.reason === "wrong_day") return fail("expired", "That plan was for a different day — let's make a new one.");
      if (result.reason === "server_error") return fail("server_error", "I couldn't apply the new plan.");
      return fail("expired", "That plan is no longer available — let's make a new one.");
    }
    const moved = result.unscheduled.length ? ` Unscheduled for now: ${result.unscheduled.join(", ")}.` : "";
    return ok(`Updated today's plan (${result.updated} moved, ${result.created} added).${moved}`, { ...result });
  },
};
