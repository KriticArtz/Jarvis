-- =============================================================================
-- LifePilot — initial schema
--
-- Conventions
--   * Every user-owned table has a `user_id` referencing auth.users and
--     Row Level Security enabled. Policies only ever grant access to rows where
--     user_id = auth.uid().
--   * Server-only tables (inbound SMS log) have RLS enabled with no write
--     policies, so only the service role (used exclusively on the server) can
--     write to them.
--   * Dates that belong to a user's "day" (task_date, plan_date, ...) are plain
--     `date` values computed in the user's own timezone (profiles.timezone).
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles: one row per auth user. Holds identity, schedule and preferences
-- that the assistant uses as structured context.
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text check (char_length(display_name) <= 80),
  -- E.164 formatted phone number, e.g. +15551234567
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  phone_verified_at timestamptz,
  timezone text not null default 'UTC',
  wake_time time,
  sleep_time time,
  work_start time,
  work_end time,
  -- ISO weekday numbers (1 = Monday ... 7 = Sunday)
  work_days smallint[] not null default '{1,2,3,4,5}',
  work_label text not null default 'Work' check (char_length(work_label) <= 40),
  accountability_style text not null default 'balanced'
    check (accountability_style in ('gentle', 'balanced', 'direct')),
  onboarding_step smallint not null default 1,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile + notification preferences row automatically on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- recurring_commitments: fixed blocks the planner must never schedule over
-- (classes, kids' pickup, standing meetings, ...).
-- -----------------------------------------------------------------------------

create table public.recurring_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  days_of_week smallint[] not null default '{1,2,3,4,5,6,7}',
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index recurring_commitments_user_idx on public.recurring_commitments (user_id);
create trigger recurring_commitments_updated_at before update on public.recurring_commitments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- goals: both recurring goals ("work out 4x/week" — these double as habits)
-- and one-time goals ("finish my capstone by Dec 1").
-- -----------------------------------------------------------------------------

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 1000),
  category text not null default 'other' check (char_length(category) between 1 and 40),
  goal_type text not null default 'recurring' check (goal_type in ('recurring', 'one_time')),
  -- Target amount per period (recurring) or in total (one-time). Optional.
  target_value numeric check (target_value is null or target_value > 0),
  -- 'times' | 'minutes' | 'hours' | 'dollars' | 'pages' | any short custom unit
  target_unit text check (char_length(target_unit) <= 24),
  -- Only for recurring goals
  period text check (period in ('day', 'week', 'month')),
  due_date date,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  -- User-defined ordering ("what matters most right now"). Lower = more important.
  rank integer not null default 0,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (goal_type = 'one_time' or period is not null)
);

create index goals_user_status_idx on public.goals (user_id, status, rank);
create trigger goals_updated_at before update on public.goals
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- daily_plans: an AI (or rule-based) proposal for a given day, and whether the
-- user accepted it. Accepted plans materialize into rows in `tasks`.
-- -----------------------------------------------------------------------------

create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_date date not null,
  status text not null default 'draft' check (status in ('draft', 'accepted', 'discarded')),
  -- What the user told the planner ("free 6-9pm, tired today")
  user_input text check (char_length(user_input) <= 2000),
  summary text,
  -- Validated proposal: { items: [...], warnings: [...] }
  proposal jsonb not null default '{}'::jsonb,
  source text not null default 'ai' check (source in ('ai', 'rules')),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index daily_plans_user_date_idx on public.daily_plans (user_id, plan_date desc);
create trigger daily_plans_updated_at before update on public.daily_plans
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- tasks: concrete things to do on a specific day, optionally tied to a goal.
-- -----------------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid references public.goals (id) on delete set null,
  daily_plan_id uuid references public.daily_plans (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  notes text check (char_length(notes) <= 2000),
  task_date date not null,
  scheduled_start time,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 1440),
  is_priority boolean not null default false,
  sort_order integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_user_date_idx on public.tasks (user_id, task_date);
