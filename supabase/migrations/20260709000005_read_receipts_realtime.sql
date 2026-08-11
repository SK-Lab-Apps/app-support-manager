-- The dashboard's thread panel shows whether the end user has seen admin
-- replies ("Seen" marker). The user-side receipt is upserted by the
-- mark-read edge function, so the dashboard needs live updates for it.
alter publication supabase_realtime add table public.read_receipts;
