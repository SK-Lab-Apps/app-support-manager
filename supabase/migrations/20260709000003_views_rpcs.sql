-- ============================================================
-- Dashboard read model: query list view, search, stats,
-- and the username → email lookup used by the login page.
-- ============================================================

-- security_invoker: the view runs with the caller's RLS, so anon still sees
-- nothing through it.
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
  fm.body as excerpt,
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
  ) as unread_for_admin
from public.queries q
join public.apps ap on ap.id = q.app_id
left join public.admins ra on ra.id = q.resolved_by
left join lateral (
  select body
  from public.messages m
  where m.query_id = q.id
  order by m.created_at asc
  limit 1
) fm on true;

revoke all on public.query_list from anon;
grant select on public.query_list to authenticated;

-- Search across user names and every message body in the thread.
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
        where m.query_id = ql.id and m.body ilike '%' || p_term || '%'
      )
    );
$$;

revoke execute on function public.search_queries(uuid, text) from anon;
grant execute on function public.search_queries(uuid, text) to authenticated;

-- Stats strip: open count, resolved this week, average first admin response.
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
      where (p_app_id is null or q.app_id = p_app_id) and q.status = 'open'),
    (select count(*) from public.queries q
      where (p_app_id is null or q.app_id = p_app_id)
        and q.status = 'resolved'
        and q.resolved_at >= date_trunc('week', now())),
    (select round(avg(extract(epoch from fr.first_admin_at - q.created_at)) / 60.0, 1)
      from public.queries q
      join lateral (
        select min(m.created_at) as first_admin_at
        from public.messages m
        where m.query_id = q.id and m.sender = 'admin'
      ) fr on fr.first_admin_at is not null
      where (p_app_id is null or q.app_id = p_app_id));
$$;

revoke execute on function public.query_stats(uuid) from anon;
grant execute on function public.query_stats(uuid) to authenticated;

-- Login flow: the login form takes a username; we resolve it to the auth
-- email, then call signInWithPassword. SECURITY DEFINER because anon cannot
-- read admins or auth.users. It leaks nothing beyond "this exact username
-- maps to this email" — usernames are internal, chosen by the team, and the
-- password check still happens in GoTrue (which rate-limits attempts).
create or replace function public.admin_email_for_username(p_username citext)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email
  from public.admins a
  join auth.users u on u.id = a.id
  where a.username = p_username;
$$;

grant execute on function public.admin_email_for_username(citext) to anon, authenticated;
