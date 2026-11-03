-- ============================================================
-- Who each send in the Sent log went to.
--
-- The log showed what went out, by whom, and how it landed, but not to
-- whom. Each row now carries the first few recipients' names, and the
-- full list — with who read it and who replied — is one query away.
--
-- A recipient is a conversation the send started, so one an admin has
-- since deleted drops out of both, while recipient_count still says how
-- many it went to.
-- ============================================================

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
  ) as recipient_names
from public.broadcasts b
join public.admins ad on ad.id = b.sent_by
left join public.message_templates t on t.id = b.template_id
left join public.queries q on q.broadcast_id = b.id
left join public.read_receipts rr
  on rr.query_id = q.id and rr.reader = 'user'
group by b.id, ad.display_name, t.name;

revoke all on public.broadcast_summary from anon;
grant select on public.broadcast_summary to authenticated;

-- Everyone a send reached, with how it landed for each — the same "read"
-- and "replied" broadcast_summary counts.
create view public.broadcast_recipients
with (security_invoker = true) as
select
  q.broadcast_id,
  q.id as query_id,
  q.app_id,
  q.revenuecat_id,
  q.user_name,
  coalesce(rr.last_read_at >= q.created_at, false) as read,
  q.first_user_message_at is not null as replied
from public.queries q
left join public.read_receipts rr
  on rr.query_id = q.id and rr.reader = 'user'
where q.broadcast_id is not null;

revoke all on public.broadcast_recipients from anon;
grant select on public.broadcast_recipients to authenticated;
