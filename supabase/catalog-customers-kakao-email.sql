alter table public.catalog_customers
  alter column email drop not null;

alter table public.catalog_customers
  add column if not exists kakao_email text;

update public.catalog_customers
set
  kakao_email = coalesce(kakao_email, email),
  email = null,
  profile_completed = false
where provider = 'kakao'
  and email is not null
  and (kakao_email is null or lower(email) = lower(kakao_email));

create index if not exists catalog_customers_kakao_email_idx
  on public.catalog_customers (lower(kakao_email));

comment on column public.catalog_customers.email is 'User-entered contact email. Kakao users must type this during profile completion; do not auto-fill from OAuth.';
comment on column public.catalog_customers.kakao_email is 'Original Kakao account email captured from OAuth. Contact email remains editable in email.';
