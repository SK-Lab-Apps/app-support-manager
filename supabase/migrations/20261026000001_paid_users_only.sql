-- ============================================================
-- Keep only paying and trial users in the directory.
--
-- Free users are never messaged first, so a row per free install — written
-- on every launch — is storage with no use. register-user now acknowledges
-- them without writing, and a user whose trial or subscription lapses is
-- removed the next time the SDK reports them.
--
-- Conversations are untouched: a free user can still write to support, and
-- their threads, read receipts and language stay like anyone's. In the
-- dashboard their plan comes from the conversation itself (query_list falls
-- back to queries.is_paid).
-- ============================================================

-- touchAppUser deletes the row when a user turns free.
grant delete on public.app_users to service_role;

-- Push status for free users who never wrote: it came from the SDK's
-- launch-time token refresh, not from support. Anyone who did write keeps
-- theirs, so replies still reach them.
delete from public.push_subscriptions ps
using public.app_users au
where au.app_id = ps.app_id
  and au.revenuecat_id = ps.revenuecat_id
  and au.plan = 'free'
  and not exists (
    select 1
    from public.queries q
    where q.app_id = ps.app_id
      and q.revenuecat_id = ps.revenuecat_id
  );

delete from public.app_users where plan = 'free';

-- register-user's per-user counters for everyone no longer in the
-- directory. Dropping a counter only restarts its window.
delete from public.rate_limits rl
where rl.key like 'ru:%'
  and not exists (
    select 1
    from public.app_users au
    where rl.key = 'ru:' || au.app_id || ':' || au.revenuecat_id
  );

-- The directory can't drift back: every insert names its plan, and it is
-- never free.
alter table public.app_users
  alter column plan drop default,
  add constraint app_users_paid_or_trial check (plan <> 'free');
