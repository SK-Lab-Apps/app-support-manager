-- ============================================================
-- Narrow what an admin may write to messages.
--
-- The original policies only asked "is the caller an admin?", so any admin
-- could post a message attributed to another admin, post one as the end
-- user, or rewrite any message after the fact — none of which the dashboard
-- ever does, and all of which undercut the audit trail.
--
-- What the dashboard actually does is one insert: a reply, as the signed-in
-- admin, in English, with no translation yet. That is now the only write
-- the authenticated role can make. User messages and every update
-- (translations, re-translation after a language change) already go
-- through the Edge Functions as service_role, which bypasses RLS and is
-- unaffected.
-- ============================================================

drop policy messages_insert on public.messages;

-- The translation is left to translate-message, so the text the end user
-- reads is always derived from the English an admin can see in the thread.
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    public.is_admin()
    and sender = 'admin'
    and admin_id = auth.uid()
    and body_translated is null
    and translation_status in ('pending', 'skipped')
    and translation_attempts = 0
  );

-- No UPDATE path for admins at all: messages are immutable from the API.
drop policy messages_update on public.messages;
revoke update on public.messages from authenticated;