create index tasks_goal_idx on public.tasks (goal_id);
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- goal_progress: append-only log of progress toward a goal. Recurring goal
-- progress for a period is the sum of entries whose logged_for falls in it.
-- -----------------------------------------------------------------------------

create table public.goal_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  -- One auto-logged entry per task (NULLs are distinct, so manual entries are unaffected)
  task_id uuid unique references public.tasks (id) on delete set null,
  amount numeric not null default 1 check (amount > 0),
  note text check (char_length(note) <= 500),
  -- The user's local date the progress counts toward
  logged_for date not null,
  source text not null default 'manual' check (source in ('manual', 'task', 'check_in', 'sms', 'assistant')),
  created_at timestamptz not null default now()
);

create index goal_progress_goal_date_idx on public.goal_progress (goal_id, logged_for);
create index goal_progress_user_date_idx on public.goal_progress (user_id, logged_for);

-- -----------------------------------------------------------------------------
-- habits: recurring goals already act as habits (goal_type = 'recurring',
-- progress logged per period). This view gives a stable name for habit
-- queries so a dedicated table can replace it later without touching callers.
-- security_invoker makes the view respect the caller's RLS policies.
-- -----------------------------------------------------------------------------

create view public.habits
with (security_invoker = true) as
  select id, user_id, title, category, target_value, target_unit, period, priority, rank, status, created_at
  from public.goals
  where goal_type = 'recurring';

-- -----------------------------------------------------------------------------
-- daily_check_ins: morning intention / evening reflection. Channel records
-- whether it came from the app or (in the future) an SMS reply.
-- -----------------------------------------------------------------------------

create table public.daily_check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  check_in_date date not null,
  kind text not null check (kind in ('morning', 'evening')),
  rating smallint check (rating between 1 and 5),
  content text check (char_length(content) <= 2000),
  channel text not null default 'app' check (channel in ('app', 'sms')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, check_in_date, kind)
);

create trigger daily_check_ins_updated_at before update on public.daily_check_ins
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- daily_insights: cached short AI insight for the dashboard (one per day).
-- -----------------------------------------------------------------------------

create table public.daily_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  insight_date date not null,
  content text not null,
  source text not null default 'ai' check (source in ('ai', 'rules')),
  created_at timestamptz not null default now(),
  unique (user_id, insight_date)
);

-- -----------------------------------------------------------------------------
-- weekly_reviews: computed stats (from real data only) + AI summary.
-- -----------------------------------------------------------------------------

create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  stats jsonb not null,
  summary text,
  source text not null default 'ai' check (source in ('ai', 'rules')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create trigger weekly_reviews_updated_at before update on public.weekly_reviews
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Conversations & messages. Kept separate from structured context: the
-- assistant receives structured context + a bounded window of recent messages
-- + rolling summaries, never the full history.
-- -----------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text check (char_length(title) <= 120),
  channel text not null default 'app' check (channel in ('app', 'sms')),
  -- Rolling summary of messages that have fallen out of the context window
  summary text,
  summarized_through timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_updated_idx on public.conversations (user_id, updated_at desc);
create trigger conversations_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 8000),
  channel text not null default 'app' check (channel in ('app', 'sms')),
  created_at timestamptz not null default now()
);

create index conversation_messages_conv_idx on public.conversation_messages (conversation_id, created_at);

-- -----------------------------------------------------------------------------
-- user_memories: durable facts/preferences the assistant should remember
-- ("I work night shifts on weekends"). Structured memory lives here so later
-- versions can add assistant-extracted memories, embeddings, etc.
-- -----------------------------------------------------------------------------

create table public.user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'note' check (kind in ('fact', 'preference', 'note')),
  content text not null check (char_length(content) between 1 and 500),
  source text not null default 'user' check (source in ('user', 'assistant')),
  created_at timestamptz not null default now()
);

