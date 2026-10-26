-- ============================================================
-- Cancelled plans.
--
-- Someone who turns off auto-renew keeps what they paid for until the
-- period ends, so their app still reports them as trial or pro. RevenueCat
-- says so at once instead: its webhook (the revenuecat-webhook function)
-- marks them trial_cancelled or pro_cancelled, for the team to reach out to
-- by hand. Turning auto-renew back on, renewing or buying again puts them
-- back on trial or pro. Like anyone else, they leave the directory once
-- their app reports them free.
-- ============================================================

alter type public.user_plan add value if not exists 'trial_cancelled';
alter type public.user_plan add value if not exists 'pro_cancelled';
