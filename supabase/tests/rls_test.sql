-- RLS isolation checks, run against a local Postgres with local_auth_stub.sql.
-- Every failed expectation raises an exception (psql -v ON_ERROR_STOP=1).
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- Signup trigger created profile + preferences
do $$ begin
  if (select count(*) from public.profiles) <> 2 then raise exception 'profiles not created by trigger'; end if;
  if (select count(*) from public.notification_preferences) <> 2 then raise exception 'prefs not created by trigger'; end if;
end $$;

-- Act as user A
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

insert into public.goals (id, user_id, title, category, goal_type, target_value, target_unit, period)
values ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Work out', 'fitness', 'recurring', 4, 'times', 'week');

update public.profiles set display_name = 'Alex', timezone = 'America/Chicago'
  where id = '00000000-0000-0000-0000-00000000000a';

-- A cannot set phone_verified_at (column privilege)
do $$ begin
  begin
    update public.profiles set phone_verified_at = now() where id = '00000000-0000-0000-0000-00000000000a';
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A cannot insert a goal for B
do $$ begin
  begin
    insert into public.goals (user_id, title, goal_type, period) values ('00000000-0000-0000-0000-00000000000b', 'x', 'recurring', 'week');
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A cannot write notifications (server-only)
do $$ begin
  begin
    insert into public.notifications (user_id, kind, body) values ('00000000-0000-0000-0000-00000000000a', 'test', 'hi');
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Act as user B
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);

do $$ begin
  if (select count(*) from public.goals) <> 0 then raise exception 'B can see A goals'; end if;
  if (select count(*) from public.habits) <> 0 then raise exception 'B can see A habits via view'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'B sees other profiles'; end if;
end $$;

-- B cannot attach progress to A's goal
do $$ begin
  begin
    insert into public.goal_progress (user_id, goal_id, amount, logged_for)
    values ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000a', 1, current_date);
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
end $$;

-- B cannot link a task to A's goal
do $$ begin
  begin
    insert into public.tasks (user_id, goal_id, title, task_date)
    values ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000a', 'steal', current_date);
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
end $$;

-- B updating A's goal affects 0 rows
update public.goals set title = 'hacked' where id = '10000000-0000-0000-0000-00000000000a';

-- anon sees nothing
reset role;
set role anon;
do $$ begin
  begin
    perform count(*) from public.goals;
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$ begin
  if (select title from public.goals where id = '10000000-0000-0000-0000-00000000000a') <> 'Work out' then
    raise exception 'B modified A goal';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Phase 1 (production safety) checks
-- ---------------------------------------------------------------------------

-- Server-only tables: authenticated users can neither read nor write them.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  begin
    perform count(*) from public.phone_verifications;
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.phone_verifications (user_id, phone, provider, expires_at)
    values ('00000000-0000-0000-0000-00000000000a', '+15551234567', 'test', now() + interval '10 minutes');
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.ai_usage_events;
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.ai_usage_events (user_id, feature, model, status)
    values ('00000000-0000-0000-0000-00000000000a', 'chat', 'x', 'ok');
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Changing the phone number clears verification (set by the server, changed by the user).
update public.profiles set phone = '+15551234567', phone_verified_at = now() where id = '00000000-0000-0000-0000-00000000000a';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update public.profiles set phone = '+15557654321' where id = '00000000-0000-0000-0000-00000000000a';
reset role;
do $$ begin
  if (select phone_verified_at from public.profiles where id = '00000000-0000-0000-0000-00000000000a') is not null then
    raise exception 'phone change did not clear phone_verified_at';
  end if;
end $$;
-- Saving the same number again keeps verification.
update public.profiles set phone_verified_at = now() where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set phone = '+15557654321', display_name = 'Alex' where id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if (select phone_verified_at from public.profiles where id = '00000000-0000-0000-0000-00000000000a') is null then
    raise exception 'unchanged phone cleared phone_verified_at';
  end if;
end $$;

