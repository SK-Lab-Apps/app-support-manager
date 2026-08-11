-- ============================================================
-- Push notification subscriptions.
--
-- One row per (app, end user). The SDK reports the OS permission outcome
-- whenever the support sheet is opened, so the dashboard can show whether a
-- user was ever asked and what they chose. A denied user is a perfectly
-- normal state — nothing else in the product depends on this table.
-- ============================================================

create type public.push_permission_status as enum (
  'undetermined', -- never prompted (or prompt dismissed without a choice)
  'granted',
  'denied'
);

create table public.push_subscriptions (
  app_id uuid not null references public.apps (id),
  revenuecat_id text not null,
  permission_status public.push_permission_status not null default 'undetermined',
  -- Expo push token; only present when permission is granted AND the host
  -- app could mint one (needs a dev/production build, not Expo Go).
  expo_push_token text,
  -- When the OS prompt was last shown. Null = never asked.
  asked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (app_id, revenuecat_id)
);

create index push_subscriptions_token_idx
  on public.push_subscriptions (app_id, revenuecat_id)
  where expo_push_token is not null;

alter table public.push_subscriptions enable row level security;

-- Intent: admins read push status to understand whether a user can be
-- reached. Writes come only from the register-push edge function (service
-- role). anon has no policy and no grant → no access.
revoke all on public.push_subscriptions from anon;
create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated using (public.is_admin());
-- No DELETE policy, consistent with the rest of the schema.

grant select on public.push_subscriptions to authenticated;
grant select, insert, update on public.push_subscriptions to service_role;
