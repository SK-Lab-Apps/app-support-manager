-- ============================================================
-- Rate limiting for the end-user write endpoints.
--
-- Fixed-window counters keyed by an opaque string:
--   sq:<app_id>:<revenuecat_id>   submit-query per user   (5 / hour)
--   pm:<app_id>:<revenuecat_id>   post-message per user   (30 / hour)
--   app:<app_id>                  all writes per app      (500 / hour)
--
-- One row per key, reset in place when the window rolls over — the table
-- stays bounded by the number of distinct active keys, no cleanup job
-- needed. Only the Edge Functions (service role) touch this table; it is
-- invisible to anon AND authenticated (admins have no business here).
-- ============================================================

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);

alter table public.rate_limits enable row level security;
-- No policies for anyone: service role bypasses RLS; everyone else is out.
revoke all on public.rate_limits from anon, authenticated;
grant select, insert, update on public.rate_limits to service_role;

-- Atomic check-and-increment. Returns whether the request is allowed and,
-- when blocked, how long until the window resets.
create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_row public.rate_limits;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update
    set count = case
          when rl.window_start + make_interval(secs => p_window_seconds) <= v_now
          then 1
          else rl.count + 1
        end,
        window_start = case
          when rl.window_start + make_interval(secs => p_window_seconds) <= v_now
          then v_now
          else rl.window_start
        end
  returning * into v_row;

  if v_row.count > p_limit then
    return query select
      false,
      greatest(
        1,
        ceil(extract(epoch from
          v_row.window_start + make_interval(secs => p_window_seconds) - v_now
        ))::integer
      );
  else
    return query select true, 0;
  end if;
end;
$$;

revoke execute on function public.check_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer)
  to service_role;