-- Account deletion removes every row belonging to the user.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'c@example.com');
insert into public.goals (id, user_id, title, goal_type, period) values ('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000c', 'Read', 'recurring', 'week');
insert into public.tasks (user_id, goal_id, title, task_date) values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000c', 't', current_date);
insert into public.goal_progress (user_id, goal_id, logged_for) values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000c', current_date);
insert into public.conversations (id, user_id) values ('20000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000c');
insert into public.conversation_messages (conversation_id, user_id, role, content) values ('20000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000c', 'user', 'hi');
insert into public.notifications (user_id, kind, body) values ('00000000-0000-0000-0000-00000000000c', 'test', 'hi');
insert into public.inbound_messages (user_id, provider, provider_message_id, from_number, body) values ('00000000-0000-0000-0000-00000000000c', 'twilio', 'SMc', '+15550000000', 'private text');
insert into public.phone_verifications (user_id, phone, provider, expires_at) values ('00000000-0000-0000-0000-00000000000c', '+15550000000', 'test', now());
insert into public.ai_usage_events (user_id, feature, model, status) values ('00000000-0000-0000-0000-00000000000c', 'chat', 'm', 'ok');
insert into public.user_memories (user_id, content) values ('00000000-0000-0000-0000-00000000000c', 'note');

delete from auth.users where id = '00000000-0000-0000-0000-00000000000c';

do $$
declare
  t text;
  n int;
begin
  foreach t in array array[
    'profiles', 'notification_preferences', 'goals', 'tasks', 'goal_progress', 'conversations',
    'conversation_messages', 'notifications', 'inbound_messages', 'phone_verifications',
    'ai_usage_events', 'user_memories'
  ]
  loop
    execute format('select count(*) from public.%I where %s = %L', t,
      case when t = 'profiles' then 'id' else 'user_id' end, '00000000-0000-0000-0000-00000000000c') into n;
    if n <> 0 then raise exception 'account deletion left % row(s) in %', n, t; end if;
  end loop;
  if exists (select 1 from public.inbound_messages where provider_message_id = 'SMc') then
    raise exception 'inbound message survived account deletion';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Phase 2: assistant_actions
-- ---------------------------------------------------------------------------
insert into public.conversations (id, user_id) values ('30000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.conversations (id, user_id) values ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a');
insert into public.assistant_actions (user_id, conversation_id, tool, status, result)
  values ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 'create_task', 'succeeded',
          '{"v":1,"kind":"task","action":"created","title":"Workout","when":null,"durationMinutes":45,"previous":null}');
do $$ begin
  -- Phase 4B: a result must be a JSON object
  begin
    insert into public.assistant_actions (user_id, conversation_id, tool, status, result)
      values ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', 'x', 'succeeded', '"<b>not a card</b>"');
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when check_violation then null;
  end;
  -- cannot write an action for another user
  begin
    insert into public.assistant_actions (user_id, tool, status) values ('00000000-0000-0000-0000-00000000000b', 'x', 'succeeded');
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
  -- cannot attach an action to another user's conversation
  begin
    insert into public.assistant_actions (user_id, conversation_id, tool, status)
      values ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000b', 'x', 'pending_confirmation');
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
  -- cannot delete audit rows
  begin
    delete from public.assistant_actions;
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if (select count(*) from public.assistant_actions) <> 0 then raise exception 'B can see A assistant actions'; end if;
end $$;
update public.assistant_actions set status = 'cancelled', result = '{}'::jsonb;
reset role;
do $$ begin
  if (select status from public.assistant_actions where tool = 'create_task') <> 'succeeded' then
    raise exception 'B modified A assistant action';
  end if;
  if (select result->>'title' from public.assistant_actions where tool = 'create_task') is distinct from 'Workout' then
    raise exception 'B modified A assistant action result';
  end if;
end $$;
-- deleted with the account
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if exists (select 1 from public.assistant_actions) then raise exception 'assistant actions survived account deletion'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Phase 3A: personalization columns on profiles
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000d', 'd@example.com'),
  ('00000000-0000-0000-0000-00000000000e', 'e@example.com');
do $$ begin
  -- New and existing users start with no preferences (the app applies defaults)
  if exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000d'
             and (assistant_name is not null or assistant_personality is not null or theme is not null or appearance is not null)) then
    raise exception 'personalization should default to null';
  end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
update public.profiles set assistant_name = 'Nova', assistant_personality = 'tough_love', theme = 'violet', appearance = 'dark'
  where id = '00000000-0000-0000-0000-00000000000d';
