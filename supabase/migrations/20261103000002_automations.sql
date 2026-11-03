-- ============================================================
-- Automated messages on subscription events.
--
-- Per app, one message per event — a trial starting, a subscription bought
-- without one, a trial converting, a trial or subscription cancelled —
-- sent a set delay after RevenueCat reports it. The revenuecat-webhook
-- function schedules a run per user; a pg_cron job hands due runs to the
-- send-automations function, which sends each the way the Users tab sends
-- a message: a new conversation, translated, out of the inbox until the
-- user replies, and in the Sent log.
--
-- A run is skipped rather than sent when a later event undoes the one it
-- followed (a cancelled trial switched back on, say), or when its
-- automation has been paused by then. Deleting an automation deletes its
-- runs still waiting; what already went out stays in users' chats and the
-- Sent log.
-- ============================================================

create type public.automation_event as enum (
  'trial_started',
  'pro_started',
  'trial_converted',
  'trial_cancelled',
  'pro_cancelled'
);

-- ---------- automations ----------
create table public.automations (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps (id),
  event public.automation_event not null,
  -- A template, like message_templates: {first_name}, {name} and {app}
  -- fill in per user when it is sent.
  body text not null check (char_length(body) between 1 and 1000),
  delay_minutes integer not null default 60
    check (delay_minutes between 0 and 10080),
  send_push boolean not null default false,
  enabled boolean not null default true,
  -- Who wrote the text as it stands. Its messages go out under their name,
  -- as every admin message does; users still see only the support team.
  updated_by uuid not null default auth.uid() references public.admins (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, event)
);

-- An edit is attributed to whoever made it, whatever the request says.
create or replace function public.touch_automation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger automations_touch
  before update on public.automations
  for each row
  execute function public.touch_automation();

alter table public.automations enable row level security;
revoke all on public.automations from anon;
create policy automations_select on public.automations
  for select to authenticated using (public.is_admin());
create policy automations_insert on public.automations
  for insert to authenticated
  with check (public.is_admin() and updated_by = auth.uid());
create policy automations_update on public.automations
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy automations_delete on public.automations
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.automations to authenticated;
grant select on public.automations to service_role;

-- ---------- runs ----------
-- One per user per event an automation follows. Written only by the
-- Edge Functions; admins read them for the pending counts.
create type public.automation_run_status as enum (
  'pending',
  'sending',
  'sent',
  'skipped',
  'failed'
);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations (id) on delete cascade,
  app_id uuid not null references public.apps (id),
  event public.automation_event not null,
  revenuecat_id text not null,
  -- RevenueCat's event id, so an event it delivers twice schedules once.
  source_event_id text not null,
  due_at timestamptz not null,
  status public.automation_run_status not null default 'pending',
  -- Why a run was skipped or failed.
  note text,
  attempts integer not null default 0,
  claimed_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (automation_id, source_event_id)
);

create index automation_runs_due_idx
  on public.automation_runs (due_at)
  where status in ('pending', 'sending');
create index automation_runs_user_idx
  on public.automation_runs (app_id, revenuecat_id)
  where status = 'pending';

alter table public.automation_runs enable row level security;
revoke all on public.automation_runs from anon;
create policy automation_runs_select on public.automation_runs
  for select to authenticated using (public.is_admin());
grant select on public.automation_runs to authenticated;
grant select, insert, update on public.automation_runs to service_role;

-- ---------- sends ----------
-- An automated send is a broadcast to one user, so it lands in the Sent
-- log with the rest. The event is kept on the send itself: it still says
-- what sent it once the automation is deleted.
alter table public.broadcasts
  add column automation_id uuid references public.automations (id) on delete set null,
  add column automation_event public.automation_event;

create index broadcasts_automation_idx on public.broadcasts (automation_id)
  where automation_id is not null;

drop view if exists public.broadcast_summary;

create view public.broadcast_summary
with (security_invoker = true) as
select
  b.id,
  b.app_id,
  b.body,
  b.send_push,
  b.recipient_count,
  b.created_at,
  b.sent_by,
  ad.display_name as sent_by_name,
  t.name as template_name,
  count(rr.query_id) filter (where rr.last_read_at >= q.created_at) as read_count,
  count(q.id) filter (where q.first_user_message_at is not null) as replied_count,
  -- Conversations still there to list; at most recipient_count.
  count(q.id) as recipient_listed,
  -- Enough to name a send in the list; broadcast_recipients has the rest.
  -- A conversation has at most one user receipt, so the join repeats no
  -- one.
  coalesce(
    (array_agg(q.user_name order by q.user_name) filter (where q.id is not null))[1:3],
    '{}'
  ) as recipient_names,
  b.automation_id,
  b.automation_event
