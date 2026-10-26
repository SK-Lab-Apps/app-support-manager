-- ============================================================
-- Admins can delete whole conversations.
--
-- A conversation goes with everything hanging off it — its messages, both
-- read receipts, and any escalation record — so nothing is left pointing at
-- a row that no longer exists. Individual messages are still immutable from
-- the API: there is no DELETE grant or policy on messages, and the cascade
-- below runs as part of the conversation's delete, not as one of the
-- admin's own.
--
-- The user loses the conversation too: their support chat reads from the
-- same rows.
-- ============================================================

alter table public.messages
  drop constraint messages_query_id_fkey,
  add constraint messages_query_id_fkey
    foreign key (query_id) references public.queries (id) on delete cascade;

alter table public.read_receipts
  drop constraint read_receipts_query_id_fkey,
  add constraint read_receipts_query_id_fkey
    foreign key (query_id) references public.queries (id) on delete cascade;

alter table public.message_escalations
  drop constraint message_escalations_message_id_fkey,
  add constraint message_escalations_message_id_fkey
    foreign key (message_id) references public.messages (id) on delete cascade;

create policy queries_delete on public.queries
  for delete to authenticated using (public.is_admin());
grant delete on public.queries to authenticated;

-- Several at once, in one transaction, with the ids in the request body
-- rather than a URL. SECURITY INVOKER: the queries_delete policy above
-- decides who may. Returns how many were deleted.
create or replace function public.delete_conversations(p_query_ids uuid[])
returns integer
language sql
volatile
as $$
  with deleted as (
    delete from public.queries
    where id = any(p_query_ids)
    returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke execute on function public.delete_conversations(uuid[]) from public, anon;
grant execute on function public.delete_conversations(uuid[]) to authenticated;
