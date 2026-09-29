/**
 * Domain row types mirroring supabase/migrations. Kept hand-written so the
 * app compiles without a linked Supabase project; regenerate with
 * `supabase gen types typescript` once linked if you prefer generated types.
 */

export type AccountabilityStyle = "gentle" | "balanced" | "direct";
export type GoalType = "recurring" | "one_time";
export type GoalPeriod = "day" | "week" | "month";
export type GoalPriority = "high" | "medium" | "low";
export type GoalStatus = "active" | "paused" | "completed" | "archived";
export type TaskStatus = "pending" | "done" | "skipped";

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  phone: string | null;
  phone_verified_at: string | null;
  timezone: string;
  wake_time: string | null;
  sleep_time: string | null;
  work_start: string | null;
  work_end: string | null;
  work_days: number[];
  work_label: string;
  accountability_style: AccountabilityStyle;
  onboarding_step: number;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecurringCommitment {
  id: string;
  user_id: string;
  title: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
}

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: string;
  goal_type: GoalType;
  target_value: number | null;
  target_unit: string | null;
  period: GoalPeriod | null;
  due_date: string | null;
  priority: GoalPriority;
  rank: number;
  status: GoalStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoalProgressEntry {
  id: string;
  user_id: string;
  goal_id: string;
  task_id: string | null;
  amount: number;
  note: string | null;
  logged_for: string;
  source: "manual" | "task" | "check_in" | "sms" | "assistant";
  created_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  goal_id: string | null;
  daily_plan_id: string | null;
  title: string;
  notes: string | null;
  task_date: string;
  scheduled_start: string | null;
  duration_minutes: number | null;
  is_priority: boolean;
  sort_order: number;
  status: TaskStatus;
  completed_at: string | null;
  created_at: string;
}

export interface PlanItem {
  /** Set when the item schedules an existing task instead of creating one */
  task_id: string | null;
  title: string;
  goal_id: string | null;
  start_time: string | null; // "HH:MM"
  duration_minutes: number;
  is_priority: boolean;
  rationale: string | null;
}

export interface PlanProposal {
  items: PlanItem[];
  warnings: string[];
  question: string | null;
}

export interface DailyPlan {
  id: string;
  user_id: string;
  plan_date: string;
  status: "draft" | "accepted" | "discarded";
  user_input: string | null;
  summary: string | null;
  proposal: PlanProposal;
  source: "ai" | "rules";
  accepted_at: string | null;
  created_at: string;
}

export interface DailyCheckIn {
  id: string;
  user_id: string;
  check_in_date: string;
  kind: "morning" | "evening";
  rating: number | null;
  content: string | null;
  channel: "app" | "sms";
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string | null;
  channel: "app" | "sms";
  summary: string | null;
  summarized_through: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  channel: "app" | "sms";
  created_at: string;
}

export interface UserMemory {
  id: string;
  user_id: string;
  kind: "fact" | "preference" | "note";
  content: string;
  source: "user" | "assistant";
  created_at: string;
}

export interface NotificationPreferences {
  user_id: string;
  sms_enabled: boolean;
  sms_consent_at: string | null;
  sms_consent_text: string | null;
  sms_opted_out_at: string | null;
  morning_checkin_enabled: boolean;
  morning_checkin_time: string;
  evening_checkin_enabled: boolean;
  evening_checkin_time: string;
  task_reminders_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

export type NotificationKind =
  | "morning_checkin"
  | "task_reminder"
  | "evening_checkin"
  | "assistant_reply"
  | "test"
  | "system";

export interface NotificationRecord {
  id: string;
  user_id: string;
  channel: "sms";
  kind: NotificationKind;
  body: string;
  status: "queued" | "sent" | "failed" | "skipped" | "test";
  scheduled_for: string;
  sent_at: string | null;
  provider: string | null;
  error: string | null;
  created_at: string;
}

export interface WeeklyReviewRecord {
  id: string;
  user_id: string;
  week_start: string;
  stats: import("@/lib/review/stats").WeeklyStats;
  summary: string | null;
  source: "ai" | "rules";
  created_at: string;
  updated_at: string;
}