from public.broadcasts b
join public.admins ad on ad.id = b.sent_by
left join public.message_templates t on t.id = b.template_id
left join public.queries q on q.broadcast_id = b.id
left join public.read_receipts rr
  on rr.query_id = q.id and rr.reader = 'user'
group by b.id, ad.display_name, t.name;

revoke all on public.broadcast_summary from anon;
grant select on public.broadcast_summary to authenticated;

-- The Automations tab: each automation with how its sends landed, counted
-- like the Sent log's (and cleared with it).
create view public.automation_list
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
  s.replied_count
from public.automations a
join public.admins ad on ad.id = a.updated_by
cross join lateral (
  select
    count(distinct b.id) as sent_count,
    count(rr.query_id) filter (where rr.last_read_at >= q.created_at) as read_count,
    count(q.id) filter (where q.first_user_message_at is not null) as replied_count
  from public.broadcasts b
  left join public.queries q on q.broadcast_id = b.id
  left join public.read_receipts rr
    on rr.query_id = q.id and rr.reader = 'user'
  where b.automation_id = a.id
) s;

revoke all on public.automation_list from anon;
grant select on public.automation_list to authenticated;

-- ---------- sending ----------
-- Takes due runs for one send-automations call. A run whose call died
-- part-way is taken again ten minutes on; send_automation_run below is
-- what keeps that from sending twice.
create or replace function public.claim_automation_runs(p_limit integer default 100)
returns setof public.automation_runs
language sql
volatile
set search_path = public
as $$
  update public.automation_runs r
  set status = 'sending', claimed_at = now(), attempts = r.attempts + 1
  where r.id in (
    select id
    from public.automation_runs
    where (status = 'pending' and due_at <= now())
       or (status = 'sending' and claimed_at < now() - interval '10 minutes')
    order by due_at
    limit p_limit
    for update skip locked
  )
  returning r.*;
$$;

revoke execute on function public.claim_automation_runs(integer)
  from public, anon, authenticated;
grant execute on function public.claim_automation_runs(integer) to service_role;

-- Sends one claimed run: the send, the conversation and its message land
-- together with the run marked sent, in one transaction. Returns nothing
-- when the run is no longer being sent — another call got there first —
-- so the caller pushes only what it actually sent.
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

  select updated_by into v_author from automations where id = v_run.automation_id;

  insert into broadcasts (
    app_id, sent_by, body, send_push, recipient_count, automation_id,
    automation_event
  )
  values (
    v_run.app_id, v_author, p_template, p_send_push, 1, v_run.automation_id,
    v_run.event
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
    translation_status
  )
  values (
    v_query, 'admin', v_author, p_body, p_body_translated, 'en',
    p_translation_status
  )
  returning id into v_message;

  update automation_runs
  set status = 'sent', processed_at = now()
  where id = p_run_id;

  return query select v_query, v_message;
end;
$$;

revoke execute on function public.send_automation_run(
  uuid, text, boolean, text, boolean, text, text, text, public.translation_status
) from public, anon, authenticated;
grant execute on function public.send_automation_run(
  uuid, text, boolean, text, boolean, text, text, text, public.translation_status
) to service_role;

-- ---------- schedule ----------
-- Every minute, but the function is only called when a run is due, so an
-- idle minute costs one indexed lookup. Same vault secrets as the
-- escalation and translation jobs (see README). Unschedule first so
-- re-running the migration is safe.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-automations') then
    perform cron.unschedule('send-automations');
  end if;
end;
$$;

select cron.schedule(
  'send-automations',
  '* * * * *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'project_url'
    ) || '/functions/v1/send-automations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'escalation_cron_token'
      )
    ),
    body := '{}'::jsonb
  )
  where exists (
    select 1
    from public.automation_runs
    where (status = 'pending' and due_at <= now())
       or (status = 'sending' and claimed_at < now() - interval '10 minutes')
  );
  $cron$
);
