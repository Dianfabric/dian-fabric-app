-- ═══════════════════════════════════════════════════════════════
-- Soft Scoring v3 — HNSW 인덱스 활용으로 timeout 해결
-- ═══════════════════════════════════════════════════════════════
-- 문제: v2는 14,562개 풀스캔 → 8초 timeout 초과
-- 해결: 1단계로 HNSW 인덱스 활용해 1000개 추림 → 2단계에서 가중치 합산
-- ═══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS search_fabrics_soft(
  vector, vector, vector, text, text, text,
  float, float, float, float, float, float, float, int
);

CREATE OR REPLACE FUNCTION search_fabrics_soft(
  query_global vector(768),
  query_crop vector(768),
  query_lab vector(15),
  query_patterns text DEFAULT NULL,
  query_types text DEFAULT NULL,
  query_colors text DEFAULT NULL,
  weight_global float DEFAULT 0.35,
  weight_crop float DEFAULT 0.25,
  weight_color float DEFAULT 0.40,
  bonus_pattern float DEFAULT 0.15,
  bonus_type float DEFAULT 0.05,
  bonus_color_name float DEFAULT 0.10,
  color_scale float DEFAULT 200.0,
  match_count int DEFAULT 200,
  prefilter_count int DEFAULT 1000
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
  score_color float,
  score_bonus float
)
LANGUAGE sql STABLE
AS $$
  -- STEP 1: HNSW 인덱스로 글로벌 임베딩 기준 1000개 추림 (빠름, 인덱스 활용)
  WITH prefiltered AS (
    SELECT
      f.id, f.name, f.color_code, f.image_url,
      f.fabric_type, f.pattern_detail, f.notes,
      f.usage_types, f.price_per_yard, f.image_width,
      f.embedding_dino, f.embedding_dino_crop, f.lab_clusters
    FROM fabrics f
    WHERE f.embedding_dino IS NOT NULL
      AND f.embedding_dino_crop IS NOT NULL
      AND f.lab_clusters IS NOT NULL
      AND f.image_url IS NOT NULL
    ORDER BY f.embedding_dino <=> query_global   -- HNSW 인덱스 활용
    LIMIT prefilter_count
  ),
  -- STEP 2: 1000개 후보에 대해 가중치 합산 + 사용자 분류 보너스
  scored AS (
    SELECT
      p.id, p.name, p.color_code, p.image_url,
      p.fabric_type, p.pattern_detail, p.notes,
      p.usage_types, p.price_per_yard, p.image_width,

      (1 - (p.embedding_dino <=> query_global)) AS s_global,
      (1 - (p.embedding_dino_crop <=> query_crop)) AS s_crop,
      GREATEST(0, 1 - (p.lab_clusters <-> query_lab) / color_scale) AS s_color,

      CASE
        WHEN query_patterns IS NULL OR query_patterns = '' THEN 0.0
        WHEN EXISTS (
          SELECT 1 FROM unnest(string_to_array(query_patterns, ',')) AS qp
          WHERE p.pattern_detail ILIKE '%' || trim(qp) || '%'
        ) THEN bonus_pattern
        ELSE 0.0
      END AS bonus_p,

      CASE
        WHEN query_types IS NULL OR query_types = '' THEN 0.0
        WHEN EXISTS (
          SELECT 1 FROM unnest(string_to_array(query_types, ',')) AS qt
          WHERE p.fabric_type ILIKE '%' || trim(qt) || '%'
        ) THEN bonus_type
        ELSE 0.0
      END AS bonus_t,

      CASE
        WHEN query_colors IS NULL OR query_colors = '' THEN 0.0
        WHEN EXISTS (
          SELECT 1 FROM unnest(string_to_array(query_colors, ',')) AS qc
          WHERE p.notes ILIKE '%' || trim(qc) || '%'
        ) THEN bonus_color_name
        ELSE 0.0
      END AS bonus_c

    FROM prefiltered p
  )
  SELECT
    id, name, color_code, image_url, fabric_type, pattern_detail, notes,
    usage_types, price_per_yard, image_width,
    weight_global * s_global +
    weight_crop * s_crop +
    weight_color * s_color +
    bonus_p + bonus_t + bonus_c AS similarity,
    s_global AS score_global,
    s_crop AS score_crop,
    s_color AS score_color,
    bonus_p + bonus_t + bonus_c AS score_bonus
  FROM scored
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
