-- =============================================================================
-- Real-model acceptance: seed ONE test account's day (Preview database only).
--
-- Run in the Supabase SQL editor of the PREVIEW project (never production),
-- after the test user has signed up and finished onboarding. Replace the email
-- below. Safe to re-run: it clears that user's tasks for today, goals named
-- below and memories first. Times are relative to "now" in the user's time
-- zone, so the day always has a past, a present and a future.
-- =============================================================================

do $$
declare
  v_email text := 'preview-tester@example.com';  -- ← the test account
  v_user uuid;
  v_tz text;
  v_today date;
  v_now time;
  v_goal uuid;
begin
  select a.id, coalesce(p.timezone, 'UTC') into v_user, v_tz
  from auth.users a join public.profiles p on p.id = a.id
  where a.email = v_email;
  if v_user is null then raise exception 'No onboarded user with email %', v_email; end if;

  v_today := (now() at time zone v_tz)::date;
  v_now := date_trunc('minute', (now() at time zone v_tz))::time;

  delete from public.tasks where user_id = v_user and task_date = v_today;
  delete from public.goals where user_id = v_user and title in ('Run a half marathon', 'Ship the client proposal');
  delete from public.user_memories where user_id = v_user;

  insert into public.goals (user_id, title, category, goal_type, target_value, target_unit, period, priority)
  values (v_user, 'Run a half marathon', 'fitness', 'recurring', 4, 'runs', 'week', 'high')
  returning id into v_goal;
  insert into public.goals (user_id, title, category, goal_type, due_date, priority)
  values (v_user, 'Ship the client proposal', 'work', 'one_time', v_today + 1, 'high');

  -- Today: a priority with a deadline, a workout later, something that slipped,
  -- and two small things — enough for "what now", "overwhelmed" and ambiguity.
  insert into public.tasks (user_id, title, task_date, scheduled_start, duration_minutes, is_priority, goal_id) values
    (v_user, 'Finish the proposal', v_today, null, 90, true, null),
    (v_user, 'Workout', v_today, least(greatest(v_now + interval '3 hours', time '17:00'), time '21:30')::time, 45, false, v_goal),
    (v_user, 'Call the bank', v_today, (v_now - interval '2 hours')::time, 15, false, null),
    (v_user, 'Laundry', v_today, null, 30, false, null),
    (v_user, 'Reply to Maya', v_today, null, 20, false, null);

  -- A preference the assistant should use when relevant (scenario 9).
  insert into public.user_memories (user_id, kind, content, source)
  values (v_user, 'preference', 'I prefer working out in the evening, after 5 PM.', 'user');
end $$;
