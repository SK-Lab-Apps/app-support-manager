-- ============================================================
-- Review requests sent first, from the Users tab.
--
-- A review request was a reply: its store button rode on a message in a
-- conversation the user had started. The Users tab can now send one as
-- the opening message of a new conversation, like any message sent from
-- there — translated, out of the inbox until the user replies, and in the
-- Sent log. SDK 0.4+ already renders the button on any admin message of
-- this kind, so nothing changes on the device.
--
-- Those conversations stay out of the inbox, so the Sent log is where
-- their taps show up, and the Users tab knows who has been asked already
-- so a send can leave them out.
-- ============================================================

-- What each send was. Automated sends are always text.
alter table public.broadcasts
  add column kind public.message_kind not null default 'text';

-- ---------- sending ----------
-- As before, with the kind of message every recipient gets. p_kind
-- defaults to text, so a send-outreach deployed before this migration
-- keeps working after it.
drop function public.create_outreach(uuid, uuid, uuid, text, boolean, jsonb);

create function public.create_outreach(
  p_app_id uuid,
  p_sent_by uuid,
  p_template_id uuid,
  p_body text,
  p_send_push boolean,
  p_recipients jsonb,
  p_kind public.message_kind default 'text'
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
  insert into broadcasts (
    app_id, sent_by, template_id, body, send_push, recipient_count, kind
  )
  values (
    p_app_id, p_sent_by, p_template_id, p_body, p_send_push,
    jsonb_array_length(p_recipients), p_kind
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
      translation_status, kind
    )
    select q.id, 'admin', p_sent_by, r.body, r.body_translated, 'en',
      r.translation_status, p_kind
    from q
    join r on r.revenuecat_id = q.revenuecat_id
    returning messages.id, messages.query_id
  )
  select v_broadcast, q.id, q.revenuecat_id, m.id
  from q
  join m on m.query_id = q.id;
end;
$$;

revoke execute on function public.create_outreach(
  uuid, uuid, uuid, text, boolean, jsonb, public.message_kind
) from public, anon, authenticated;
grant execute on function public.create_outreach(
  uuid, uuid, uuid, text, boolean, jsonb, public.message_kind
) to service_role;

-- ---------- the Users tab ----------
-- Each user's platform, which decides the store their button opens, and
-- their latest review request and tap, in any conversation — a reply or a
-- send. The composer uses these to say who'll see the button and to leave
-- out anyone already asked.
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
  rv.review_opened_at
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

-- ---------- the Sent log ----------
-- Each send says what it was, and a review request how many tapped through
-- to the store: conversations with a review request whose button was
-- tapped. A tap, not a review — the stores don't say who reviewed.
create or replace view public.broadcast_summary
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
  b.automation_event,
  b.kind,
  count(q.id) filter (where ro.opened) as review_opened_count
from public.broadcasts b
join public.admins ad on ad.id = b.sent_by
left join public.message_templates t on t.id = b.template_id
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
group by b.id, ad.display_name, t.name;

revoke all on public.broadcast_summary from anon;
grant select on public.broadcast_summary to authenticated;

create or replace view public.broadcast_recipients
with (security_invoker = true) as
select
  q.broadcast_id,
  q.id as query_id,
  q.app_id,
  q.revenuecat_id,
  q.user_name,
  coalesce(rr.last_read_at >= q.created_at, false) as read,
  q.first_user_message_at is not null as replied,
  exists (
    select 1
    from public.messages m
    where m.query_id = q.id
      and m.kind = 'review_request'
      and m.review_opened_at is not null
  ) as review_opened
from public.queries q
left join public.read_receipts rr
  on rr.query_id = q.id and rr.reader = 'user'
where q.broadcast_id is not null;

revoke all on public.broadcast_recipients from anon;
grant select on public.broadcast_recipients to authenticated;
