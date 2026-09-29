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

select 'RLS checks passed' as result;
