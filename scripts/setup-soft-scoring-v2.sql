-- ═══════════════════════════════════════════════════════════════
-- Soft Scoring v2 — 사용자 분류 데이터 활용 (보너스 점수)
-- ═══════════════════════════════════════════════════════════════
-- 기본 점수: DINOv2 글로벌 + 크롭 + LAB (자동 추출)
-- 보너스: 사용자가 수동 컨펌한 fabric_type + pattern_detail + 색상명
--
-- 보너스 = 하드 필터 아님 → 캐스케이드 사고 방지
-- 같은 패턴/타입/색이면 점수 ↑ (위로 올라옴), 다르면 그대로
-- ═══════════════════════════════════════════════════════════════

-- 기존 함수 삭제 (시그니처 변경)
DROP FUNCTION IF EXISTS search_fabrics_soft(
  vector, vector, vector, float, float, float, float, int
);

-- 새 함수 (사용자 분류 보너스 포함)
CREATE OR REPLACE FUNCTION search_fabrics_soft(
  query_global vector(768),
  query_crop vector(768),
  query_lab vector(15),
  query_patterns text DEFAULT NULL,     -- 콤마 구분 (예: "부클,헤링본")
  query_types text DEFAULT NULL,        -- 콤마 구분
  query_colors text DEFAULT NULL,       -- 콤마 구분
  weight_global float DEFAULT 0.35,
  weight_crop float DEFAULT 0.25,
  weight_color float DEFAULT 0.40,
  bonus_pattern float DEFAULT 0.15,     -- 패턴 일치 시 +15%p
  bonus_type float DEFAULT 0.05,        -- 타입 일치 시 +5%p
  bonus_color_name float DEFAULT 0.10,  -- 색상명 일치 시 +10%p
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
  score_color float,
  score_bonus float
)
LANGUAGE sql STABLE
AS $$
  WITH scored AS (
    SELECT
      f.id, f.name, f.color_code, f.image_url,
      f.fabric_type, f.pattern_detail, f.notes,
      f.usage_types, f.price_per_yard, f.image_width,

      -- 기본 점수 (자동 추출)
      (1 - (f.embedding_dino <=> query_global)) AS s_global,
      (1 - (f.embedding_dino_crop <=> query_crop)) AS s_crop,
      GREATEST(0, 1 - (f.lab_clusters <-> query_lab) / color_scale) AS s_color,

      -- 패턴 보너스 (다중 패턴 OR 매칭)
      CASE
        WHEN query_patterns IS NULL OR query_patterns = '' THEN 0.0
        WHEN EXISTS (
          SELECT 1 FROM unnest(string_to_array(query_patterns, ',')) AS qp
          WHERE f.pattern_detail ILIKE '%' || trim(qp) || '%'
        ) THEN bonus_pattern
        ELSE 0.0
      END AS bonus_p,

      -- 타입 보너스 (다중 타입 OR 매칭)
      CASE
        WHEN query_types IS NULL OR query_types = '' THEN 0.0
        WHEN EXISTS (
          SELECT 1 FROM unnest(string_to_array(query_types, ',')) AS qt
          WHERE f.fabric_type ILIKE '%' || trim(qt) || '%'
        ) THEN bonus_type
        ELSE 0.0
      END AS bonus_t,

      -- 색상명 보너스 (다중 색상 OR 매칭, notes 필드)
      CASE
        WHEN query_colors IS NULL OR query_colors = '' THEN 0.0
        WHEN EXISTS (
          SELECT 1 FROM unnest(string_to_array(query_colors, ',')) AS qc
          WHERE f.notes ILIKE '%' || trim(qc) || '%'
        ) THEN bonus_color_name
        ELSE 0.0
      END AS bonus_c

    FROM fabrics f
    WHERE f.embedding_dino IS NOT NULL
      AND f.embedding_dino_crop IS NOT NULL
      AND f.lab_clusters IS NOT NULL
      AND f.image_url IS NOT NULL
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

-- 사용 예:
-- SELECT * FROM search_fabrics_soft(
--   '[...768...]'::vector,  -- 글로벌 임베딩
--   '[...768...]'::vector,  -- 크롭 임베딩
--   '[...15...]'::vector,   -- LAB
--   '부클',                  -- 패턴 (Gemini가 추정)
--   '패브릭',                -- 타입
--   '베이지,아이보리',        -- 색상명 (다중)
--   0.35, 0.25, 0.40,       -- 기본 가중치
--   0.15, 0.05, 0.10,       -- 보너스 가중치
--   200.0,
--   100
-- );
