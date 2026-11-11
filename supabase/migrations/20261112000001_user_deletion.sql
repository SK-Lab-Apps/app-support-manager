-- ============================================================
-- Deleting users and their data, by hand and when they expire.
--
-- An admin can select users in the Users tab and delete them. An app can
-- also have users deleted automatically 7 days after their trial or PRO
-- subscription expires. Either way it is this project's database only —
-- nothing changes in RevenueCat or in the app — and it is everything kept
-- under the user's id:
--
-- - their directory entry (app_users);
-- - their conversations, with every message, read receipt and escalation
--   record (they go from the user's support chat in the app too);
-- - their language, push token, automated messages (sent and waiting),
--   RevenueCat events and rate-limit counters.
--
-- Sends in the Sent log stay — they're the team's record — and simply stop
-- naming them, as when a conversation is deleted. A user still on a trial
-- or PRO comes back the next time they open the app, with no history.
--
-- Expiry wasn't recorded anywhere: a user left the directory when their
-- app reported them free, and that was all. expired_users now keeps when,
-- from that report or from RevenueCat's EXPIRATION event (which also takes
-- them out of the directory at once, rather than whenever they next open
-- the app). Coming back — on a trial or PRO again, by either route —
-- clears it. Users who expired before this aren't on record.
--
-- The automatic deletion is off until an app switches it on. It waits for
-- a quiet week: someone who writes to support after expiring is kept until
-- 7 days after their conversation's last message.
-- ============================================================

-- ---------- expiries ----------
create table public.expired_users (
  app_id uuid not null references public.apps (id),
  revenuecat_id text not null,
  -- The earliest word of it: RevenueCat's event time, or the app's report.
  expired_at timestamptz not null,
  primary key (app_id, revenuecat_id)
);

create index expired_users_due_idx on public.expired_users (app_id, expired_at);

alter table public.expired_users enable row level security;
revoke all on public.expired_users from anon;
-- Admins see the counts; only the triggers and functions below write.
create policy expired_users_select on public.expired_users
  for select to authenticated using (public.is_admin());
grant select on public.expired_users to authenticated;

-- What was deleted, when and by whom — counts only, since keeping the ids
-- would keep what was deleted.
create table public.user_deletions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps (id),
  source text not null check (source in ('admin', 'expired')),
  -- The admin, for a deletion by hand.
  deleted_by uuid references public.admins (id) on delete set null,
  user_count integer not null check (user_count > 0),
  created_at timestamptz not null default now()
);

create index user_deletions_app_idx on public.user_deletions (app_id, created_at desc);

alter table public.user_deletions enable row level security;
revoke all on public.user_deletions from anon;
create policy user_deletions_select on public.user_deletions
  for select to authenticated using (public.is_admin());
grant select on public.user_deletions to authenticated;

alter table public.apps
  add column delete_expired_users boolean not null default false;

-- ---------- deleting ----------
-- Everything kept under these ids for this app, in the caller's
-- transaction. Not callable from the API: delete_app_users and
-- purge_expired_users below are the two ways in.
create function public.purge_user_data(p_app_id uuid, p_ids text[])
returns void
language plpgsql
set search_path = public
as $$
begin
  -- Leaving the directory this way isn't an expiry (see note_user_left).
  perform set_config('app.purging_user_data', 'on', true);

  delete from automation_runs
  where app_id = p_app_id and revenuecat_id = any(p_ids);
  -- Messages, read receipts and escalations go with their conversation.
  delete from queries
  where app_id = p_app_id and revenuecat_id = any(p_ids);
  delete from user_locales
  where app_id = p_app_id and revenuecat_id = any(p_ids);
  delete from push_subscriptions
  where app_id = p_app_id and revenuecat_id = any(p_ids);
  delete from subscription_events
  where app_id = p_app_id and revenuecat_ids && p_ids;
  -- Per-user counters (see the Edge Functions' rate limits).
  delete from rate_limits
  where key in (
    select k.prefix || ':' || p_app_id::text || ':' || u.rid
    from unnest(p_ids) as u (rid)
    cross join unnest(array['sq', 'pm', 'ru', 'ro']) as k (prefix)
  );
  delete from app_users
  where app_id = p_app_id and revenuecat_id = any(p_ids);
  delete from expired_users
  where app_id = p_app_id and revenuecat_id = any(p_ids);

  perform set_config('app.purging_user_data', 'off', true);
end;
$$;

revoke execute on function public.purge_user_data(uuid, text[])
  from public, anon, authenticated;
grant execute on function public.purge_user_data(uuid, text[]) to service_role;

-- By hand, from the Users tab. SECURITY DEFINER, so it can reach the
-- tables admins can't write directly; it checks for an admin itself.
-- Returns how many users were deleted.
create function public.delete_app_users(p_app_id uuid, p_revenuecat_ids text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids text[];
begin
  if not is_admin() then
    raise exception 'Only admins can delete users' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct u.rid), '{}') into v_ids
  from unnest(p_revenuecat_ids) as u (rid)
  where u.rid is not null and u.rid <> '';
  if cardinality(v_ids) = 0 then
    return 0;
  end if;
  if cardinality(v_ids) > 1000 then
    raise exception 'At most 1000 users at a time' using errcode = '22023';
  end if;

  perform purge_user_data(p_app_id, v_ids);
  insert into user_deletions (app_id, source, deleted_by, user_count)
  values (p_app_id, 'admin', auth.uid(), cardinality(v_ids));
  return cardinality(v_ids);
end;
$$;

revoke execute on function public.delete_app_users(uuid, text[]) from public, anon;
grant execute on function public.delete_app_users(uuid, text[]) to authenticated;

