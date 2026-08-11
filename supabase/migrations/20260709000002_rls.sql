-- ============================================================
-- Row Level Security
--
-- Access model:
--   * Authenticated admins (a row in public.admins matching auth.uid()):
--     full SELECT / INSERT / UPDATE on every table. All admins are equal —
--     there are no roles.
--   * anon: ZERO direct access. End users only ever reach data through the
--     Edge Functions, which validate a per-app API key and then use the
--     service-role key (service role bypasses RLS by design).
--   * Nobody has DELETE — the tables are an immutable audit trail.
-- ============================================================

alter table public.admins enable row level security;
alter table public.apps enable row level security;
alter table public.queries enable row level security;
alter table public.messages enable row level security;
alter table public.read_receipts enable row level security;

-- Defense in depth: revoke the default PostgREST grants from anon so even a
-- future accidentally-permissive policy could not expose data to anon.
revoke all on public.admins from anon;
revoke all on public.apps from anon;
revoke all on public.queries from anon;
revoke all on public.messages from anon;
revoke all on public.read_receipts from anon;

-- True iff the caller is a seeded admin. SECURITY DEFINER so it can read
-- public.admins regardless of the caller's own row visibility.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where id = auth.uid());
$$;

revoke execute on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

-- ---------- admins ----------
-- Intent: admins can see each other (display names on messages/resolutions).
-- anon has no policy at all → RLS denies everything.
create policy admins_select on public.admins
  for select to authenticated using (public.is_admin());
-- Intent: an existing admin may add another admin row (the auth user itself
-- is still created out-of-band; there is no signup flow).
create policy admins_insert on public.admins
  for insert to authenticated with check (public.is_admin());
create policy admins_update on public.admins
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- No DELETE policy: admin rows are never deleted through the API.

-- ---------- apps ----------
-- Intent: only admins manage apps. anon must never read api_key_hash — no
-- anon policy exists, and the raw key is never stored at all.
create policy apps_select on public.apps
  for select to authenticated using (public.is_admin());
create policy apps_insert on public.apps
  for insert to authenticated with check (public.is_admin());
create policy apps_update on public.apps
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- No DELETE policy: apps are permanent once registered.

-- ---------- queries ----------
-- Intent: admins triage every query across all apps. End users reach their
-- own queries exclusively via Edge Functions (service role), never directly.
create policy queries_select on public.queries
  for select to authenticated using (public.is_admin());
create policy queries_insert on public.queries
  for insert to authenticated with check (public.is_admin());
-- UPDATE is how admins resolve/reopen (status, resolved_at, resolved_by).
create policy queries_update on public.queries
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- No DELETE policy: queries are an immutable audit trail.

-- ---------- messages ----------
-- Intent: admins read full threads and post replies. User messages are only
-- inserted by the submit-query / post-message functions (service role), which
-- enforce the 10–300 char limit on top of the table CHECK constraint.
create policy messages_select on public.messages
  for select to authenticated using (public.is_admin());
create policy messages_insert on public.messages
  for insert to authenticated with check (public.is_admin());
create policy messages_update on public.messages
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- No DELETE policy: messages are never deleted or redacted.

-- ---------- read_receipts ----------
-- Intent: the dashboard upserts the admin-side receipt when a thread is
-- opened. The user-side receipt is written only by the mark-read function
-- (service role). anon: no policy → no access.
create policy read_receipts_select on public.read_receipts
  for select to authenticated using (public.is_admin());
create policy read_receipts_insert on public.read_receipts
  for insert to authenticated with check (public.is_admin());
create policy read_receipts_update on public.read_receipts
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- No DELETE policy.
