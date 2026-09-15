-- v4 photo search: server-side DINOv2 (fp16) embeddings + deterministic LAB colour signature.
-- Run in the Supabase SQL editor AFTER the offline experiment results are approved (2026-09-15 report).
-- Columns are additive; legacy embedding / embedding_dino / embedding_dino_crop / notes stay untouched
-- so the old routes keep working until v4 is switched on.
--
-- Chosen representation (scripts/exp/results-golden.md + results-synth.md):
--   score = 0.45 * cos(emb_v4)        full image, CLS token            (best on catalogue->catalogue)
--         + 0.35 * cos(emb_v4_crop)   centre 50 % crop, patch-token mean (best on phone-photo->catalogue)
--         + 0.20 * LAB colour signature similarity (raw, no white balance — grey-world WB hurt both sets)

create extension if not exists vector;

alter table public.fabrics
  add column if not exists emb_v4      vector(768),   -- full image, CLS (fp16 server pipeline, sharp 448 cover -> HF processor)
  add column if not exists emb_v4_crop vector(768),   -- centre 50 % crop, mean of patch tokens
  add column if not exists color_sig   jsonb,         -- { raw:[{lab:[L,a,b],pct}], wb:[...] } centre 60 %, seeded k-means k=4
  add column if not exists emb_v4_meta jsonb;         -- { dtype:'fp16', model:'Xenova/dinov2-base', at:'2026-09-..', work:448 }

-- HNSW indexes (cosine). ~16.7k rows build in well under a minute.
create index if not exists fabrics_emb_v4_hnsw      on public.fabrics using hnsw (emb_v4 vector_cosine_ops);
create index if not exists fabrics_emb_v4_crop_hnsw on public.fabrics using hnsw (emb_v4_crop vector_cosine_ops);

-- kNN candidate retrieval for v4. `which` picks the column; no colour / pattern hard filter here:
-- colour and pattern are applied later as soft scores / bonuses in the API route.
create or replace function public.search_fabrics_v4(
  query_embedding vector(768),
  which text default 'cls',          -- 'cls' (emb_v4) | 'crop' (emb_v4_crop)
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
  emb_v4 vector(768),
  emb_v4_crop vector(768),
  similarity float
)
language sql stable
as $$
  select f.id, f.name, f.color_code, f.supplier, f.image_url, f.image_path, f.fabric_type, f.pattern_detail, f.notes, f.color_sig,
         f.emb_v4, f.emb_v4_crop,
         case which when 'crop' then 1 - (f.emb_v4_crop <=> query_embedding)
                    else             1 - (f.emb_v4      <=> query_embedding) end as similarity
  from public.fabrics f
  where f.is_active = true
    and f.image_url is not null
    and (case which when 'crop' then f.emb_v4_crop else f.emb_v4 end) is not null
  order by (case which when 'crop' then f.emb_v4_crop <=> query_embedding
                       else             f.emb_v4      <=> query_embedding end)
  limit match_count;
$$;

-- Progress helper for the regeneration script.
create or replace function public.count_missing_v4()
returns bigint language sql stable as $$
  select count(*) from public.fabrics where image_url is not null and emb_v4 is null;
$$;
