-- ============================================================
-- Review requests.
--
-- An admin can send a reply that carries a "Rate on the App Store / Google
-- Play" button. It is an ordinary admin message in every other way — its
-- text is translated and delivered like any reply — so SDKs before 0.4 show
-- the text without the button. Tapping the button opens the store's
-- write-a-review page and is recorded on the message; whether a review was
-- actually written is the store's business and can't be known.
--
-- Apple's guidelines allow linking to the review page but not rewarding
-- reviews; the dashboard says so where the request is written.
-- ============================================================

create type public.message_kind as enum ('text', 'review_request');

alter table public.messages
  add column kind public.message_kind not null default 'text',
  -- When the user first tapped through to the store, as reported by the SDK.
  add column review_opened_at timestamptz,
  add constraint review_request_from_admin check (
    kind = 'text' or sender = 'admin'
  ),
  add constraint review_opened_only_on_requests check (
    review_opened_at is null or kind = 'review_request'
  );

-- Where the button points, per app. Shape checks catch the common mix-ups:
-- a bundle id in the App Store field, a URL in either.
alter table public.apps
  add column app_store_id text,
  add column play_store_package text,
  add constraint app_store_id_shape check (app_store_id ~ '^[0-9]{5,12}$'),
  add constraint play_store_package_shape check (
    play_store_package ~ '^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$'
  );

-- Which store a user would land in. Reported by SDK 0.4+; null for older
-- builds, where the dashboard can't tell and offers whichever is set up.
alter table public.app_users
  add column platform text check (platform in ('ios', 'android'));

-- Admins may send review requests, but the tap receipt is the SDK's to
-- write (through the review-opened function, as service_role).
drop policy messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    public.is_admin()
    and sender = 'admin'
    and admin_id = auth.uid()
    and body_translated is null
    and translation_status in ('pending', 'skipped')
    and translation_attempts = 0
    and review_opened_at is null
  );
