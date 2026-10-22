-- Scheduled email check-ins: morning, afternoon and evening.
--
-- Email has its own schedule, independent of the SMS check-in toggles, so
-- changing one channel never changes the other. Quiet hours
-- (quiet_hours_start/end) stay shared: nothing is sent during them on any
-- channel. Every slot defaults to OFF, for new and existing users alike:
-- turning email check-ins on (email_enabled) never signs anyone up for
-- scheduled emails by itself; the user picks the slots they want in Settings.
-- Nothing is scheduled unless email check-ins are on, the slot is chosen, and
-- the server's EMAIL_SCHEDULE_ENABLED switch is set. Duplicate sends are
-- prevented by email_outbound's existing unique (user_id, dedupe_key), with
-- keys like "check_in:2026-10-21:morning".

alter table public.notification_preferences
  add column email_morning_enabled boolean not null default false,
  add column email_morning_time time not null default '08:00',
  add column email_afternoon_enabled boolean not null default false,
  add column email_afternoon_time time not null default '13:00',
  add column email_evening_enabled boolean not null default false,
  add column email_evening_time time not null default '20:30';
