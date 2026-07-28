-- Catalog-only auth/customer schema for catalog.diantex.kr
-- Keep separate from swatch/commerce tables such as unique_customers and unique_orders.

create table if not exists public.catalog_customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text not null,
  kakao_email text,
  name text,
  phone text,
  company_name text,
  position text,
  favorite_fabrics text,
  provider text not null default 'email',
  profile_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_customers_provider_check check (provider in ('email', 'kakao'))
);

create index if not exists catalog_customers_email_idx
  on public.catalog_customers (lower(email));

create index if not exists catalog_customers_kakao_email_idx
  on public.catalog_customers (lower(kakao_email));

create index if not exists catalog_customers_created_at_idx
  on public.catalog_customers (created_at desc);

create or replace function public.set_catalog_customers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_catalog_customers_updated_at on public.catalog_customers;
create trigger set_catalog_customers_updated_at
before update on public.catalog_customers
for each row
execute function public.set_catalog_customers_updated_at();

alter table public.catalog_customers enable row level security;

drop policy if exists "catalog customers can select own row" on public.catalog_customers;
create policy "catalog customers can select own row"
  on public.catalog_customers
  for select
  using (auth.uid() = auth_user_id);

drop policy if exists "catalog customers can insert own row" on public.catalog_customers;
create policy "catalog customers can insert own row"
  on public.catalog_customers
  for insert
  with check (auth.uid() = auth_user_id);

drop policy if exists "catalog customers can update own row" on public.catalog_customers;
create policy "catalog customers can update own row"
  on public.catalog_customers
  for update
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

comment on table public.catalog_customers is 'Customer profiles for catalog.diantex.kr only. Do not use for swatch.diantex.kr orders.';
comment on column public.catalog_customers.favorite_fabrics is 'Free-text fabrics or categories the customer often uses.';
