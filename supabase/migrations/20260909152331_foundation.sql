-- Phase 0: empty, fail-closed foundation. No real owner or fiscal rules seeded.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table private.owner_access (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id),
  enabled boolean not null default false
);
alter table private.owner_access enable row level security;
revoke all on private.owner_access from public, anon, authenticated;

-- Only the operator may provision an independently verified Google identity.
-- Membership alone is NOT the completed Google/session authorization layer.
create function private.is_owner() returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from private.owner_access a
    where a.user_id = auth.uid() and a.enabled
  );
$$;
revoke all on function private.is_owner() from public, anon;
grant execute on function private.is_owner() to authenticated;

create table public.administrations (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null unique default true check (singleton),
  owner_id uuid not null references auth.users(id),
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  currency text not null default 'EUR' check (currency = 'EUR'),
  created_at timestamptz not null default now()
);

create table public.fiscal_sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  rule_key text not null check (length(rule_key) between 1 and 100),
  tax_year integer not null check (tax_year between 2000 and 2200),
  version integer not null check (version > 0),
  source_url text not null check (source_url ~ '^https://'),
  publication_date date,
  retrieved_at timestamptz,
  effective_from date not null,
  effective_until date not null,
  evidence_sha256 text check (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  review_status text not null default 'pending' check (review_status in ('pending','verified','approved','rejected')),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  -- No executable tax parameters in this migration.
  unique (rule_key, tax_year, version),
  check (effective_until >= effective_from),
  check (extract(year from effective_from) = tax_year and extract(year from effective_until) = tax_year),
  check (review_status <> 'approved' or (approved_at is not null and approved_by is not null and retrieved_at is not null and evidence_sha256 is not null))
);

alter table public.administrations enable row level security;
alter table public.fiscal_sources enable row level security;
revoke all on public.administrations, public.fiscal_sources from public, anon, authenticated;
grant select on public.administrations, public.fiscal_sources to authenticated;
create policy owner_read on public.administrations for select to authenticated
  using ((select private.is_owner()) and owner_id = (select auth.uid()));
create policy owner_read on public.fiscal_sources for select to authenticated
  using ((select private.is_owner()) and owner_id = (select auth.uid()));
-- No INSERT/UPDATE/DELETE grants or policies until validated server commands exist.