do $$ begin
  if (select assistant_name from public.profiles where id = '00000000-0000-0000-0000-00000000000d') is distinct from 'Nova' then
    raise exception 'D could not save own personalization';
  end if;
  begin
    update public.profiles set theme = 'neon' where id = '00000000-0000-0000-0000-00000000000d';
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when check_violation then null;
  end;
  if (select appearance from public.profiles where id = '00000000-0000-0000-0000-00000000000d') is distinct from 'dark' then
    raise exception 'D could not save own appearance';
  end if;
  begin
    update public.profiles set appearance = 'dim' where id = '00000000-0000-0000-0000-00000000000d';
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set assistant_personality = 'sarcastic' where id = '00000000-0000-0000-0000-00000000000d';
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set assistant_name = '' where id = '00000000-0000-0000-0000-00000000000d';
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set assistant_name = 'A name that is far too long for this' where id = '00000000-0000-0000-0000-00000000000d';
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when check_violation then null;
  end;
end $$;
-- D cannot change E's preferences (RLS: 0 rows touched)
update public.profiles set assistant_name = 'Hacked', theme = 'rose', appearance = 'light' where id = '00000000-0000-0000-0000-00000000000e';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
do $$ begin
  if (select count(*) from public.profiles where assistant_name = 'Nova') <> 0 then raise exception 'E can see D personalization'; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000e' and (assistant_name is not null or theme is not null or appearance is not null)) then
    raise exception 'D modified E personalization';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Integrations: calendar + fitness (sensitive data, server-written only)
-- ---------------------------------------------------------------------------
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000f', 'f@example.com'),
  ('00000000-0000-0000-0000-000000000010', 'g@example.com');
-- The server (service role / owner) writes connections, credentials and data.
insert into public.integration_connections (id, user_id, provider, kind) values
  ('40000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-00000000000f', 'google_calendar', 'calendar'),
  ('41000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-00000000000f', 'apple_health', 'fitness'),
  ('40000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000010', 'google_calendar', 'calendar');
insert into public.integration_credentials (connection_id, user_id, access_token_enc, refresh_token_enc) values
  ('40000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-00000000000f', 'v1.enc-access', 'v1.enc-refresh');
insert into public.calendar_events (user_id, connection_id, provider, provider_event_id, calendar_id, title, starts_at, ends_at) values
  ('00000000-0000-0000-0000-00000000000f', '40000000-0000-0000-0000-00000000000f', 'google_calendar', 'evt1', 'primary', 'Dentist', now(), now() + interval '1 hour'),
  ('00000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000010', 'google_calendar', 'evt1', 'primary', 'G meeting', now(), now() + interval '1 hour');
insert into public.fitness_daily_summaries (user_id, connection_id, provider, summary_date, steps) values
  ('00000000-0000-0000-0000-00000000000f', '41000000-0000-0000-0000-00000000000f', 'apple_health', current_date, 8000);
insert into public.fitness_workouts (user_id, connection_id, provider, provider_workout_id, activity_type, started_at, ended_at, duration_minutes) values
  ('00000000-0000-0000-0000-00000000000f', '41000000-0000-0000-0000-00000000000f', 'apple_health', 'w1', 'running', now() - interval '30 minutes', now(), 30);
do $$ begin
  -- the same provider event id for two users is fine (idempotency key is per user)
  if (select count(*) from public.calendar_events where provider_event_id = 'evt1') <> 2 then raise exception 'per-user event keys'; end if;
  -- a duplicate for the same user is rejected (syncs upsert on this key)
  begin
    insert into public.calendar_events (user_id, connection_id, provider, provider_event_id, calendar_id, title, starts_at, ends_at)
      values ('00000000-0000-0000-0000-00000000000f', '40000000-0000-0000-0000-00000000000f', 'google_calendar', 'evt1', 'primary', 'dup', now(), now());
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when unique_violation then null;
  end;
  -- provider/kind must match
  begin
    insert into public.integration_connections (user_id, provider, kind) values ('00000000-0000-0000-0000-00000000000f', 'health_connect', 'calendar');
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when check_violation then null;
  end;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', false);
