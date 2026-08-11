-- ============================================================
-- Unread-message escalation.
--
-- A user message that no admin has read 5 hours after it was sent gets
-- emailed to every admin. pg_cron ticks every 5 minutes and calls the
-- `escalate-unread` edge function through pg_net; that function does the
-- grouping and the sending.
--
-- Nothing here is environment-specific: the project URL and the shared cron
-- token are read from Supabase Vault at call time, so this migration stays
-- safe to commit. See the README for the one-time vault setup.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------- idempotency ledger ----------
-- One row per message that has been emailed out. Its presence is what makes
-- escalation one-shot: the detection query excludes anything already here.
create table public.message_escalations (
  message_id uuid primary key references public.messages (id),
  escalated_at timestamptz not null default now(),
  recipient_count integer not null
);

alter table public.message_escalations enable row level security;

-- Intent: admins may see that an escalation happened (useful context when
-- triaging). Writes come only from the escalate-unread function (service
-- role). anon has no policy and no grant → no access. No DELETE policy,
-- consistent with the rest of the schema being an immutable audit trail.
revoke all on public.message_escalations from anon;
create policy message_escalations_select on public.message_escalations
  for select to authenticated using (public.is_admin());

grant select on public.message_escalations to authenticated;
grant select, insert on public.message_escalations to service_role;

-- ---------- detection ----------
-- Every user message that is overdue, still unread by admins, in an open
-- thread, and not yet escalated.
--
-- The unread predicate is the same one the query_list view uses: a message is
-- unread when it is newer than the admin-side read receipt (a missing receipt
-- means nothing has ever been read). Because opening a thread in the dashboard
-- upserts that receipt, reading a thread cancels its pending escalations for
-- free.
create or replace function public.overdue_unread_messages(
  p_threshold interval default interval '5 hours'
)
returns table (
  message_id uuid,
  query_id uuid,
  app_id uuid,
  app_name text,
  user_name text,
  query_type public.query_type,
  body text,
  created_at timestamptz,
  is_reply boolean
)
language sql
stable
as $$
  select
    m.id,
    m.query_id,
    q.app_id,
    ap.name,
    q.user_name,
    q.type,
    m.body,
    m.created_at,
    -- True when an admin had already written in this thread before this
    -- message — i.e. the user is replying rather than opening a new query.
    exists (
      select 1
      from public.messages am
      where am.query_id = m.query_id
        and am.sender = 'admin'
        and am.created_at < m.created_at
    )
  from public.messages m
  join public.queries q on q.id = m.query_id
  join public.apps ap on ap.id = q.app_id
  left join public.read_receipts rr
    on rr.query_id = m.query_id and rr.reader = 'admin'
  where m.sender = 'user'
    -- A resolved thread needs no chasing.
    and q.status = 'open'
    and m.created_at <= now() - p_threshold
    and m.created_at > coalesce(rr.last_read_at, 'epoch'::timestamptz)
    and not exists (
      select 1
      from public.message_escalations me
      where me.message_id = m.id
    )
  order by q.id, m.created_at;
$$;

revoke execute on function public.overdue_unread_messages(interval)
  from public, anon, authenticated;
grant execute on function public.overdue_unread_messages(interval)
  to service_role;

-- ---------- recipients ----------
-- Admin email addresses live in auth.users, which PostgREST does not expose.
-- SECURITY DEFINER for the same reason admin_email_for_username is (migration
-- 0003), and executable only by the service role.
create or replace function public.admin_notification_emails()
returns table (display_name text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select a.display_name, u.email::text
  from public.admins a
  join auth.users u on u.id = a.id
  where u.email is not null;
$$;

revoke execute on function public.admin_notification_emails()
  from public, anon, authenticated;
grant execute on function public.admin_notification_emails() to service_role;

-- ---------- schedule ----------
-- Every 5 minutes. A message therefore escalates between 5h00m and 5h05m
-- after it was sent, which is well inside the tolerance for a 5-hour SLA.
--
-- Secrets come from the vault so this statement carries none: create
-- `project_url` and `escalation_cron_token` once per project (see README).
-- Unschedule first so re-running the migration is safe.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'escalate-unread') then
    perform cron.unschedule('escalate-unread');
  end if;
end;
$$;

select cron.schedule(
  'escalate-unread',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'project_url'
    ) || '/functions/v1/escalate-unread',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'escalation_cron_token'
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);
