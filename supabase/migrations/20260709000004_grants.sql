-- ============================================================
-- Explicit table privileges.
--
-- Postgres checks table-level GRANTs before RLS policies run, and hosted
-- projects don't necessarily carry the legacy default privileges that
-- auto-granted API roles access to new tables. Grant explicitly, minimally:
--
--   * authenticated: SELECT/INSERT/UPDATE. Row access is then narrowed by
--     the is_admin() RLS policies — an authenticated non-admin still sees
--     nothing.
--   * service_role: same privileges; used only by the Edge Functions
--     (BYPASSRLS skips row policies but NOT table grants, so these are
--     required).
--   * anon: nothing, ever — matches the RLS posture (no anon policies).
--   * No DELETE for anyone — queries and messages are an immutable audit
--     trail.
-- ============================================================

grant usage on schema public to authenticated, service_role;

grant select, insert, update on table
  public.admins,
  public.apps,
  public.queries,
  public.messages,
  public.read_receipts
to authenticated, service_role;

-- authenticated already has SELECT on the view (migration 0003); the
-- service_role grant is added for completeness.
grant select on table public.query_list to service_role;