do $$ begin
  -- F sees only F's data
  if (select count(*) from public.calendar_events) <> 1 then raise exception 'F sees other users calendar events'; end if;
  if (select count(*) from public.integration_connections) <> 2 then raise exception 'F connections visibility'; end if;
  if (select count(*) from public.fitness_daily_summaries) <> 1 then raise exception 'F fitness visibility'; end if;
  if (select count(*) from public.fitness_workouts) <> 1 then raise exception 'F workouts visibility'; end if;
  -- tokens are never readable through the API, not even your own
  begin
    perform 1 from public.integration_credentials;
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
  -- no client writes: events, fitness data, connections
  begin
    insert into public.calendar_events (user_id, connection_id, provider, provider_event_id, calendar_id, title, starts_at, ends_at)
      values ('00000000-0000-0000-0000-00000000000f', '40000000-0000-0000-0000-00000000000f', 'google_calendar', 'x', 'primary', 'x', now(), now());
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.calendar_events set title = 'changed';
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
  -- Calendar phase 2 metadata is server-written too (a client can't make an invited event "editable").
  begin
    update public.calendar_events set is_organizer = true, color_id = '1';
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.calendar_events where is_organizer and attendee_count = 0 and color_id is null and recurring_event_id is null) <> 1 then
    raise exception 'calendar phase 2 column defaults';
  end if;
  begin
    insert into public.fitness_daily_summaries (user_id, connection_id, provider, summary_date, steps)
      values ('00000000-0000-0000-0000-00000000000f', '41000000-0000-0000-0000-00000000000f', 'apple_health', current_date - 1, 1);
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.integration_connections set status = 'connected', last_error = null;
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.fitness_workouts;
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000010', false);
do $$ begin
  if (select count(*) from public.calendar_events where title = 'Dentist') <> 0 then raise exception 'G sees F calendar'; end if;
  if (select count(*) from public.fitness_daily_summaries) <> 0 then raise exception 'G sees F fitness'; end if;
  if (select count(*) from public.fitness_workouts) <> 0 then raise exception 'G sees F workouts'; end if;
  if (select count(*) from public.integration_connections) <> 1 then raise exception 'G connections visibility'; end if;
end $$;
set role anon;
do $$ begin
  begin
    perform 1 from public.calendar_events;
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
-- Calendar phase 2 column constraints
do $$ begin
  begin
    update public.calendar_events set color_id = 'red' where user_id = '00000000-0000-0000-0000-00000000000f';
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when check_violation then null;
  end;
  begin
    update public.calendar_events set attendee_count = -1 where user_id = '00000000-0000-0000-0000-00000000000f';
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when check_violation then null;
  end;
end $$;
-- Disconnecting (deleting the connection) removes its tokens and data
delete from public.integration_connections where id = '41000000-0000-0000-0000-00000000000f';
do $$ begin
  if exists (select 1 from public.fitness_daily_summaries where user_id = '00000000-0000-0000-0000-00000000000f') then raise exception 'fitness data survived disconnect'; end if;
  if exists (select 1 from public.fitness_workouts where user_id = '00000000-0000-0000-0000-00000000000f') then raise exception 'workouts survived disconnect'; end if;
end $$;
delete from public.integration_connections where id = '40000000-0000-0000-0000-000000000010';
do $$ begin
  if exists (select 1 from public.calendar_events where user_id = '00000000-0000-0000-0000-000000000010') then raise exception 'events survived disconnect'; end if;
end $$;
-- Account deletion removes everything
delete from auth.users where id = '00000000-0000-0000-0000-00000000000f';
do $$ begin
  if exists (select 1 from public.integration_connections where user_id = '00000000-0000-0000-0000-00000000000f')
     or exists (select 1 from public.integration_credentials where user_id = '00000000-0000-0000-0000-00000000000f')
     or exists (select 1 from public.calendar_events where user_id = '00000000-0000-0000-0000-00000000000f') then
    raise exception 'integration data survived account deletion';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Email accountability
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000011', 'g@example.com'),
  ('00000000-0000-0000-0000-000000000012', 'h@example.com');
insert into public.conversations (id, user_id, channel) values ('50000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000011', 'email');
insert into public.email_outbound (id, user_id, conversation_id, kind, to_email, subject, body, reply_token, dedupe_key)
  values ('51000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000011',
          'check_in', 'g@example.com', 'Still on?', 'Hey', repeat('a', 40), 'check_in:1');
insert into public.email_inbound (provider, provider_email_id, user_id, conversation_id, outbound_id, from_email, body)
  values ('resend', 'em_1', '00000000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000011',
          '51000000-0000-0000-0000-000000000011', 'g@example.com', 'private reply');
