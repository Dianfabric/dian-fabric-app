-- 2026-09-16: third and last schema step for v4 search. Run after v4-drop-hnsw-and-rpc-v2.sql.
--
-- Why: with no index the exact scan reads every emb_v4 / emb_v4_crop vector (~100 MB) on each search.
-- Warm it takes ~0.7 s, but cold (after a few idle minutes, or while the regeneration writes) it takes 8 s+
-- and hits PostgREST's statement timeout → /api/search-v4 returns 500.
-- IVFFlat is the middle ground: inserts are cheap (append to one list — unlike HNSW graph inserts, which
-- took the instance down twice), and a query with probes = 20 reads ~20 % of the vectors.
-- Recall vs exact at probes 20 / lists 100 is ~97 %+, which is fine for a 500-candidate first stage.

set maintenance_work_mem = '128MB';

create index if not exists fabrics_emb_v4_ivf      on public.fabrics using ivfflat (emb_v4 vector_cosine_ops)      with (lists = 100);
create index if not exists fabrics_emb_v4_crop_ivf on public.fabrics using ivfflat (emb_v4_crop vector_cosine_ops) with (lists = 100);

-- probe 20 of 100 lists inside the RPC, and give it a longer timeout than the API default as a safety net
alter function public.search_fabrics_v4_pair(vector, vector, int) set ivfflat.probes = 20;
alter function public.search_fabrics_v4_pair(vector, vector, int) set statement_timeout = '25s';

analyze public.fabrics;
