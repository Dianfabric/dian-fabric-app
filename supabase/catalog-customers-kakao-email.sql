alter table public.catalog_customers
  add column if not exists kakao_email text;

create index if not exists catalog_customers_kakao_email_idx
  on public.catalog_customers (lower(kakao_email));

comment on column public.catalog_customers.kakao_email is 'Original Kakao account email captured from OAuth. Contact/login email remains editable in email.';
