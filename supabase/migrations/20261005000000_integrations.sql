-- =============================================================================
-- Integrations foundation (calendar + fitness)
--
--   integration_connections  one row per user per provider (connected state,
--                            sync metadata). Users can READ their own rows;
--                            all writes happen server-side after auth checks.
--   integration_credentials  OAuth tokens, encrypted by the app (AES-256-GCM)
--                            before they reach the database. SERVER-ONLY: no
--                            grants to API roles, RLS with no policies.
--   calendar_events          normalized, read-only copy of upcoming events.
--   fitness_daily_summaries  daily aggregates (steps, active energy, distance,
--   fitness_workouts         sleep) and workout summaries submitted by native
--                            apps. No raw samples are stored.
--
-- Everything is user-scoped, deleted with the account (auth.users cascade)
-- and deleted when the user disconnects the provider (connection cascade).
-- Calendar and health data are sensitive personal data: users can read only
-- their own rows, and nobody but the service role can write them.
-- =============================================================================

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google_calendar', 'apple_calendar', 'apple_health', 'health_connect')),
  kind text not null check (kind in ('calendar', 'fitness')),
  -- 'error' = the provider rejected our credentials (e.g. access revoked at
  -- Google); the user must reconnect.
  status text not null default 'connected' check (status in ('connected', 'error')),
  scopes text[] not null default '{}',
  last_synced_at timestamptz,
  last_error text check (char_length(last_error) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider),
  check (
    (kind = 'calendar' and provider in ('google_calendar', 'apple_calendar'))
    or (kind = 'fitness' and provider in ('apple_health', 'health_connect'))
  )
);

create trigger integration_connections_updated_at before update on public.integration_connections
  for each row execute function public.set_updated_at();

create table public.integration_credentials (
  connection_id uuid primary key references public.integration_connections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Encrypted by the app with INTEGRATIONS_ENCRYPTION_KEY; never plaintext.
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger integration_credentials_updated_at before update on public.integration_credentials
  for each row execute function public.set_updated_at();

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid not null references public.integration_connections (id) on delete cascade,
  provider text not null check (provider in ('google_calendar', 'apple_calendar')),
  provider_event_id text not null check (char_length(provider_event_id) between 1 and 1024),
  calendar_id text not null check (char_length(calendar_id) between 1 and 1024),
  title text not null check (char_length(title) <= 300),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  -- For all-day events: the calendar dates (end is exclusive, as providers report it)
  start_date date,
  end_date date,
  timezone text check (char_length(timezone) <= 64),
  location text check (char_length(location) <= 300),
  status text not null default 'confirmed' check (status in ('confirmed', 'tentative', 'cancelled')),
  -- false when the event is marked "free" (doesn't block time)
  is_busy boolean not null default true,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at),
  unique (user_id, provider, calendar_id, provider_event_id)
);

create index calendar_events_user_time_idx on public.calendar_events (user_id, starts_at);
create trigger calendar_events_updated_at before update on public.calendar_events
  for each row execute function public.set_updated_at();

create table public.fitness_daily_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid not null references public.integration_connections (id) on delete cascade,
  provider text not null check (provider in ('apple_health', 'health_connect')),
  summary_date date not null,
  steps integer check (steps between 0 and 200000),
  active_calories_kcal numeric(8, 1) check (active_calories_kcal between 0 and 20000),
  distance_m numeric(10, 1) check (distance_m between 0 and 500000),
  sleep_minutes integer check (sleep_minutes between 0 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, summary_date)
);

create trigger fitness_daily_summaries_updated_at before update on public.fitness_daily_summaries
  for each row execute function public.set_updated_at();

create table public.fitness_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid not null references public.integration_connections (id) on delete cascade,
  provider text not null check (provider in ('apple_health', 'health_connect')),
  provider_workout_id text not null check (char_length(provider_workout_id) between 1 and 200),
  activity_type text not null check (activity_type in ('walking', 'running', 'cycling', 'swimming', 'strength', 'hiit', 'yoga', 'other')),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 0 and 1440),
  active_calories_kcal numeric(8, 1) check (active_calories_kcal between 0 and 20000),
  distance_m numeric(10, 1) check (distance_m between 0 and 500000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at >= started_at),
  unique (user_id, provider, provider_workout_id)
);

create index fitness_workouts_user_time_idx on public.fitness_workouts (user_id, started_at desc);
create trigger fitness_workouts_updated_at before update on public.fitness_workouts
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security: owners may READ their own rows. No insert/update/delete
-- policies — writes go through server code (service role) after it has
-- authenticated the user and validated the data.
-- -----------------------------------------------------------------------------

alter table public.integration_connections enable row level security;
alter table public.integration_credentials enable row level security;
alter table public.calendar_events enable row level security;
alter table public.fitness_daily_summaries enable row level security;
alter table public.fitness_workouts enable row level security;

create policy "integration_connections_select_own" on public.integration_connections
  for select to authenticated using (user_id = (select auth.uid()));
create policy "calendar_events_select_own" on public.calendar_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy "fitness_daily_summaries_select_own" on public.fitness_daily_summaries
  for select to authenticated using (user_id = (select auth.uid()));
create policy "fitness_workouts_select_own" on public.fitness_workouts
  for select to authenticated using (user_id = (select auth.uid()));
-- integration_credentials: intentionally no policies.

revoke all on public.integration_connections from anon, authenticated;
revoke all on public.integration_credentials from anon, authenticated;
revoke all on public.calendar_events from anon, authenticated;
revoke all on public.fitness_daily_summaries from anon, authenticated;
revoke all on public.fitness_workouts from anon, authenticated;

grant select on public.integration_connections to authenticated;
grant select on public.calendar_events to authenticated;
grant select on public.fitness_daily_summaries to authenticated;
grant select on public.fitness_workouts to authenticated;

grant all on public.integration_connections to service_role;
grant all on public.integration_credentials to service_role;
grant all on public.calendar_events to service_role;
grant all on public.fitness_daily_summaries to service_role;
grant all on public.fitness_workouts to service_role;
