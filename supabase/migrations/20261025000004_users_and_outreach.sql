-- ============================================================
-- Support chat, an app-user directory, and messages we start.
--
-- SDK 0.4 shows one continuous chat instead of typed threads, reports each
-- user (with their plan) when it loads, and lets the dashboard message users
-- first, in bulk, from templates. Everything here is additive for the SDKs
-- already in the App Store: their endpoints, payloads and limits are
-- unchanged (see the Edge Functions for how responses stay compatible).
-- ============================================================

-- ---------- chat-length messages ----------
-- A chat has to accept "thanks!" — the 10-character floor made sense for a
-- filed report, not a conversation — and the 300 ceiling is too tight for a
-- bug described in one go. Old SDKs still enforce 10–300 on the device, so
-- they never see the difference.
alter table public.messages drop constraint body_length;
alter table public.messages add constraint body_length check (
  char_length(body) between 1 and 1000
);

-- ---------- app users ----------
-- One row per end user per app: who can be messaged first, and the plan they
-- are on. SDK 0.4+ upserts it on every load (register-user); older SDKs only
-- reach it when they file a query, so those users appear once they write.
create type public.user_plan as enum ('free', 'trial', 'pro');

create table public.app_users (
  app_id uuid not null references public.apps (id),
  revenuecat_id text not null,
  -- Null for users known only from a push registration, which carries no
  -- name. Templates fall back to a neutral greeting for them.
  name text,
  plan public.user_plan not null default 'free',
  app_version text,
  -- Last SDK version this user ran; null until they run 0.4 or later.
  sdk_version text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (app_id, revenuecat_id)
);

create index app_users_app_last_seen_idx
  on public.app_users (app_id, last_seen_at desc);

alter table public.app_users enable row level security;
revoke all on public.app_users from anon;
create policy app_users_select on public.app_users
  for select to authenticated using (public.is_admin());
grant select on public.app_users to authenticated;
grant select, insert, update on public.app_users to service_role;

-- Backfill from everything already known. The latest query carries the
-- freshest name, plan and version; old SDKs only report paid-or-not, which
-- maps to pro-or-free.
with activity as (
  select
    q.app_id,
    q.revenuecat_id,
    min(q.created_at) as first_seen_at,
    greatest(max(q.created_at), max(m.created_at)) as last_seen_at
  from public.queries q
  left join public.messages m on m.query_id = q.id and m.sender = 'user'
  group by q.app_id, q.revenuecat_id
),
latest as (
  select distinct on (q.app_id, q.revenuecat_id)
    q.app_id, q.revenuecat_id, q.user_name, q.is_paid, q.app_version
  from public.queries q
  order by q.app_id, q.revenuecat_id, q.created_at desc
)
insert into public.app_users (
  app_id, revenuecat_id, name, plan, app_version, first_seen_at, last_seen_at
)
select
  l.app_id,
  l.revenuecat_id,
  l.user_name,
  case when l.is_paid then 'pro' else 'free' end::public.user_plan,
  l.app_version,
  a.first_seen_at,
  a.last_seen_at
from latest l
join activity a using (app_id, revenuecat_id);

-- Users who opened support (and so reported push status) but never wrote.
insert into public.app_users (app_id, revenuecat_id, first_seen_at, last_seen_at)
select ps.app_id, ps.revenuecat_id, ps.updated_at, ps.updated_at
from public.push_subscriptions ps
on conflict (app_id, revenuecat_id) do nothing;

-- ---------- message templates ----------
-- Shared across apps: {app} makes one template fit all of them. Unlike the
-- conversation tables these are working documents, not an audit trail, so
-- admins may delete them.
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  body text not null check (char_length(body) between 1 and 1000),
  created_by uuid not null default auth.uid() references public.admins (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.message_templates enable row level security;
revoke all on public.message_templates from anon;
create policy message_templates_select on public.message_templates
  for select to authenticated using (public.is_admin());
create policy message_templates_insert on public.message_templates
  for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());
create policy message_templates_update on public.message_templates
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy message_templates_delete on public.message_templates
  for delete to authenticated using (public.is_admin());
