-- ============================================================
-- Schema: admins, apps, queries, messages, read_receipts
-- ============================================================

create extension if not exists citext;
create extension if not exists pgcrypto;

create type public.query_type as enum ('feedback', 'feature_request', 'bug_report');
create type public.query_status as enum ('open', 'resolved');
create type public.message_sender as enum ('user', 'admin');
create type public.receipt_reader as enum ('user', 'admin');

-- Admins are created manually (see README seeding section). There is NO signup flow.
create table public.admins (
  id uuid primary key references auth.users (id) on delete cascade,
  username citext not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.apps (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  -- SHA-256 hex of the API key. The raw key is shown exactly once at creation
  -- and never stored anywhere.
  api_key_hash text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references public.admins (id)
);

create table public.queries (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps (id),
  type public.query_type not null,
  status public.query_status not null default 'open',
  user_name text not null,
  -- End-user identifier from the host app (RevenueCat app user id).
  revenuecat_id text not null,
  is_paid boolean not null default false,
  app_version text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.admins (id),
  constraint resolution_consistent check (
    (status = 'resolved' and resolved_at is not null)
    or (status = 'open' and resolved_at is null and resolved_by is null)
  )
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  query_id uuid not null references public.queries (id),
  sender public.message_sender not null,
  -- Set iff sender = 'admin'.
  admin_id uuid references public.admins (id),
  body text not null,
  created_at timestamptz not null default now(),
  -- Char limits enforced at the database level in addition to client + edge function.
  constraint body_length check (
    (sender = 'user' and char_length(body) between 10 and 300)
    or (sender = 'admin' and char_length(body) between 1 and 1000)
  ),
  constraint admin_id_consistent check (
    (sender = 'admin' and admin_id is not null)
    or (sender = 'user' and admin_id is null)
  )
);

-- Powers unread badges on both sides.
create table public.read_receipts (
  query_id uuid not null references public.queries (id),
  reader public.receipt_reader not null,
  last_read_at timestamptz not null default now(),
  primary key (query_id, reader)
);

create index queries_app_id_status_idx on public.queries (app_id, status);
create index queries_revenuecat_id_idx on public.queries (revenuecat_id);
create index messages_query_id_created_at_idx on public.messages (query_id, created_at);

-- Realtime: the admin dashboard subscribes to new queries/messages.
alter publication supabase_realtime add table public.queries;
alter publication supabase_realtime add table public.messages;
