-- ============================================================
-- Subscription events applied in the order they happened.
--
-- RevenueCat retries a delivery that failed, so a user's events can arrive
-- out of order: a trial's CANCELLATION before the INITIAL_PURCHASE that
-- started it. Applied as they arrived, the purchase then dropped the
-- waiting "trial cancelled" message, scheduled the welcome the cancellation
-- had already ruled out, and put the user's plan back to trial.
--
-- So the revenuecat-webhook function now records each event it acts on,
-- with when it happened, and applies it through record_subscription_event
-- below, in one transaction:
--
-- - its plan stands only if no later event has set one;
-- - it drops only the waiting messages that earlier events scheduled,
--   including one send-automations has picked up but not yet sent;
-- - it schedules nothing that a later event has already undone.
--
-- Events are kept 30 days, far longer than RevenueCat keeps retrying.
-- ============================================================

-- ---------- events ----------
create table public.subscription_events (
  app_id uuid not null references public.apps (id),
  -- RevenueCat's event id, so a delivery it repeats is applied once.
  event_id text not null,
  type text not null,
  -- The user's app user id, original id and aliases, as the event gave them.
  revenuecat_ids text[] not null,
  event_at timestamptz not null,
  -- The plan the event leaves them on, if it bears on that.
  plan public.user_plan,
  -- The automations whose waiting messages it makes wrong to send.
  undoes public.automation_event[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (app_id, event_id)
);

create index subscription_events_ids_idx
  on public.subscription_events using gin (revenuecat_ids);
create index subscription_events_app_at_idx
  on public.subscription_events (app_id, event_at);

alter table public.subscription_events enable row level security;
-- No policies: only the Edge Functions (service role) use it.
revoke all on public.subscription_events from anon, authenticated;
grant select, insert, delete on public.subscription_events to service_role;

-- ---------- runs ----------
-- When the event a run follows happened, so a later event drops it and an
-- earlier one delivered late doesn't. Runs from before this migration take
-- when they were scheduled, which is within moments of it.
alter table public.automation_runs add column source_event_at timestamptz;
update public.automation_runs set source_event_at = created_at;
alter table public.automation_runs alter column source_event_at set not null;
-- Only for the webhook as it was, between pushing this and deploying the
-- new one; record_subscription_event always sets it.
alter table public.automation_runs alter column source_event_at set default now();

-- A run being sent can be undone too now.
drop index if exists public.automation_runs_user_idx;
create index automation_runs_user_idx
  on public.automation_runs (app_id, revenuecat_id)
  where status in ('pending', 'sending');

-- ---------- applying an event ----------
-- p_trigger is the automation the event schedules, or null for none (the
-- webhook also passes null for an event too old to send anything for).
create or replace function public.record_subscription_event(
  p_app_id uuid,
  p_event_id text,
  p_event_type text,
  p_revenuecat_ids text[],
  p_event_at timestamptz,
  p_plan public.user_plan,
  p_undoes public.automation_event[],
  p_trigger public.automation_event
)
returns table (
  o_duplicate boolean,
  o_updated integer,
  o_skipped integer,
  o_scheduled boolean,
  o_due_at timestamptz,
  o_note text
)
language plpgsql
set search_path = public
as $$
declare
  v_updated integer := 0;
  v_skipped integer := 0;
  v_automation public.automations;
  v_revenuecat_id text;
  v_due_at timestamptz;
begin
  -- One event at a time per app, so two arriving together still see each
  -- other. It is held for a few milliseconds.
  perform pg_advisory_xact_lock(
    hashtextextended('subscription_events:' || p_app_id::text, 0)
  );

  -- Kept bounded here rather than by a job of its own.
  delete from subscription_events
  where app_id = p_app_id and event_at < now() - interval '30 days';

  insert into subscription_events (
    app_id, event_id, type, revenuecat_ids, event_at, plan, undoes
  )
  values (
    p_app_id, p_event_id, p_event_type, p_revenuecat_ids, p_event_at, p_plan,
    coalesce(p_undoes, '{}')
  )
  on conflict (app_id, event_id) do nothing;
  if not found then
    -- Applied already; everything it did committed with the record.
    return query select true, 0, 0, false, null::timestamptz, 'Already applied'::text;
    return;
  end if;

  -- The plan, unless a later event set it.
  if p_plan is not null and not exists (
    select 1
    from subscription_events e
    where e.app_id = p_app_id
      and e.revenuecat_ids && p_revenuecat_ids
      and e.plan is not null
      and e.event_at > p_event_at
  ) then
    update app_users
    set plan = p_plan
    where app_id = p_app_id and revenuecat_id = any(p_revenuecat_ids);
    get diagnostics v_updated = row_count;
  end if;

  -- Waiting messages it undoes, from events up to it. One send-automations
  -- has claimed goes too: send_automation_run sends only a run still being
  -- sent, and its row lock orders the two.
  if cardinality(p_undoes) > 0 then
    update automation_runs
    set status = 'skipped',
        note = 'Undone by ' || p_event_type,
        processed_at = now()
    where app_id = p_app_id
      and revenuecat_id = any(p_revenuecat_ids)
      and status in ('pending', 'sending')
      and event = any(p_undoes)
      and source_event_at <= p_event_at;
    get diagnostics v_skipped = row_count;
  end if;

  if p_trigger is null then
    return query select false, v_updated, v_skipped, false, null::timestamptz, null::text;
    return;
  end if;

  -- Ruled out already by something that happened after it.
  if exists (
    select 1
    from subscription_events e
    where e.app_id = p_app_id
      and e.revenuecat_ids && p_revenuecat_ids
      and e.event_at > p_event_at
      and p_trigger = any(e.undoes)
  ) then
    return query select false, v_updated, v_skipped, false, null::timestamptz,
      'Undone by a later event'::text;
    return;
  end if;

  select * into v_automation
  from automations
  where app_id = p_app_id and event = p_trigger and enabled;
  if not found then
    return query select false, v_updated, v_skipped, false, null::timestamptz, null::text;
    return;
  end if;

  -- The id the SDK knows them by when they're in the directory; otherwise
  -- RevenueCat's current one, which the SDK is meant to pass.
  select revenuecat_id into v_revenuecat_id
  from app_users
  where app_id = p_app_id and revenuecat_id = any(p_revenuecat_ids)
  limit 1;

  -- From when it happened, not when it arrived: a retried delivery still
  -- goes out on time, or at once if that has passed.
  v_due_at := greatest(
    now(),
    least(p_event_at, now()) + make_interval(mins => v_automation.delay_minutes)
  );

  insert into automation_runs (
    automation_id, app_id, event, revenuecat_id, source_event_id,
    source_event_at, due_at
  )
  values (
    v_automation.id, p_app_id, p_trigger,
    coalesce(v_revenuecat_id, p_revenuecat_ids[1]), p_event_id, p_event_at,
    v_due_at
  )
  on conflict (automation_id, source_event_id) do nothing;

  return query select false, v_updated, v_skipped, true, v_due_at, null::text;
end;
$$;

revoke execute on function public.record_subscription_event(
  uuid, text, text, text[], timestamptz, public.user_plan,
  public.automation_event[], public.automation_event
) from public, anon, authenticated;
grant execute on function public.record_subscription_event(
  uuid, text, text, text[], timestamptz, public.user_plan,
  public.automation_event[], public.automation_event
) to service_role;
