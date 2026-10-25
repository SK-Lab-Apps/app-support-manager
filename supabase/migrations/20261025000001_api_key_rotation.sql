-- ============================================================
-- API key rotation.
--
-- An app's key lives in every installed copy of the host app, so replacing
-- it outright would cut off support for everyone until they update. Instead
-- a rotation keeps the outgoing key valid for a grace period chosen by the
-- admin — zero when the key leaked — while the release carrying the new key
-- rolls out.
--
-- Only one previous key is kept. Rotating again during a grace period
-- replaces it, so the key from two rotations ago stops working at once; the
-- dashboard says so before it happens.
-- ============================================================

alter table public.apps
  add column previous_api_key_hash text,
  add column previous_key_expires_at timestamptz,
  add constraint previous_key_consistent check (
    (previous_api_key_hash is null) = (previous_key_expires_at is null)
  );

-- Edge Functions look keys up by either hash.
create unique index apps_previous_api_key_hash_idx
  on public.apps (previous_api_key_hash)
  where previous_api_key_hash is not null;

-- One statement, so the outgoing hash is read and moved atomically — two
-- admins rotating at once can't both demote the same key. SECURITY INVOKER:
-- the apps_update RLS policy (admins only) applies as for any other update.
--
-- Returns one row when the key was rotated and none when nothing was (no
-- such app, or not an admin); a null expiry means the old key is already
-- dead.
create or replace function public.rotate_app_api_key(
  p_app_id uuid,
  p_new_hash text,
  p_grace interval
)
returns table (app_id uuid, previous_key_expires_at timestamptz)
language sql
volatile
as $$
  update public.apps
  set
    previous_api_key_hash = case
      when p_grace > interval '0' then api_key_hash
    end,
    previous_key_expires_at = case
      when p_grace > interval '0' then now() + p_grace
    end,
    api_key_hash = p_new_hash
  where id = p_app_id
  returning id, previous_key_expires_at;
$$;

revoke execute on function public.rotate_app_api_key(uuid, text, interval)
  from public, anon;
grant execute on function public.rotate_app_api_key(uuid, text, interval)
  to authenticated;