create index user_memories_user_idx on public.user_memories (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Notifications (SMS architecture)
-- -----------------------------------------------------------------------------

create table public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  sms_enabled boolean not null default false,
  -- Explicit, timestamped consent. SMS is never sent without it.
  sms_consent_at timestamptz,
  sms_consent_text text,
  sms_opted_out_at timestamptz,
  morning_checkin_enabled boolean not null default true,
  morning_checkin_time time not null default '08:00',
  evening_checkin_enabled boolean not null default true,
  evening_checkin_time time not null default '20:30',
  task_reminders_enabled boolean not null default true,
  quiet_hours_start time default '22:00',
  quiet_hours_end time default '07:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null default 'sms' check (channel in ('sms')),
  kind text not null check (kind in ('morning_checkin', 'task_reminder', 'evening_checkin', 'assistant_reply', 'test', 'system')),
  body text not null check (char_length(body) <= 1600),
  -- test = recorded in test mode, never delivered
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped', 'test')),
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  provider text,
  provider_message_id text,
  error text,
  related_task_id uuid references public.tasks (id) on delete set null,
  -- Prevents duplicate sends (e.g. "morning:2026-09-28")
  dedupe_key text,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_status_idx on public.notifications (status, scheduled_for);

-- Raw inbound SMS log. Written only by the server (service role) from the
-- Twilio webhook after signature verification.
create table public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  provider text not null,
  provider_message_id text not null,
  from_number text not null,
  body text not null,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (provider, provider_message_id)
);

create index profiles_phone_idx on public.profiles (phone) where phone is not null;

-- Signup trigger (declared after notification_preferences exists).
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.recurring_commitments enable row level security;
alter table public.goals enable row level security;
alter table public.daily_plans enable row level security;
alter table public.tasks enable row level security;
alter table public.goal_progress enable row level security;
alter table public.daily_check_ins enable row level security;
alter table public.daily_insights enable row level security;
alter table public.weekly_reviews enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.user_memories enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
alter table public.inbound_messages enable row level security;

-- profiles: read/update own row only (insert happens via the signup trigger).
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Standard "owner has full access" policies for user-owned tables.
do $$
declare
  t text;
begin
  foreach t in array array[
    'recurring_commitments', 'goals', 'daily_plans', 'tasks', 'goal_progress',
    'daily_check_ins', 'daily_insights', 'weekly_reviews', 'conversations',
    'conversation_messages', 'user_memories'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_delete_own', t);
  end loop;
end;
$$;

-- Cross-row ownership checks: a user may only link their rows to their own
-- goals / plans / conversations.
create policy "tasks_goal_owned" on public.tasks as restrictive
  for all to authenticated
  using (true)
  with check (
    (goal_id is null or exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid())))
    and (daily_plan_id is null or exists (select 1 from public.daily_plans p where p.id = daily_plan_id and p.user_id = (select auth.uid())))
  );

create policy "goal_progress_goal_owned" on public.goal_progress as restrictive
  for all to authenticated
  using (true)
  with check (
    exists (select 1 from public.goals g where g.id = goal_id and g.user_id = (select auth.uid()))
    and (task_id is null or exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid())))
  );

create policy "conversation_messages_conv_owned" on public.conversation_messages as restrictive
  for all to authenticated
  using (true)
  with check (
    exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
  );

-- notification_preferences: users manage their own row. Consent fields are
-- written by server actions using the user's session (still bound by RLS).
create policy "notification_preferences_select_own" on public.notification_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notification_preferences_insert_own" on public.notification_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "notification_preferences_update_own" on public.notification_preferences
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- notifications: users can read their own history. Only the server (service
-- role, bypasses RLS) creates or updates notification records.
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

-- inbound_messages: users can read their own inbound log; writes are server-only.
create policy "inbound_messages_select_own" on public.inbound_messages
  for select to authenticated using (user_id = (select auth.uid()));

-- Column-level protection: users may update their own profile, but never
-- identity/verification columns (email is synced from auth, phone
-- verification will be set by the server once a verification flow exists).
revoke update on public.profiles from authenticated;
grant update (
  display_name, phone, timezone, wake_time, sleep_time, work_start, work_end,
  work_days, work_label, accountability_style, onboarding_step, onboarding_completed_at
) on public.profiles to authenticated;

-- Unauthenticated clients never need direct table access.
revoke all on all tables in schema public from anon;
