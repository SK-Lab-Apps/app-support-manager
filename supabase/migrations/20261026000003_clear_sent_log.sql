-- ============================================================
-- Admins can clear an app's Sent log.
--
-- The log is the dashboard's record of sends from the Users tab: what went
-- out, who sent it, and how it landed. Clearing it deletes those records,
-- not what was sent — each recipient's conversation stays in their support
-- chat, and a reply still brings it into the inbox. The conversations just
-- stop pointing at a send.
-- ============================================================

alter table public.queries
  drop constraint queries_broadcast_id_fkey,
  add constraint queries_broadcast_id_fkey
    foreign key (broadcast_id) references public.broadcasts (id) on delete set null;

create policy broadcasts_delete on public.broadcasts
  for delete to authenticated using (public.is_admin());
grant delete on public.broadcasts to authenticated;

-- Every send for the app, in one transaction. SECURITY INVOKER: the
-- broadcasts_delete policy above decides who may. Returns how many were
-- cleared.
create or replace function public.clear_sent_log(p_app_id uuid)
returns integer
language sql
volatile
as $$
  with deleted as (
    delete from public.broadcasts
    where app_id = p_app_id
    returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke execute on function public.clear_sent_log(uuid) from public, anon;
grant execute on function public.clear_sent_log(uuid) to authenticated;
