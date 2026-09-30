import type { GoalProgressSummary } from "@/lib/progress";
import type { Task } from "@/lib/types/domain";
import { timeToMinutes } from "@/lib/time";

/**
 * Pure selection rules for the Today screen: what to focus on, what's next,
 * and what needs attention now. Kept separate from the page so they can be
 * unit-tested.
 */

type TaskLike = Pick<Task, "id" | "title" | "status" | "scheduled_start" | "is_priority" | "sort_order">;

/** Minutes a timed task may be "running late" before it's treated as missed. */
const LATE_GRACE = 30;

/**
 * The next thing to do: the earliest pending timed task that hasn't passed
 * (allowing a short grace period), else the first pending priority, else the
 * first pending task.
 */
export function pickNextUp<T extends TaskLike>(tasks: T[], nowMinutes: number): T | null {
  const pending = tasks.filter((t) => t.status === "pending");
  const upcoming = pending
    .filter((t) => t.scheduled_start && timeToMinutes(t.scheduled_start) >= nowMinutes - LATE_GRACE)
    .sort((a, b) => timeToMinutes(a.scheduled_start as string) - timeToMinutes(b.scheduled_start as string));
  if (upcoming[0]) return upcoming[0];
  const untimed = pending.filter((t) => !t.scheduled_start).sort((a, b) => a.sort_order - b.sort_order);
  return untimed.find((t) => t.is_priority) ?? untimed[0] ?? null;
}

export type Focus =
  | { kind: "intention"; title: string }
  | { kind: "priority"; title: string; done: boolean }
  | { kind: "goal"; title: string; goalId: string; progress: string }
  | null;

/**
 * Today's focus: the user's own morning intention if they set one, else
 * their first priority task (other than `exclude`, the task already shown as
 * "next up"), else their top-ranked goal.
 */
export function pickFocus(input: {
  intention: string | null;
  tasks: TaskLike[];
  goals: { id: string; title: string; rank: number }[];
  summaries: Map<string, Pick<GoalProgressSummary, "label">>;
  exclude?: string | null;
}): Focus {
  const intention = input.intention?.trim();
  if (intention) return { kind: "intention", title: intention };
  const priority = input.tasks
    .filter((t) => t.is_priority && t.status === "pending" && t.id !== input.exclude)
    .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || a.sort_order - b.sort_order)[0];
  if (priority) return { kind: "priority", title: priority.title, done: false };
  const goal = [...input.goals].sort((a, b) => a.rank - b.rank)[0];
  if (goal) return { kind: "goal", title: goal.title, goalId: goal.id, progress: input.summaries.get(goal.id)?.label ?? "" };
  return null;
}

export interface AttentionItem {
  key: string;
  kind: "confirm" | "late" | "behind";
  title: string;
  detail: string;
  href: string;
}

/**
 * Things that need the user now, most urgent first: changes waiting for
 * their OK, timed tasks that slipped past, and goals falling behind pace.
 * Capped so the section stays short.
 */
export function attentionItems(input: {
  assistantName: string;
  pendingConfirmations: { id: string; summary: string | null; conversationId: string | null }[];
  tasks: TaskLike[];
  nowMinutes: number;
  goals: { id: string; title: string }[];
  summaries: Map<string, Pick<GoalProgressSummary, "pace" | "label">>;
  max?: number;
}): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const p of input.pendingConfirmations) {
    out.push({
      key: `confirm:${p.id}`,
      kind: "confirm",
      title: p.summary || "A change is waiting for your OK",
      detail: `${input.assistantName} is waiting for your OK`,
      href: p.conversationId ? `/assistant?c=${p.conversationId}` : "/assistant",
    });
  }
  for (const t of input.tasks) {
    if (t.status !== "pending" || !t.scheduled_start) continue;
    if (timeToMinutes(t.scheduled_start) < input.nowMinutes - LATE_GRACE) {
      out.push({ key: `late:${t.id}`, kind: "late", title: t.title, detail: "Planned earlier today — still doing it?", href: "#today-title" });
    }
  }
  for (const g of input.goals) {
    const s = input.summaries.get(g.id);
    if (s?.pace === "behind") out.push({ key: `behind:${g.id}`, kind: "behind", title: g.title, detail: `Behind pace · ${s.label}`, href: `/goals/${g.id}` });
  }
  return out.slice(0, input.max ?? 4);
}
