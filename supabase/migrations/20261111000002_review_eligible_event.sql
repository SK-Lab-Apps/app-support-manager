-- ============================================================
-- The "Review eligible" automation event (see the review_eligible
-- migration that follows). On its own: a new enum value can't be used in
-- the transaction that adds it.
-- ============================================================

alter type public.automation_event add value if not exists 'review_eligible';
