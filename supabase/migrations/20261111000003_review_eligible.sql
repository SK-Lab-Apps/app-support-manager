-- ============================================================
-- Review eligible users, and an automation that asks them.
--
-- A user is review eligible while they're on PRO — not cancelled — and
-- have been for more than three days: long enough to have used what they
-- pay for, and still choosing to. The Users tab tags them, and an app can
-- turn on a "Review eligible" automation that sends each one a review
-- request (the message with a store button) as they become eligible.
--
-- Nothing recorded when someone became PRO, so app_users now keeps it:
-- pro_since is set when their plan turns PRO, whether the SDK or
-- RevenueCat's webhook says so, kept while they cancel and come back, and
-- cleared when they go to a trial (a user who turns free leaves the
-- directory). Users already PRO count from when the directory first saw
-- them.
--
-- "Not cancelled" is only known for apps with the RevenueCat webhook: the
-- SDK reports a cancelled subscriber who still has access as PRO.
--
-- The automation follows users who become eligible while it is on — those
-- already eligible when it's switched on are left for a send from the
-- Users tab — and skips anyone who has had a review request before, as a
-- reply or a send. A job every ten minutes queues them; send-automations
-- sends them like any automated message, and send_automation_run checks
-- each is still eligible and unasked as it goes.
-- ============================================================

-- ---------- since when ----------
alter table public.app_users add column pro_since timestamptz;

update public.app_users
set pro_since = first_seen_at
where plan in ('pro', 'pro_cancelled');

create function public.track_pro_since()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.plan not in ('pro', 'pro_cancelled') then
    new.pro_since := null;
  elsif tg_op = 'INSERT' then
    new.pro_since := coalesce(new.pro_since, now());
  elsif old.plan not in ('pro', 'pro_cancelled') then
    -- From a trial: a stint starts now.
    new.pro_since := now();
  else
    -- Still PRO, cancelled or not: the stint goes on.
    new.pro_since := coalesce(new.pro_since, now());
  end if;
  return new;
end;
$$;

create trigger app_users_pro_since
  before insert or update of plan on public.app_users
  for each row
  execute function public.track_pro_since();

-- The one definition of eligible, for the Users tab and the automation.
create function public.is_review_eligible(
  p_plan public.user_plan,
  p_pro_since timestamptz
)
returns boolean
language sql
stable
as $$
  select coalesce(
    p_plan = 'pro' and p_pro_since < now() - interval '3 days',
    false
  );
$$;

revoke execute on function public.is_review_eligible(public.user_plan, timestamptz)
  from public, anon;
grant execute on function public.is_review_eligible(public.user_plan, timestamptz)
  to authenticated, service_role;

-- ---------- the Users tab ----------
create or replace view public.app_user_list
with (security_invoker = true) as
select
  au.app_id,
  au.revenuecat_id,
  au.name,
  au.plan,
  au.app_version,
  au.sdk_version,
  au.first_seen_at,
  au.last_seen_at,
  ul.language,
  ps.permission_status as push_status,
  coalesce(
    ps.permission_status = 'granted' and ps.expo_push_token is not null,
    false
  ) as push_reachable,
  (select count(*)
    from public.queries q
    where q.app_id = au.app_id
      and q.revenuecat_id = au.revenuecat_id
      and q.first_user_message_at is not null) as conversation_count,
  au.platform,
  rv.review_requested_at,
  rv.review_opened_at,
  au.pro_since,
  public.is_review_eligible(au.plan, au.pro_since) as review_eligible
from public.app_users au
left join public.user_locales ul
  on ul.app_id = au.app_id and ul.revenuecat_id = au.revenuecat_id
left join public.push_subscriptions ps
  on ps.app_id = au.app_id and ps.revenuecat_id = au.revenuecat_id
cross join lateral (
  select
    max(m.created_at) as review_requested_at,
    max(m.review_opened_at) as review_opened_at
  from public.queries q
  join public.messages m on m.query_id = q.id
  where q.app_id = au.app_id
    and q.revenuecat_id = au.revenuecat_id
    and m.kind = 'review_request'
) rv;

revoke all on public.app_user_list from anon;
grant select on public.app_user_list to authenticated;

-- ---------- when an automation was switched on ----------
-- The review automation follows users who become eligible from then on,
-- so a pause skips anyone whose time comes while it's paused, as with the
-- others. Null for automations from before this, which aren't asked.
alter table public.automations add column enabled_at timestamptz;

create function public.note_automation_enabled()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.enabled and (tg_op = 'INSERT' or not old.enabled) then
    new.enabled_at := now();
  end if;
  return new;
end;
$$;

create trigger automations_enabled
  before insert or update of enabled on public.automations
  for each row
  execute function public.note_automation_enabled();

-- ---------- queueing ----------
-- A run for each user who became eligible while their app's review
-- automation was on, hasn't been asked for a review, and isn't queued
-- already. One run per PRO stint: the id names the stint, so a user is
-- queued once however often this runs. Apps without a store listing
-- queue nothing — the button would have nowhere to go. Returns how many
-- were queued.
create function public.schedule_review_requests()
returns integer
language sql
volatile
set search_path = public
as $$
  with queued as (
    insert into automation_runs (
      automation_id, app_id, event, revenuecat_id, source_event_id,
      source_event_at, due_at
    )
    select
      a.id,
      a.app_id,
      'review_eligible',
      au.revenuecat_id,
      'review_eligible:' || au.revenuecat_id || ':'
        || floor(extract(epoch from au.pro_since))::bigint,
      au.pro_since + interval '3 days',
      greatest(
        now(),
        au.pro_since + interval '3 days' + make_interval(mins => a.delay_minutes)
      )
    from automations a
    join apps ap on ap.id = a.app_id
    join app_users au on au.app_id = a.app_id
    where a.event = 'review_eligible'
      and a.enabled
      and (ap.app_store_id is not null or ap.play_store_package is not null)
      and is_review_eligible(au.plan, au.pro_since)
      and au.pro_since + interval '3 days' >= coalesce(a.enabled_at, a.created_at)
      and not exists (
        select 1
        from queries q
        join messages m on m.query_id = q.id
        where q.app_id = au.app_id
          and q.revenuecat_id = au.revenuecat_id
          and m.kind = 'review_request'
      )
    on conflict (automation_id, source_event_id) do nothing
    returning 1
  )
  select count(*)::integer from queued;
