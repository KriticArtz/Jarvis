-- =============================================================================
-- Appearance mode (phase 3A follow-up)
--
-- Light / dark / system, chosen independently of the color theme
-- (profiles.theme). Part of the same per-user personalization on profiles.
-- Null means "not chosen": the app then uses the theme's original behavior
-- (Midnight dark, Warm Light light, the others follow the OS), so existing
-- users see no change until they pick a mode.
-- =============================================================================

alter table public.profiles
  add column appearance text
    check (appearance is null or appearance in ('light', 'dark', 'system'));

-- Column-level update grant, like the other personalization columns.
grant update (appearance) on public.profiles to authenticated;
