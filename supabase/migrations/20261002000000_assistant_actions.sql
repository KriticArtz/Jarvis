-- =============================================================================
-- Assistant actions (phase 2)
--
-- One row per data change the AI assistant makes or proposes. It is:
--   * the audit log of every assistant-initiated change (succeeded / failed)
--   * the store for proposals awaiting the user's confirmation. A proposal is
--     executed later, from its STORED arguments, only if the user confirms in
--     a later message of the same conversation (enforced in server code).
--
-- Owner-only RLS, like every other user table. Rows are deleted with the
-- account (and with their conversation).
-- =============================================================================

create table public.assistant_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete cascade,
  channel text not null default 'app' check (channel in ('app', 'sms')),
  tool text not null check (char_length(tool) between 1 and 60),
  arguments jsonb not null default '{}'::jsonb,
  status text not null check (status in ('succeeded', 'failed', 'pending_confirmation', 'cancelled', 'expired')),
  -- Short, user-facing description of what was (or would be) done
  summary text check (char_length(summary) <= 500),
  error_code text check (char_length(error_code) <= 60),
  expires_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index assistant_actions_user_conv_idx on public.assistant_actions (user_id, conversation_id, created_at desc);
create index assistant_actions_pending_idx on public.assistant_actions (user_id, status) where status = 'pending_confirmation';

alter table public.assistant_actions enable row level security;

create policy "assistant_actions_select_own" on public.assistant_actions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "assistant_actions_insert_own" on public.assistant_actions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "assistant_actions_update_own" on public.assistant_actions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- A row may only point at the user's own conversation.
create policy "assistant_actions_conversation_owned" on public.assistant_actions as restrictive
  for all to authenticated
  using (true)
  with check (
    conversation_id is null
    or exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
  );

-- Users may read, add and update (resolve) their own rows, but never delete
-- audit history: revoke the default grants first, then grant only what's needed.
revoke all on public.assistant_actions from anon, authenticated;
grant select, insert, update on public.assistant_actions to authenticated;
grant all on public.assistant_actions to service_role;
