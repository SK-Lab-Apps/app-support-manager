-- ============================================================
-- Multilingual support.
--
-- End users write in the language they picked in the SDK; admins read and
-- write English. Every message therefore carries two renderings:
--
--                    body                 body_translated
--   user message     the user's language  English         (shown to admins)
--   admin message    English              the user's language (shown in the SDK)
--
-- `body` is always what the sender actually typed, so nothing is lost and the
-- original is one toggle away on both sides.
--
-- Translation never blocks a send. The row is inserted with
-- translation_status = 'pending' and filled in moments later by the
-- translate-message function; a message whose translation is still in flight
-- (or failed outright) still displays, untranslated, with a badge. An outage
-- at the translation provider must degrade support, never stop it.
-- ============================================================

create type public.translation_status as enum (
  -- Author and reader already share a language — there is nothing to do.
  'skipped',
  'pending',
  'done',
  'failed'
);

-- ---------- language preference ----------
-- One row per (app, end user), the same shape as push_subscriptions. Kept
-- server-side rather than on the device so it survives a reinstall, follows
-- the user across devices, and lets admin replies be translated with no
-- device involved.
create table public.user_locales (
  app_id uuid not null references public.apps (id),
  revenuecat_id text not null,
  -- ISO 639-1, optionally region-qualified. The SDK only ever sends a code
  -- from its own picker; the CHECK is here to keep junk out of the prompts
  -- built from this column.
  language text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (app_id, revenuecat_id),
  constraint language_code_shape check (language ~ '^[a-z]{2}(-[A-Z]{2})?$')
);

alter table public.user_locales enable row level security;

-- Intent: admins read the preference to show which language a thread is in.
-- Writes come only from the set-language / submit-query / post-message edge
-- functions (service role). anon has no policy and no grant → no access.
revoke all on public.user_locales from anon;
create policy user_locales_select on public.user_locales
  for select to authenticated using (public.is_admin());

grant select on public.user_locales to authenticated;
grant select, insert, update on public.user_locales to service_role;

-- ---------- message renderings ----------
alter table public.messages
  -- ISO 639-1 of `body`, as detected at translation time.
  add column body_language text,
  -- Deliberately unconstrained in length: a 300-character message can
  -- translate to more than 300 characters, and the limit in the body_length
  -- CHECK is about what a user may type, not about what a translation costs.
  add column body_translated text,
  add column translation_status public.translation_status not null default 'skipped',
  -- Bounded retries: a message that fails repeatedly (unsupported content,
  -- a persistently rejected request) must stop costing API calls.
  add column translation_attempts smallint not null default 0;

-- Everything written before this migration was English on both sides.
update public.messages set body_language = 'en' where body_language is null;

-- The sweep only ever looks at unfinished work, so index just those rows.
create index messages_translation_pending_idx
  on public.messages (created_at)
  where translation_status in ('pending', 'failed');

-- ---------- dashboard read model ----------
-- Rebuilt rather than replaced: the view gains a column and search_queries
-- returns `setof query_list`, so the two are dropped and recreated together.
drop function if exists public.search_queries(uuid, text);
drop view if exists public.query_list;

create view public.query_list
with (security_invoker = true) as
select
  q.id,
  q.app_id,
  ap.name as app_name,
  q.type,
  q.status,
  q.user_name,
  q.revenuecat_id,
  q.is_paid,
  q.app_version,
  q.created_at,
  q.resolved_at,
  q.resolved_by,
  ra.display_name as resolved_by_name,
  -- English rendering: this list is read by admins. Falls back to the
  -- original while the translation is in flight, so a row never reads as
  -- empty just because it is a second old.
  coalesce(fm.body_translated, fm.body) as excerpt,
  (select count(*) from public.messages m where m.query_id = q.id) as message_count,
  coalesce(
    (select max(m.created_at) from public.messages m where m.query_id = q.id),
    q.created_at
  ) as last_activity_at,
  -- Unread for the admin side: any user message newer than the admin receipt.
  exists (
    select 1
    from public.messages m
    where m.query_id = q.id
      and m.sender = 'user'
      and m.created_at > coalesce(
        (select rr.last_read_at
         from public.read_receipts rr
         where rr.query_id = q.id and rr.reader = 'admin'),
        'epoch'::timestamptz
      )
  ) as unread_for_admin,
  -- Null when the user has not picked a language yet (threads created before
  -- this migration, or a user who dismissed the picker).
  ul.language as user_language
from public.queries q
join public.apps ap on ap.id = q.app_id
left join public.admins ra on ra.id = q.resolved_by
left join public.user_locales ul
  on ul.app_id = q.app_id and ul.revenuecat_id = q.revenuecat_id
left join lateral (
  select body, body_translated
  from public.messages m
  where m.query_id = q.id
  order by m.created_at asc
  limit 1
) fm on true;

revoke all on public.query_list from anon;
grant select on public.query_list to authenticated, service_role;

-- Search across user names and every message body in the thread, in either
-- rendering — an admin searching English words must find a thread that was
-- written in German.
-- SECURITY INVOKER (default): runs under the admin's JWT, RLS applies.
create or replace function public.search_queries(p_app_id uuid, p_term text)
returns setof public.query_list
language sql
stable
as $$
  select ql.*
  from public.query_list ql
  where (p_app_id is null or ql.app_id = p_app_id)
    and (
      ql.user_name ilike '%' || p_term || '%'
      or exists (
        select 1 from public.messages m
        where m.query_id = ql.id
          and (
            m.body ilike '%' || p_term || '%'
            or m.body_translated ilike '%' || p_term || '%'
          )
      )
    );
$$;

revoke execute on function public.search_queries(uuid, text) from anon;
grant execute on function public.search_queries(uuid, text) to authenticated;

-- ---------- escalation emails ----------
-- Same detection query as migration 0008, but the body it hands to the email
-- is the English rendering, and the original language rides along so the
-- email can say which one it was. Dropped and recreated because the return
-- type changes.
drop function if exists public.overdue_unread_messages(interval);

create function public.overdue_unread_messages(
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
  body_language text,
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
    coalesce(m.body_translated, m.body),
    coalesce(m.body_language, 'en'),
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

-- ---------- translation sweep ----------
-- The inline path (EdgeRuntime.waitUntil in submit-query / post-message, and
-- the dashboard's call after an admin reply) covers the normal case. This is
-- the backstop for the abnormal one: a function instance torn down mid-flight,
-- a provider blip, a dashboard tab closed before its call went out.
--
-- pg_cron and pg_net are already installed by migration 0008, and this reuses
-- that migration's `escalation_cron_token` vault secret rather than adding a
-- second one — both jobs are the same trust level (machine-to-machine, no
-- user data in the request).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'retry-translations') then
    perform cron.unschedule('retry-translations');
  end if;
end;
$$;

select cron.schedule(
  'retry-translations',
  '* * * * *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'project_url'
    ) || '/functions/v1/translate-message',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'escalation_cron_token'
      )
    ),
    body := '{"mode":"sweep"}'::jsonb
  );
  $cron$
);