$$;

revoke execute on function public.schedule_review_requests()
  from public, anon, authenticated;
grant execute on function public.schedule_review_requests() to service_role;

-- ---------- sending ----------
-- As before, and a review_eligible run goes out as a review request — or
-- is skipped, with why, if by now the user has cancelled or left PRO, has
-- been asked for a review some other way, or the app's store listing is
-- gone.
create or replace function public.send_automation_run(
  p_run_id uuid,
  p_template text,
  p_send_push boolean,
  p_user_name text,
  p_is_paid boolean,
  p_app_version text,
  p_body text,
  p_body_translated text,
  p_translation_status public.translation_status
)
returns table (o_query_id uuid, o_message_id uuid)
language plpgsql
set search_path = public
as $$
declare
  v_run public.automation_runs;
  v_author uuid;
  v_kind public.message_kind := 'text';
  v_skip text;
  v_broadcast uuid;
  v_query uuid;
  v_message uuid;
begin
  select * into v_run
  from automation_runs
  where id = p_run_id and status = 'sending'
  for update;
  if not found then
    return;
  end if;

  if v_run.event = 'review_eligible' then
    v_skip := case
      when not exists (
        select 1
        from app_users au
        where au.app_id = v_run.app_id
          and au.revenuecat_id = v_run.revenuecat_id
          and is_review_eligible(au.plan, au.pro_since)
      ) then 'No longer eligible'
      when exists (
        select 1
        from queries q
        join messages m on m.query_id = q.id
        where q.app_id = v_run.app_id
          and q.revenuecat_id = v_run.revenuecat_id
          and m.kind = 'review_request'
      ) then 'Already asked for a review'
      when not exists (
        select 1
        from apps
        where id = v_run.app_id
          and (app_store_id is not null or play_store_package is not null)
      ) then 'No store listing'
    end;
    if v_skip is not null then
      update automation_runs
      set status = 'skipped', note = v_skip, processed_at = now()
      where id = p_run_id;
      return;
    end if;
    v_kind := 'review_request';
  end if;

  select updated_by into v_author from automations where id = v_run.automation_id;

  insert into broadcasts (
    app_id, sent_by, body, send_push, recipient_count, automation_id,
    automation_event, kind
  )
  values (
    v_run.app_id, v_author, p_template, p_send_push, 1, v_run.automation_id,
    v_run.event, v_kind
  )
  returning id into v_broadcast;

  insert into queries (
    app_id, type, user_name, revenuecat_id, is_paid, app_version,
    initiated_by, broadcast_id
  )
  values (
    v_run.app_id, 'support', p_user_name, v_run.revenuecat_id, p_is_paid,
    p_app_version, 'admin', v_broadcast
  )
  returning id into v_query;

  insert into messages (
    query_id, sender, admin_id, body, body_translated, body_language,
    translation_status, kind
  )
  values (
    v_query, 'admin', v_author, p_body, p_body_translated, 'en',
    p_translation_status, v_kind
  )
  returning id into v_message;

  update automation_runs
  set status = 'sent', processed_at = now()
  where id = p_run_id;

  return query select v_query, v_message;
end;
$$;

-- ---------- the Automations tab ----------
-- With how many tapped through to the store, for the review automation.
create or replace view public.automation_list
with (security_invoker = true) as
select
  a.id,
  a.app_id,
  a.event,
  a.body,
  a.delay_minutes,
  a.send_push,
  a.enabled,
  a.created_at,
  a.updated_at,
  a.updated_by,
  ad.display_name as updated_by_name,
  (select count(*)
    from public.automation_runs r
    where r.automation_id = a.id
      and r.status in ('pending', 'sending')) as pending_count,
  s.sent_count,
  s.read_count,
  s.replied_count,
  s.review_opened_count
from public.automations a
join public.admins ad on ad.id = a.updated_by
cross join lateral (
  select
    count(distinct b.id) as sent_count,
    count(rr.query_id) filter (where rr.last_read_at >= q.created_at) as read_count,
    count(q.id) filter (where q.first_user_message_at is not null) as replied_count,
    count(q.id) filter (where ro.opened) as review_opened_count
  from public.broadcasts b
  left join public.queries q on q.broadcast_id = b.id
  left join public.read_receipts rr
    on rr.query_id = q.id and rr.reader = 'user'
  left join lateral (
    select true as opened
    from public.messages m
    where m.query_id = q.id
      and m.kind = 'review_request'
      and m.review_opened_at is not null
    limit 1
  ) ro on true
  where b.automation_id = a.id
) s;

revoke all on public.automation_list from anon;
grant select on public.automation_list to authenticated;

-- ---------- schedule ----------
-- Every ten minutes, in the database itself: queueing needs no Edge
-- Function, and send-automations' own job sends what it queues. With no
-- review automation switched on it finds nothing. Unschedule first so
-- re-running the migration is safe.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'schedule-review-requests') then
    perform cron.unschedule('schedule-review-requests');
  end if;
end;
$$;

select cron.schedule(
  'schedule-review-requests',
  '*/10 * * * *',
  $cron$ select public.schedule_review_requests(); $cron$
);
