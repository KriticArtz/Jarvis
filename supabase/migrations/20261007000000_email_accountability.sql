-- =============================================================================
-- Email accountability
--
-- Jarvis can check in by email and continue the conversation when the user
-- replies. Email is a third channel next to 'app' and 'sms' and reuses the
-- same conversations, messages and assistant actions (incl. confirmations).
--
--   * notification_preferences.email_* — the user's opt-in (default OFF) and a
--     per-user daily send cap. The address is always the account's auth email;
--     no second copy is stored as a source of truth.
--   * email_outbound — every email Jarvis sends (or records in test mode).
--     reply_token routes a reply back to its user + conversation server-side.
--     unique (user_id, dedupe_key) prevents duplicate sends.
--   * email_inbound  — every inbound webhook delivery. unique (provider,
--     provider_email_id) makes duplicate deliveries a no-op.
--
-- Both email tables are written only by the server (service role). Users can
-- read their own outbound history; the inbound log is server-only.
-- =============================================================================

-- 1. 'email' channel ---------------------------------------------------------
alter table public.conversations drop constraint if exists conversations_channel_check;
alter table public.conversations add constraint conversations_channel_check check (channel in ('app', 'sms', 'email'));

alter table public.conversation_messages drop constraint if exists conversation_messages_channel_check;
alter table public.conversation_messages add constraint conversation_messages_channel_check check (channel in ('app', 'sms', 'email'));

alter table public.assistant_actions drop constraint if exists assistant_actions_channel_check;
alter table public.assistant_actions add constraint assistant_actions_channel_check check (channel in ('app', 'sms', 'email'));

-- 2. Preferences (default OFF) ----------------------------------------------
alter table public.notification_preferences
  add column email_enabled boolean not null default false,
  add column email_enabled_at timestamptz,
  add column email_daily_limit smallint not null default 6 check (email_daily_limit between 1 and 20);

-- 3. Outbound ----------------------------------------------------------------
create table public.email_outbound (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  kind text not null check (kind in ('check_in', 'reply', 'test')),
  to_email text not null check (char_length(to_email) <= 320),
  subject text not null check (char_length(subject) <= 200),
  body text not null check (char_length(body) <= 8000),
  -- Opaque random token in the Reply-To address (reply+<token>@domain).
  reply_token text not null unique check (char_length(reply_token) between 20 and 64),
  -- test = recorded in test mode, never delivered
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped', 'test')),
  provider text,
  provider_message_id text,
  error text check (char_length(error) <= 500),
  dedupe_key text not null check (char_length(dedupe_key) <= 200),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index email_outbound_user_created_idx on public.email_outbound (user_id, created_at desc);

-- 4. Inbound -----------------------------------------------------------------
create table public.email_inbound (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_email_id text not null,
  user_id uuid references auth.users (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  outbound_id uuid references public.email_outbound (id) on delete set null,
  from_email text check (char_length(from_email) <= 320),
  subject text check (char_length(subject) <= 200),
  body text check (char_length(body) <= 8000),
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  error text check (char_length(error) <= 500),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_email_id)
);

create index email_inbound_user_created_idx on public.email_inbound (user_id, created_at desc);

-- 5. RLS & grants ------------------------------------------------------------
alter table public.email_outbound enable row level security;
alter table public.email_inbound enable row level security;

-- Users can read their own sent-email history; only the server writes it.
create policy "email_outbound_select_own" on public.email_outbound
  for select to authenticated using (user_id = (select auth.uid()));
-- email_inbound: no policies — server only.

revoke all on public.email_outbound from anon, authenticated;
revoke all on public.email_inbound from anon, authenticated;
grant select on public.email_outbound to authenticated;
grant all on public.email_outbound to service_role;
grant all on public.email_inbound to service_role;