do $$ begin
  -- email check-ins default OFF
  if (select email_enabled from public.notification_preferences where user_id = '00000000-0000-0000-0000-000000000011') then
    raise exception 'email should default to off';
  end if;
  -- duplicate send / duplicate delivery are rejected by the database
  begin
    insert into public.email_outbound (user_id, kind, to_email, subject, body, reply_token, dedupe_key)
      values ('00000000-0000-0000-0000-000000000011', 'check_in', 'g@example.com', 's', 'b', repeat('b', 40), 'check_in:1');
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when unique_violation then null;
  end;
  begin
    insert into public.email_inbound (provider, provider_email_id) values ('resend', 'em_1');
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when unique_violation then null;
  end;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', false);
-- the owner can turn email on for themselves and read their own sent emails
update public.notification_preferences set email_enabled = true where user_id = '00000000-0000-0000-0000-000000000011';
do $$ begin
  if (select count(*) from public.email_outbound) <> 1 then raise exception 'G cannot read own sent emails'; end if;
  -- but cannot write email records or read the inbound log
  begin
    insert into public.email_outbound (user_id, kind, to_email, subject, body, reply_token, dedupe_key)
      values ('00000000-0000-0000-0000-000000000011', 'test', 'x@example.com', 's', 'b', repeat('c', 40), 'x');
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.email_outbound set to_email = 'x@example.com';
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.email_inbound;
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', false);
update public.notification_preferences set email_enabled = true where user_id = '00000000-0000-0000-0000-000000000011';
do $$ begin
  if (select count(*) from public.email_outbound) <> 0 then raise exception 'H can see G emails'; end if;
end $$;
reset role;
do $$ begin
  if not (select email_enabled from public.notification_preferences where user_id = '00000000-0000-0000-0000-000000000011') then
    raise exception 'G could not enable email';
  end if;
  if (select email_enabled from public.notification_preferences where user_id = '00000000-0000-0000-0000-000000000012') then
    raise exception 'H changed state it does not own';
  end if;
end $$;
set role anon;
do $$ begin
  begin
    perform 1 from public.email_outbound;
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
-- deleted with the account
delete from auth.users where id = '00000000-0000-0000-0000-000000000011';
do $$ begin
  if exists (select 1 from public.email_outbound where user_id = '00000000-0000-0000-0000-000000000011')
     or exists (select 1 from public.email_inbound where provider_email_id = 'em_1') then
    raise exception 'email data survived account deletion';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Money: Plaid-derived data is read-only for users; settings are owner-only;
-- tokens are unreachable; everything goes with the account.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000021', 'm1@example.com'),
  ('00000000-0000-0000-0000-000000000022', 'm2@example.com');
-- Server (service role) writes the synced data.
insert into public.financial_connections (id, user_id, item_id, institution_name)
  values ('40000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000021', 'item-m1', 'Chase');
insert into public.financial_credentials (connection_id, user_id, access_token_enc)
  values ('40000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000021', 'v1.sealed');
insert into public.financial_accounts (id, user_id, connection_id, provider_account_id, name, type, current_balance)
  values ('41000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000021', 'acc-1', 'Checking', 'depository', 3240);
insert into public.financial_transactions (user_id, connection_id, account_id, provider_transaction_id, date, name, merchant_key, amount, category)
  values ('00000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000021', '41000000-0000-0000-0000-000000000021', 'tx-1', current_date, 'NETFLIX.COM', 'netflix', -15.49, 'subscriptions');
insert into public.recurring_payments (id, user_id, pattern_key, merchant_key, merchant_name, category, frequency, average_amount, last_amount, last_date, occurrences, confidence)
  values ('42000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000021', 'netflix:monthly:12', 'netflix', 'Netflix', 'subscriptions', 'monthly', 15.49, 15.49, current_date, 6, 0.9);
-- M2 has an account too (for the cross-user goal check).
insert into public.financial_connections (id, user_id, item_id) values ('40000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000022', 'item-m2');
insert into public.financial_accounts (id, user_id, connection_id, provider_account_id, name, type)
  values ('41000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000022', '40000000-0000-0000-0000-000000000022', 'acc-2', 'Savings', 'depository');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000021', false);
