-- =============================================================================
-- Assistant action results (phase 4B)
--
-- The structured result of an assistant action — or, for a proposal, the
-- change awaiting the user's OK — so the chat can show it as a real object
-- ("Moved Workout to tomorrow at 5:30 PM, from today at 6:00 PM") and rebuild
-- it when a conversation is reloaded.
--
-- Additive and nullable: existing rows (and actions without a result) keep
-- working as plain status lines. The value is written by server code from a
-- whitelisted schema and validated again before it is rendered; it is never
-- interpreted as HTML. Existing owner-only RLS policies and grants apply.
-- =============================================================================

alter table public.assistant_actions add column result jsonb;

alter table public.assistant_actions
  add constraint assistant_actions_result_check
  check (result is null or (jsonb_typeof(result) = 'object' and pg_column_size(result) <= 16384));
