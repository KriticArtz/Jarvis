-- =============================================================================
-- Production safety (phase 1)
--   * phone_verifications — foundation for verifying a phone number before SMS
--   * phone_verified_at is cleared whenever the phone number changes
--   * ai_usage_events — server-side record of every OpenAI request
--   * inbound_messages are deleted with the account (were kept, unlinked)
--
-- Both new tables are SERVER-ONLY: RLS is enabled with no policies and API
-- roles have no grants, so only the service role (server code) can use them.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Phone verification
-- -----------------------------------------------------------------------------

create table public.phone_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- E.164 number the code was sent to; verification only counts for this number
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  -- 'test' (local development only) or, later, 'twilio_verify'
  provider text not null check (provider in ('test', 'twilio_verify')),
  -- HMAC of the code for providers that generate codes locally; null when the
  -- provider (e.g. Twilio Verify) holds the code itself
  code_hash text,
  provider_ref text,
  attempts smallint not null default 0,
  max_attempts smallint not null default 5,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index phone_verifications_user_idx on public.phone_verifications (user_id, created_at desc);

-- A verified number stops being verified the moment it changes.
create or replace function public.reset_phone_verification()
returns trigger
language plpgsql
as $$
begin
  if new.phone is distinct from old.phone then
    new.phone_verified_at = null;
  end if;
  return new;
end;
$$;

create trigger profiles_reset_phone_verification
  before update of phone on public.profiles
  for each row execute function public.reset_phone_verification();

-- -----------------------------------------------------------------------------
-- AI usage tracking
-- -----------------------------------------------------------------------------

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  -- Deleted with the account (usage is personal data)
  user_id uuid references auth.users (id) on delete cascade,
  -- chat | sms_reply | plan | insight | weekly_review | conversation_summary
  feature text not null check (char_length(feature) between 1 and 40),
  model text not null check (char_length(model) <= 80),
  status text not null check (status in ('ok', 'empty', 'error')),
  input_tokens integer,
  cached_input_tokens integer,
  output_tokens integer,
  reasoning_tokens integer,
  total_tokens integer,
  -- Estimate from the app's price table; null when the model's price is unknown
  estimated_cost_usd numeric(12, 6),
  latency_ms integer,
  openai_request_id text,
  error_code text,
  created_at timestamptz not null default now()
);

create index ai_usage_events_user_created_idx on public.ai_usage_events (user_id, created_at desc);
create index ai_usage_events_created_idx on public.ai_usage_events (created_at desc);

-- -----------------------------------------------------------------------------
-- Account deletion: raw inbound SMS (phone number + message body) must go
-- with the account instead of lingering with user_id = null.
-- -----------------------------------------------------------------------------

alter table public.inbound_messages drop constraint if exists inbound_messages_user_id_fkey;
alter table public.inbound_messages
  add constraint inbound_messages_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

-- -----------------------------------------------------------------------------
-- Security: server-only tables
-- -----------------------------------------------------------------------------

alter table public.phone_verifications enable row level security;
alter table public.ai_usage_events enable row level security;

revoke all on public.phone_verifications from anon, authenticated;
revoke all on public.ai_usage_events from anon, authenticated;
grant all on public.phone_verifications to service_role;
grant all on public.ai_usage_events to service_role;
