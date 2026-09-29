import { formatTime12 } from "@/lib/time";
import type { AssistantContext } from "./context-types";

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function days(list: number[]): string {
  if (list.length === 7) return "every day";
  if (list.join() === "1,2,3,4,5") return "weekdays";
  if (list.join() === "6,7") return "weekends";
  return list.map((d) => DAY_NAMES[d]).join(", ");
}

/**
 * Render structured context into a compact, clearly-labelled text block for
 * the model. Missing information is stated explicitly so the assistant asks
 * instead of guessing.
 */
export function renderContext(ctx: AssistantContext): string {
  const out: string[] = [];
  out.push(`## Now\n${ctx.now.weekday}, ${ctx.now.date}, ${formatTime12(ctx.now.time)} (${ctx.now.timezone})`);

  out.push(
    `## User\nName: ${ctx.user.name ?? "unknown"}\nAccountability style: ${ctx.user.accountabilityStyle}`,
  );

  const s = ctx.schedule;
  const sched: string[] = [];
  sched.push(`Wake: ${s.wake ? formatTime12(s.wake) : "unknown"}; Sleep: ${s.sleep ? formatTime12(s.sleep) : "unknown"}`);
  if (s.work) sched.push(`${s.work.label}: ${formatTime12(s.work.start)}–${formatTime12(s.work.end)} (${days(s.work.days)})`);
  else sched.push("Work/school hours: unknown");
  if (s.commitmentsToday.length) {
    sched.push(`Commitments today: ${s.commitmentsToday.map((c) => `${c.title} ${formatTime12(c.start)}–${formatTime12(c.end)}`).join("; ")}`);
  }
  if (s.otherCommitments.length) {
    sched.push(
      `Other recurring commitments: ${s.otherCommitments.map((c) => `${c.title} ${formatTime12(c.start)}–${formatTime12(c.end)} (${days(c.days)})`).join("; ")}`,
    );
  }
  if (s.freeWindowsToday) {
    sched.push(
      s.freeWindowsToday.length
        ? `Remaining free windows today: ${s.freeWindowsToday.map((w) => `${formatTime12(w.start)}–${formatTime12(w.end)}`).join(", ")} (${s.freeMinutesRemainingToday} min total, before accounting for meals/rest)`
        : "Remaining free windows today: none",
    );
  } else {
    sched.push("Free time today: unknown (wake/sleep times not set)");
  }
  out.push(`## Schedule\n${sched.join("\n")}`);

  if (ctx.goals.length) {
    out.push(
      `## Active goals (ranked, 1 = most important)\n${ctx.goals
        .map(
          (g) =>
            `${g.rank + 1}. ${g.title} [${g.category}, ${g.priority} priority, ${g.type === "recurring" ? "recurring" : "one-time"}] target: ${g.target || "none set"}; progress: ${g.progress}${g.pace !== "not_applicable" ? ` (${g.pace.replace("_", " ")})` : ""}${g.dueDate ? `; due ${g.dueDate}` : ""}${g.description ? `\n   Notes: ${g.description}` : ""}`,
        )
        .join("\n")}`,
    );
  } else {
    out.push("## Active goals\nNone yet.");
  }

  const t = ctx.today;
  out.push(
    `## Today's tasks${t.planAccepted ? " (from an accepted plan)" : ""}\n${
      t.tasks.length
        ? t.tasks
            .map(
              (task) =>
                `- [${task.status}] ${task.title}${task.start ? ` at ${formatTime12(task.start)}` : ""}${task.durationMinutes ? ` (${task.durationMinutes} min)` : ""}${task.isPriority ? " — priority" : ""}${task.goal ? ` → ${task.goal}` : ""}`,
            )
            .join("\n")
        : "No tasks planned yet."
    }`,
  );

  if (t.checkIns.length) {
    out.push(
      `## Today's check-ins\n${t.checkIns.map((c) => `- ${c.kind}${c.rating ? ` (rated ${c.rating}/5)` : ""}: ${c.content ?? ""}`).join("\n")}`,
    );
  }

  const r = ctx.recent.last7Days;
  out.push(`## Last 7 days\nTasks planned: ${r.planned}, completed: ${r.completed}, missed: ${r.missed}`);
  if (ctx.recent.lastWeeklyReview) out.push(`## Last weekly review\n${ctx.recent.lastWeeklyReview}`);

  if (ctx.memories.length) out.push(`## Things the user asked you to remember\n${ctx.memories.map((m) => `- ${m}`).join("\n")}`);
  if (ctx.otherConversationSummaries.length) {
    out.push(`## Recent earlier conversations (summaries)\n${ctx.otherConversationSummaries.map((m) => `- ${m}`).join("\n")}`);
  }

  return out.join("\n\n");
}
