-- v4 photo search, RPC v2 (run AFTER v4-search-schema.sql).
-- The v1 RPC returned the raw 768-d vectors for every candidate (≈18 MB per search for 500∪500 rows),
-- which made /api/search-v4 take 15 s+. v2 computes both similarities inside Postgres and returns
-- only scalars + colour signature. The API route and scripts/exp/eval-db.ts use this one.

create or replace function public.search_fabrics_v4_pair(
  q_cls  vector(768),                 -- full-image CLS query vector
  q_crop vector(768) default null,    -- centre-crop patch-mean query vector (optional)
  match_count int default 500         -- top-N per list; result = union of the two lists
)
returns table (
  id uuid,
  name text,
  color_code text,
  supplier text,
  image_url text,
  image_path text,
  fabric_type text,
  pattern_detail text,
  notes text,
  color_sig jsonb,
  s_cls float,
  s_crop float
)
language sql stable
as $$
  with a as (
    select f.id from public.fabrics f
    where f.is_active = true and f.image_url is not null and f.emb_v4 is not null
    order by f.emb_v4 <=> q_cls
    limit match_count
  ),
  b as (
    select f.id from public.fabrics f
    where q_crop is not null and f.is_active = true and f.image_url is not null and f.emb_v4_crop is not null
    order by f.emb_v4_crop <=> q_crop
    limit match_count
  ),
  c as (select id from a union select id from b)
  select f.id, f.name, f.color_code, f.supplier, f.image_url, f.image_path, f.fabric_type, f.pattern_detail, f.notes, f.color_sig,
         1 - (f.emb_v4 <=> q_cls) as s_cls,
         case when q_crop is null or f.emb_v4_crop is null then 0 else 1 - (f.emb_v4_crop <=> q_crop) end as s_crop
  from public.fabrics f
  join c on c.id = f.id;
$$;

-- Let the HNSW index serve up to 500 neighbours per list (default ef_search = 40 would truncate).
alter function public.search_fabrics_v4_pair(vector, vector, int) set hnsw.ef_search = 500;
