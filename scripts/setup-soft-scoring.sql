-- ═══════════════════════════════════════════════════════════════
-- Soft Scoring RPC — 가중치 합산으로 후보 추출 (캐스케이드 폐기)
-- ═══════════════════════════════════════════════════════════════
-- 입력: DINOv2 글로벌, DINOv2 크롭, LAB 색 클러스터
-- 출력: 가중치 합산 점수로 정렬된 후보들
-- 가중치: 글로벌 35% + 크롭 25% + 색상 40% (조정 가능)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION search_fabrics_soft(
  query_global vector(768),
  query_crop vector(768),
  query_lab vector(15),
  weight_global float DEFAULT 0.35,
  weight_crop float DEFAULT 0.25,
  weight_color float DEFAULT 0.40,
  color_scale float DEFAULT 200.0,
  match_count int DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  name text,
  color_code text,
  image_url text,
  fabric_type text,
  pattern_detail text,
  notes text,
  usage_types text[],
  price_per_yard numeric,
  image_width int,
  similarity float,
  score_global float,
  score_crop float,
  score_color float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    f.id, f.name, f.color_code, f.image_url,
    f.fabric_type, f.pattern_detail, f.notes,
    f.usage_types, f.price_per_yard,
    f.image_width,
    weight_global * (1 - (f.embedding_dino <=> query_global)) +
    weight_crop * (1 - (f.embedding_dino_crop <=> query_crop)) +
    weight_color * GREATEST(0, 1 - (f.lab_clusters <-> query_lab) / color_scale) AS similarity,
    (1 - (f.embedding_dino <=> query_global)) AS score_global,
    (1 - (f.embedding_dino_crop <=> query_crop)) AS score_crop,
    GREATEST(0, 1 - (f.lab_clusters <-> query_lab) / color_scale) AS score_color
  FROM fabrics f
  WHERE f.embedding_dino IS NOT NULL
    AND f.embedding_dino_crop IS NOT NULL
    AND f.lab_clusters IS NOT NULL
    AND f.image_url IS NOT NULL
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- 사용 예:
-- SELECT * FROM search_fabrics_soft(
--   '[...768개...]'::vector,
--   '[...768개...]'::vector,
--   '[L1,a1,b1,L2,a2,b2,...]'::vector,
--   0.35, 0.25, 0.40,
--   200.0,
--   100
-- );
