-- ============================================================
-- One request type for the single support chat.
--
-- SDK 0.4 replaces the feedback / feature request / bug report picker with
-- one continuous chat; conversations it starts are typed 'support'. The
-- three original types stay: SDKs already in the App Store keep sending
-- them, and every existing conversation carries one.
--
-- On its own because a value added with ALTER TYPE can't be used in the
-- transaction that adds it, and the next migration uses it.
-- ============================================================

alter type public.query_type add value if not exists 'support';
