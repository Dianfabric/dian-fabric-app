-- 2026-09-17: colour-channel candidate retrieval for the v4 photo search (run after v4-ivfflat.sql).
--
-- Why: plain-weave / solid fabrics exist by the hundreds, so the embedding kNN (top 500 per list) often does not
-- contain the exact fabric even though its similarity is decent (0.78–0.9). When the user (or Gemini) names the
-- colour, we additionally search ONLY among rows whose colour notes contain that name, so the colour decides which
-- rows compete on texture instead of texture alone filling the candidate pool.
create or replace function public.search_fabrics_v4_color(
  q_cls  vector(768),
  q_crop vector(768) default null,
  color_like text default null,       -- e.g. '아이보리' → notes ilike '%아이보리%'
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
      and (color_like is null or f.notes ilike '%' || color_like || '%')
    order by f.emb_v4 <=> q_cls
    limit match_count
  ),
  b as (
    select f.id from public.fabrics f
    where q_crop is not null and f.is_active = true and f.image_url is not null and f.emb_v4_crop is not null
      and (color_like is null or f.notes ilike '%' || color_like || '%')
    order by f.emb_v4_crop <=> q_crop
    limit match_count
  ),
  c as (select id from a union select id from b)
  select f.id, f.name, f.color_code, f.supplier, f.image_url, f.image_path, f.fabric_type, f.pattern_detail, f.notes, f.color_sig,
         1 - (f.emb_v4 <=> q_cls) as s_cls,
         case when q_crop is null or f.emb_v4_crop is null then 0 else 1 - (f.emb_v4_crop <=> q_crop) end as s_crop
  from public.fabrics f join c on c.id = f.id;
$$;

alter function public.search_fabrics_v4_color(vector, vector, text, int) set ivfflat.probes = 40;
alter function public.search_fabrics_v4_color(vector, vector, text, int) set statement_timeout = '25s';