-- Owner reads their own data…
do $$ begin
  if (select count(*) from public.financial_transactions) <> 1 then raise exception 'M1 cannot read own transactions'; end if;
  if (select count(*) from public.financial_accounts) <> 1 then raise exception 'M1 sees other accounts'; end if;
end $$;
-- …can record a review decision, set goals/budget/income…
update public.recurring_payments set decision = 'review' where id = '42000000-0000-0000-0000-000000000021';
insert into public.financial_goals (user_id, name, target_amount, current_amount, monthly_contribution, account_id)
  values ('00000000-0000-0000-0000-000000000021', 'Emergency fund', 10000, 3200, 750, '41000000-0000-0000-0000-000000000021');
insert into public.financial_budgets (user_id, category, monthly_amount) values ('00000000-0000-0000-0000-000000000021', 'total', 2400);
insert into public.financial_income_profile (user_id, gross_monthly_income) values ('00000000-0000-0000-0000-000000000021', 3000);
-- …but cannot write bank data, change amounts, read tokens, or point a goal at someone else's account.
do $$ begin
  begin
    insert into public.financial_transactions (user_id, connection_id, account_id, provider_transaction_id, date, name, merchant_key, amount, category)
      values ('00000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000021', '41000000-0000-0000-0000-000000000021', 'tx-fake', current_date, 'x', 'x', 1000000, 'income');
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.financial_accounts set current_balance = 1000000;
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.recurring_payments set average_amount = 1 where id = '42000000-0000-0000-0000-000000000021';
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.financial_credentials;
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.financial_transactions;
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.financial_goals (user_id, name, target_amount, account_id)
      values ('00000000-0000-0000-0000-000000000021', 'Sneaky', 100, '41000000-0000-0000-0000-000000000022');
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
end $$;
-- Another user sees and changes nothing of M1's.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000022', false);
do $$ begin
  if (select count(*) from public.financial_transactions) <> 0
     or (select count(*) from public.recurring_payments) <> 0
     or (select count(*) from public.financial_goals) <> 0
     or (select count(*) from public.financial_budgets) <> 0
     or (select count(*) from public.financial_income_profile) <> 0
     or (select count(*) from public.financial_connections) <> 1 then
    raise exception 'M2 can see M1 money data';
  end if;
end $$;
update public.recurring_payments set decision = 'cancel';
update public.financial_goals set target_amount = 1;
delete from public.financial_budgets;
set role anon;
do $$ begin
  begin
    perform 1 from public.financial_transactions;
    raise exception 'EXPECTED_FAILURE_NOT_RAISED';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  if (select decision from public.recurring_payments where id = '42000000-0000-0000-0000-000000000021') <> 'review' then raise exception 'M2 changed M1 recurring'; end if;
  if (select target_amount from public.financial_goals where user_id = '00000000-0000-0000-0000-000000000021') <> 10000 then raise exception 'M2 changed M1 goal'; end if;
  if (select count(*) from public.financial_budgets where user_id = '00000000-0000-0000-0000-000000000021') <> 1 then raise exception 'M2 deleted M1 budget'; end if;
end $$;
-- Disconnecting an institution removes its accounts and transactions; deleting the account removes everything.
delete from public.financial_connections where id = '40000000-0000-0000-0000-000000000021';
do $$ begin
  if exists (select 1 from public.financial_transactions where user_id = '00000000-0000-0000-0000-000000000021')
     or exists (select 1 from public.financial_credentials where user_id = '00000000-0000-0000-0000-000000000021') then
    raise exception 'bank data survived disconnect';
  end if;
  if (select account_id from public.financial_goals where user_id = '00000000-0000-0000-0000-000000000021') is not null then
    raise exception 'goal kept a deleted account';
  end if;
end $$;
delete from auth.users where id = '00000000-0000-0000-0000-000000000021';
do $$ begin
  if exists (select 1 from public.financial_goals where user_id = '00000000-0000-0000-0000-000000000021')
     or exists (select 1 from public.recurring_payments where user_id = '00000000-0000-0000-0000-000000000021')
     or exists (select 1 from public.financial_income_profile where user_id = '00000000-0000-0000-0000-000000000021') then
    raise exception 'money data survived account deletion';
  end if;
end $$;

select 'RLS checks passed' as result;
