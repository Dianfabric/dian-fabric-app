-- 2026-09-15 evening: run this INSTEAD of v4-search-rpc-v2.sql.
--
-- Why: the two HNSW indexes made every per-row UPDATE during the regeneration a random-IO graph insert.
-- On this Supabase instance that exhausted the disk IO budget / memory twice (DB unreachable for 2 h,
-- production API 500s). With only ~16.7k rows an exact scan (`order by emb_v4 <=> q limit 500`) costs
-- ~50–150 ms, which is fine for the search API, so the indexes are dropped and NOT recreated.
-- (Revisit an index only if the table grows past ~100k rows.)

drop index if exists public.fabrics_emb_v4_hnsw;
drop index if exists public.fabrics_emb_v4_crop_hnsw;

-- RPC v2: both similarities computed in Postgres; returns scalars + colour signature only
-- (the v1 RPC shipped the raw 768-d vectors for 1,000 rows ≈ 18 MB per search).
create or replace function public.search_fabrics_v4_pair(
  q_cls  vector(768),
  q_crop vector(768) default null,
  match_count int default 500
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
