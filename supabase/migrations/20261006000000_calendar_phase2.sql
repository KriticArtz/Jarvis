-- =============================================================================
-- Calendar phase 2: event metadata for the Calendar page and calendar writes
--
-- Small, non-sensitive metadata only. Descriptions and attendee details are
-- NOT stored: the app fetches them from Google on demand when an event is
-- opened.
--   color_id            Google event color ("1".."11"); null = calendar default
--   recurring_event_id  id of the series this occurrence belongs to (null = not recurring)
--   is_organizer        false when the user was invited (only organizers can edit)
--   attendee_count      number of guests (0 = none); used to warn before changes
--
-- The table's existing RLS (owner read-only; server-side writes only) and
-- grants cover the new columns. Existing rows get defaults and are refreshed
-- on the next sync.
-- =============================================================================

alter table public.calendar_events
  add column color_id text check (color_id is null or color_id ~ '^[0-9]{1,2}$'),
  add column recurring_event_id text check (recurring_event_id is null or char_length(recurring_event_id) between 1 and 1024),
  add column is_organizer boolean not null default true,
  add column attendee_count integer not null default 0 check (attendee_count between 0 and 10000);
