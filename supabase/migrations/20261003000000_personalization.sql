-- =============================================================================
-- Personalization (phase 3A)
--
-- Per-user assistant identity and appearance, stored on the profile so they
-- reach server-side AI prompts and every device:
--   * assistant_name        — what the user calls their AI (e.g. "Nova")
--   * assistant_personality — how it communicates
--   * theme                 — the app's accent theme
--
-- All three are nullable: null means "use the app default", so existing and
-- demo users need no backfill. The older accountability_style column is kept
-- (and still readable) so code deployed before this migration keeps working;
-- the app maps it to a personality when assistant_personality is null.
-- =============================================================================

alter table public.profiles
  add column assistant_name text
    check (
      assistant_name is null
      or (char_length(assistant_name) between 1 and 24 and assistant_name = btrim(assistant_name) and assistant_name !~ '[[:cntrl:]]')
    ),
  add column assistant_personality text
    check (assistant_personality is null or assistant_personality in ('supportive', 'direct', 'motivational', 'tough_love', 'professional')),
  add column theme text
    check (theme is null or theme in ('ocean', 'midnight', 'violet', 'rose', 'emerald', 'warm'));

-- profiles uses column-level update grants (see the initial schema): users
-- may update these new preference columns on their own row (RLS still limits
-- which row).
grant update (assistant_name, assistant_personality, theme) on public.profiles to authenticated;
