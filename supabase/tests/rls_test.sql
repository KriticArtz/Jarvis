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

select 'RLS checks passed' as result;