grant select, insert, update, delete on public.message_templates to authenticated;

-- ---------- broadcasts ----------
-- One row per send from the dashboard, to one user or many. Written only by
-- the send-outreach function; each recipient's conversation points back here.
create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps (id),
  sent_by uuid not null references public.admins (id),
  template_id uuid references public.message_templates (id) on delete set null,
  -- As written, placeholders and all; each recipient's copy is rendered
  -- from it.
  body text not null,
  send_push boolean not null,
  recipient_count integer not null,
  created_at timestamptz not null default now()
);

create index broadcasts_app_created_idx
  on public.broadcasts (app_id, created_at desc);

alter table public.broadcasts enable row level security;
revoke all on public.broadcasts from anon;
create policy broadcasts_select on public.broadcasts
  for select to authenticated using (public.is_admin());
grant select on public.broadcasts to authenticated;
grant select, insert on public.broadcasts to service_role;

-- ---------- conversations we start ----------
-- A conversation joins the inbox when the user first writes in it. That is
-- every conversation so far (the user always wrote first), and it keeps a
-- send to 500 users out of the inbox, the open counts and the response-time
-- stats until someone actually answers.
alter table public.queries
  add column initiated_by public.message_sender not null default 'user',
  add column broadcast_id uuid references public.broadcasts (id),
  add column first_user_message_at timestamptz;

update public.queries q
set first_user_message_at = (
  select min(m.created_at)
  from public.messages m
  where m.query_id = q.id and m.sender = 'user'
);

create or replace function public.note_first_user_message()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.queries
  set first_user_message_at = new.created_at
  where id = new.query_id and first_user_message_at is null;
  return null;
end;
$$;

create trigger messages_first_user_message
  after insert on public.messages
  for each row
  when (new.sender = 'user')
  execute function public.note_first_user_message();

create index queries_broadcast_idx on public.queries (broadcast_id)
  where broadcast_id is not null;

-- ---------- dashboard read model ----------
-- Rebuilt together, as in the translations migration: search_queries
-- returns `setof query_list`.
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
  -- The user's first words, in English, so a conversation we started reads
  -- by what they answered rather than by our own opener. Falls back to the
  -- first message, and to the original while a translation is in flight.
  coalesce(fm.body_translated, fm.body) as excerpt,
  (select count(*) from public.messages m where m.query_id = q.id) as message_count,
  coalesce(
    (select max(m.created_at) from public.messages m where m.query_id = q.id),
    q.created_at
  ) as last_activity_at,
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
  ul.language as user_language,
  -- The user's current plan, falling back to what the conversation recorded
  -- for anyone not yet in app_users.
  coalesce(
    au.plan,
    case when q.is_paid then 'pro' else 'free' end::public.user_plan
  ) as plan,
  q.initiated_by,
  q.broadcast_id,
  q.first_user_message_at,
  q.first_user_message_at is not null as in_inbox
from public.queries q
join public.apps ap on ap.id = q.app_id
left join public.admins ra on ra.id = q.resolved_by
left join public.user_locales ul
  on ul.app_id = q.app_id and ul.revenuecat_id = q.revenuecat_id
left join public.app_users au
  on au.app_id = q.app_id and au.revenuecat_id = q.revenuecat_id
left join lateral (
  select body, body_translated
  from public.messages m
  where m.query_id = q.id
  order by (m.sender = 'user') desc, m.created_at asc
  limit 1
) fm on true;

revoke all on public.query_list from anon;
grant select on public.query_list to authenticated, service_role;

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