-- ---------- noticing expiry ----------
-- The app reported them free (touchAppUser deletes the row), or RevenueCat
-- said so (below). Not when the deletion above is what removed them.
create function public.note_user_left()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.purging_user_data', true), '') = 'on' then
    return null;
  end if;
  insert into expired_users (app_id, revenuecat_id, expired_at)
  values (old.app_id, old.revenuecat_id, now())
  on conflict (app_id, revenuecat_id) do update
    set expired_at = least(expired_users.expired_at, excluded.expired_at);
  return null;
end;
$$;

create trigger app_users_left
  after delete on public.app_users
  for each row
  execute function public.note_user_left();

-- Back in the directory: the app reported a trial or PRO again. An upsert
-- of someone already there is an update, and clears nothing.
create function public.note_user_returned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from expired_users
  where app_id = new.app_id and revenuecat_id = new.revenuecat_id;
  return null;
end;
$$;

create trigger app_users_returned
  after insert on public.app_users
  for each row
  execute function public.note_user_returned();

-- RevenueCat's word, in the order things happened (see
-- record_subscription_event, which records each event): EXPIRATION, unless
-- a later event put them back on a plan, notes when and takes them out of
-- the directory; any event that sets a plan clears an expiry before it.
create function public.note_subscription_expiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'EXPIRATION' then
    if exists (
      select 1
      from subscription_events e
      where e.app_id = new.app_id
        and e.revenuecat_ids && new.revenuecat_ids
        and e.plan is not null
        and e.event_at > new.event_at
    ) then
      return null;
    end if;
    -- Only the ids something is kept under: one person's aliases needn't
    -- each be counted.
    insert into expired_users (app_id, revenuecat_id, expired_at)
    select new.app_id, u.rid, least(new.event_at, now())
    from unnest(new.revenuecat_ids) as u (rid)
    where exists (select 1 from app_users au where au.app_id = new.app_id and au.revenuecat_id = u.rid)
       or exists (select 1 from queries q where q.app_id = new.app_id and q.revenuecat_id = u.rid)
       or exists (select 1 from push_subscriptions ps where ps.app_id = new.app_id and ps.revenuecat_id = u.rid)
       or exists (select 1 from user_locales ul where ul.app_id = new.app_id and ul.revenuecat_id = u.rid)
    on conflict (app_id, revenuecat_id) do update
      set expired_at = least(expired_users.expired_at, excluded.expired_at);
    delete from app_users
    where app_id = new.app_id and revenuecat_id = any(new.revenuecat_ids);
  elsif new.plan is not null then
    delete from expired_users
    where app_id = new.app_id
      and revenuecat_id = any(new.revenuecat_ids)
      and expired_at <= new.event_at;
  end if;
  return null;
end;
$$;

create trigger subscription_events_expiry
  after insert on public.subscription_events
  for each row
  execute function public.note_subscription_expiry();

-- ---------- deleting the expired ----------
-- For each app that has it on: users expired more than 7 days ago whose
-- conversations have been quiet for 7 days, oldest first, up to p_limit
-- per app per run. Returns how many were deleted.
create function public.purge_expired_users(p_limit integer default 500)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_app uuid;
  v_ids text[];
  v_total integer := 0;
begin
  for v_app in select id from apps where delete_expired_users loop
    select coalesce(array_agg(due.revenuecat_id), '{}') into v_ids
    from (
      select x.revenuecat_id
      from expired_users x
      where x.app_id = v_app
        and x.expired_at < now() - interval '7 days'
        and not exists (
          select 1
          from queries q
          join messages m on m.query_id = q.id
          where q.app_id = x.app_id
            and q.revenuecat_id = x.revenuecat_id
            and m.created_at >= now() - interval '7 days'
        )
      order by x.expired_at
      limit p_limit
    ) due;

    if cardinality(v_ids) > 0 then
      perform purge_user_data(v_app, v_ids);
      insert into user_deletions (app_id, source, user_count)
      values (v_app, 'expired', cardinality(v_ids));
      v_total := v_total + cardinality(v_ids);
    end if;
  end loop;
  return v_total;
end;
$$;

revoke execute on function public.purge_expired_users(integer)
  from public, anon, authenticated;
grant execute on function public.purge_expired_users(integer) to service_role;

-- ---------- the Automations tab ----------
-- Whether it's on, who's waiting, and what it has deleted.
create view public.expired_user_cleanup
with (security_invoker = true) as
select
  a.id as app_id,
  a.delete_expired_users as enabled,
  (select count(*)
    from public.expired_users x
    where x.app_id = a.id) as expired_count,
  -- Past their 7 days; the next run deletes them, unless they're still
  -- talking to support.
  (select count(*)
    from public.expired_users x
    where x.app_id = a.id
      and x.expired_at < now() - interval '7 days') as due_count,
  (select coalesce(sum(d.user_count), 0)
    from public.user_deletions d
    where d.app_id = a.id and d.source = 'expired') as deleted_count,
  (select max(d.created_at)
    from public.user_deletions d
    where d.app_id = a.id and d.source = 'expired') as last_deleted_at
from public.apps a;

revoke all on public.expired_user_cleanup from anon;
grant select on public.expired_user_cleanup to authenticated;

-- ---------- schedule ----------
-- Hourly, in the database itself. Apps that haven't switched it on cost
-- one lookup. Unschedule first so re-running the migration is safe.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-expired-users') then
    perform cron.unschedule('purge-expired-users');
  end if;
end;
$$;

select cron.schedule(
  'purge-expired-users',
  '17 * * * *',
  $cron$ select public.purge_expired_users(); $cron$
);
