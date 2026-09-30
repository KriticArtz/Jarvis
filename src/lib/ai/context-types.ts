import type { AssistantPersona } from "@/lib/personalization";
import type { CalendarDay } from "@/lib/integrations/calendar/local";

/**
 * The structured context the assistant receives on every call. It is built
 * fresh from the database (goals, schedule, tasks, progress, memories) —
 * conversation history is handled separately and only a bounded window of it
 * is ever sent.
 */
export interface AssistantContext {
  now: { date: string; time: string; weekday: string; timezone: string };
  user: { name: string | null };
  /** The user's own name for their assistant and its personality (defaults applied). */
  assistant: AssistantPersona;
  schedule: {
    wake: string | null;
    sleep: string | null;
    work: { label: string; start: string; end: string; days: number[] } | null;
    commitmentsToday: { title: string; start: string; end: string }[];
    otherCommitments: { title: string; start: string; end: string; days: number[] }[];
    freeWindowsToday: { start: string; end: string }[] | null;
    freeMinutesRemainingToday: number | null;
  };
  goals: {
    id: string;
    title: string;
    category: string;
    type: "recurring" | "one_time";
    target: string;
    priority: string;
    rank: number;
    progress: string;
    pace: string;
    description: string | null;
    dueDate: string | null;
  }[];
  today: {
    tasks: { id?: string; title: string; start: string | null; durationMinutes: number | null; status: string; isPriority: boolean; goal: string | null }[];
    planAccepted: boolean;
    checkIns: { kind: string; rating: number | null; content: string | null }[];
  };
  recent: {
    last7Days: { planned: number; completed: number; missed: number };
    lastWeeklyReview: string | null;
  };
  memories: { id?: string; content: string }[];
  /**
   * Connected calendar: today and the next two days. Events are
   * fixed constraints. Null when no calendar is connected.
   */
  calendar?: { provider: string; lastSyncedAt: string | null; days: CalendarDay[]; writable?: boolean } | null;
  /**
   * Connected fitness sources only — no health data is placed in the
   * context. The assistant fetches aggregates on demand with a read-only
   * tool when a request actually needs them.
   */
  fitness?: { sources: string[] } | null;
  otherConversationSummaries: string[];
}