-- Stats count the inbox only. First response is measured on conversations
-- the user started: in one we started, our message comes first by
-- definition and would read as an instant reply.
create or replace function public.query_stats(p_app_id uuid default null)
returns table (
  open_count bigint,
  resolved_this_week bigint,
  avg_first_response_minutes numeric
)
language sql
stable
as $$
  select
    (select count(*) from public.queries q
      where (p_app_id is null or q.app_id = p_app_id)
        and q.status = 'open'
        and q.first_user_message_at is not null),
    (select count(*) from public.queries q
      where (p_app_id is null or q.app_id = p_app_id)
        and q.status = 'resolved'
        and q.first_user_message_at is not null
        and q.resolved_at >= date_trunc('week', now())),
    (select round(avg(extract(epoch from fr.first_admin_at - q.created_at)) / 60.0, 1)
      from public.queries q
      join lateral (
        select min(m.created_at) as first_admin_at
        from public.messages m
        where m.query_id = q.id and m.sender = 'admin'
      ) fr on fr.first_admin_at is not null
      where (p_app_id is null or q.app_id = p_app_id)
        and q.initiated_by = 'user');
$$;

-- The Users tab: each user with what decides whether and how to reach them.
create view public.app_user_list
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
      and q.first_user_message_at is not null) as conversation_count
from public.app_users au
left join public.user_locales ul
  on ul.app_id = au.app_id and ul.revenuecat_id = au.revenuecat_id
left join public.push_subscriptions ps
  on ps.app_id = au.app_id and ps.revenuecat_id = au.revenuecat_id;

revoke all on public.app_user_list from anon;
grant select on public.app_user_list to authenticated;

-- The Sent tab: each send with how it landed. "Read" is a user read receipt
-- at or after the conversation opened; "replied" is the conversation having
-- joined the inbox.
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
  count(q.id) filter (where q.first_user_message_at is not null) as replied_count
from public.broadcasts b
join public.admins ad on ad.id = b.sent_by
left join public.message_templates t on t.id = b.template_id
left join public.queries q on q.broadcast_id = b.id
left join public.read_receipts rr
  on rr.query_id = q.id and rr.reader = 'user'
group by b.id, ad.display_name, t.name;

revoke all on public.broadcast_summary from anon;
grant select on public.broadcast_summary to authenticated;

-- ---------- sending ----------
-- The send-outreach function renders and translates each recipient's copy,
-- then hands the lot to this function, so the broadcast, every conversation
-- and every first message land in one transaction — a failure halfway
-- through can't leave empty conversations on users' phones.
--
-- p_recipients: [{ revenuecat_id, user_name, is_paid, app_version, body,
-- body_translated, translation_status }], one entry per user.
create or replace function public.create_outreach(
  p_app_id uuid,
  p_sent_by uuid,
  p_template_id uuid,
  p_body text,
  p_send_push boolean,
  p_recipients jsonb
)
returns table (
  o_broadcast_id uuid,
  o_query_id uuid,
  o_revenuecat_id text,
  o_message_id uuid
)
language plpgsql
set search_path = public
as $$
declare
  v_broadcast uuid;
begin
  insert into broadcasts (app_id, sent_by, template_id, body, send_push, recipient_count)
  values (
    p_app_id, p_sent_by, p_template_id, p_body, p_send_push,
    jsonb_array_length(p_recipients)
  )
  returning id into v_broadcast;

  return query
  with r as (
    select *
    from jsonb_to_recordset(p_recipients) as x (
      revenuecat_id text,
      user_name text,
      is_paid boolean,
      app_version text,
      body text,
      body_translated text,
      translation_status translation_status
    )
  ),
  q as (
    insert into queries (
      app_id, type, user_name, revenuecat_id, is_paid, app_version,
      initiated_by, broadcast_id
    )
    select
      p_app_id, 'support', r.user_name, r.revenuecat_id, r.is_paid,
      r.app_version, 'admin', v_broadcast
    from r
    returning queries.id, queries.revenuecat_id
  ),
  m as (
    insert into messages (
      query_id, sender, admin_id, body, body_translated, body_language,
      translation_status
    )
    select q.id, 'admin', p_sent_by, r.body, r.body_translated, 'en',
      r.translation_status
    from q
    join r on r.revenuecat_id = q.revenuecat_id
    returning messages.id, messages.query_id
  )
  select v_broadcast, q.id, q.revenuecat_id, m.id
  from q
  join m on m.query_id = q.id;
end;
$$;

revoke execute on function public.create_outreach(uuid, uuid, uuid, text, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_outreach(uuid, uuid, uuid, text, boolean, jsonb)
  to service_role;
