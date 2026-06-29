import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getHiddenFabricIds } from "@/lib/visibility";

export const dynamic = "force-dynamic";

/**
 * 원단 유사도 검색 API
 *
 * 역할 분리:
 *   - 패턴: Gemini가 판단 (patternDetail, fabricType)
 *   - 색상: RGB 수치 비교 (K-means 클러스터)
 *
 * POST: CLIP 임베딩 + RGB 클러스터 + Gemini 패턴 → 검색
 * GET:  전체 원단 목록 (필터/페이지네이션)
 */

// 색상 클러스터 타입
type ColorCluster = { rgb: number[]; pct: number };

// RGB 거리 계산 (0~1, 0이 완전 같음)
function rgbDistance(rgb1: number[], rgb2: number[]): number {
  const dr = rgb1[0] - rgb2[0];
  const dg = rgb1[1] - rgb2[1];
  const db = rgb1[2] - rgb2[2];
  return Math.sqrt(dr * dr + dg * dg + db * db) / 441.67;
}

// notes에서 색상 클러스터 파싱
// 새 형식: "|rgb:R,G,B:PCT;R,G,B:PCT;R,G,B:PCT"
// 구 형식: "|rgb:R,G,B" (하위 호환)
function parseColorClusters(notes: string | null): ColorCluster[] | null {
  if (!notes) return null;
  const rgbPart = notes.match(/\|rgb:([^|]*)/)?.[1];
  if (!rgbPart) return null;

  // 새 형식: "R,G,B:PCT;R,G,B:PCT"
  if (rgbPart.includes(";") || rgbPart.match(/:\d+$/)) {
    const clusters: ColorCluster[] = [];
    for (const seg of rgbPart.split(";")) {
      const m = seg.match(/(\d+),(\d+),(\d+):(\d+)/);
      if (m) {
        clusters.push({
          rgb: [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])],
          pct: parseInt(m[4]),
        });
      }
    }
    return clusters.length > 0 ? clusters : null;
  }

  // 구 형식: "R,G,B"
  const m = rgbPart.match(/(\d+),(\d+),(\d+)/);
  if (!m) return null;
  return [{ rgb: [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])], pct: 100 }];
}

// 색상 분포 유사도 계산 (0~1, 1이 완전 같음)
function colorDistributionSimilarity(query: ColorCluster[], fabric: ColorCluster[]): number {
  let totalScore = 0;

  for (const qc of query) {
    let bestMatch = 0;
    for (const fc of fabric) {
      const dist = rgbDistance(qc.rgb, fc.rgb);
      const colorSim = Math.max(0, 1 - dist * 2.5);
      const pctSim = 1 - Math.abs(qc.pct - fc.pct) / 100;
      const match = colorSim * 0.7 + pctSim * 0.3;
      if (match > bestMatch) bestMatch = match;
    }
    totalScore += bestMatch * (qc.pct / 100);
  }

  return totalScore;
}

// notes에서 색상명 비율 파싱: "그레이:70,아이보리:30|rgb:..." → [{name:"그레이",pct:70},{name:"아이보리",pct:30}]
type ColorName = { name: string; pct: number };
function parseColorNames(notes: string | null): ColorName[] | null {
  if (!notes) return null;
  const colorPart = notes.split("|")[0];
  if (!colorPart || colorPart.startsWith("rgb:")) return null;
  const colors: ColorName[] = [];
  for (const seg of colorPart.split(",")) {
    const m = seg.match(/^(.+):(\d+)$/);
    if (m) colors.push({ name: m[1], pct: parseInt(m[2]) });
  }
  return colors.length > 0 ? colors : null;
}

// 다중 패턴/타입 필터 — Gemini가 "헤링본,스트라이프" 같은 결합 값 반환 시 OR로 분리
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyCategoryFilter(q: any, patternDetail?: string, fabricType?: string) {
  if (patternDetail) {
    const parts = patternDetail.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 1) return q.ilike("pattern_detail", `%${parts[0]}%`);
    if (parts.length > 1) {
      return q.or(parts.map((p) => `pattern_detail.ilike.%${p}%`).join(","));
    }
  } else if (fabricType) {
    const parts = fabricType.split(",").map((t) => t.trim()).filter(Boolean);
    if (parts.length === 1) return q.ilike("fabric_type", `%${parts[0]}%`);
    if (parts.length > 1) {
      return q.or(parts.map((t) => `fabric_type.ilike.%${t}%`).join(","));
    }
  }
  return q;
}

// 색상명 비율 유사도 (0~1, 1이 완전 같음)
// 쿼리에 없는 색상이 원단에 있으면 페널티
function colorNameSimilarity(query: ColorName[], fabric: ColorName[]): number {
  let matchScore = 0;

  // 1. 쿼리 색상과 원단 색상 매칭 점수
  for (const qc of query) {
    const match = fabric.find(fc => fc.name === qc.name);
    if (match) {
      const pctSim = 1 - Math.abs(qc.pct - match.pct) / 100;
      matchScore += pctSim * (qc.pct / 100);
    }
  }

  // 2. 원단에만 있고 쿼리에 없는 색상 → 페널티
  let penalty = 0;
  for (const fc of fabric) {
    const inQuery = query.find(qc => qc.name === fc.name);
    if (!inQuery) {
      penalty += fc.pct / 100; // 없는 색상 비율만큼 감점
    }
  }

  return Math.max(0, matchScore - penalty * 0.8);
}

// RGB 클러스터 기반 색상 필터 (임계값 이상이면 통과)
function passesColorFilter(queryColors: ColorCluster[], fabricNotes: string, threshold = 0.35): boolean {
  const fabricClusters = parseColorClusters(fabricNotes);
  if (!fabricClusters) return false;
  return colorDistributionSimilarity(queryColors, fabricClusters) >= threshold;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { embedding, matchCount = 12, matchThreshold = 0.1, fabricType, patternDetail } = body;
    // Gemini 색상명 비율 (예: [{name:"그레이",pct:70},{name:"아이보리",pct:30}])
    const queryColorNames: ColorName[] | null = body.colorNames || null;
    // RGB 색상 클러스터 (Gemini 대신 색상 담당)
    const rawRGB = body.rgb;
    let queryColors: ColorCluster[] | null = null;
    if (rawRGB) {
      if (Array.isArray(rawRGB) && rawRGB.length > 0 && typeof rawRGB[0] === "object") {
        queryColors = rawRGB as ColorCluster[];
      } else if (Array.isArray(rawRGB) && rawRGB.length === 3 && typeof rawRGB[0] === "number") {
        queryColors = [{ rgb: rawRGB as number[], pct: 100 }];
      }
    }

    // 임베딩 벡터 검증
    if (!embedding || !Array.isArray(embedding)) {
      return NextResponse.json(
        { error: "임베딩 벡터가 필요합니다" },
        { status: 400 }
      );
    }

    if (embedding.length !== 512) {
      return NextResponse.json(
        {
          error: `임베딩 차원 오류: ${embedding.length}차원 (512차원 필요)`,
        },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const vectorString = `[${embedding.join(",")}]`;
    const hiddenIds = await getHiddenFabricIds(supabase);
    const visible = (rows: Record<string, unknown>[]) =>
      rows.filter((r) => !hiddenIds.has(r.id as string));

    // ─── 단계별 검색: 1.Gemini필터 → 2.CLIP텍스처 → 3.RGB+GPT-4o ───
    const dominantColor = body.dominantColor as string | undefined;
    const hasColorNames = queryColorNames && queryColorNames.length > 0;
    const hasPatternFilter = patternDetail || fabricType;
    const hasRGBData = queryColors && queryColors.length > 0;
    const hasTextColor = !!dominantColor && !hasRGBData;

    if (hasColorNames || hasPatternFilter || hasRGBData || hasTextColor) {
      let allCandidates: Record<string, unknown>[] = [];
      const seenIds = new Set<string>();

      const addResults = (data: Record<string, unknown>[] | null) => {
        if (!data) return;
        for (const item of data) {
          const id = item.id as string;
          if (!seenIds.has(id)) {
            seenIds.add(id);
            allCandidates.push(item);
          }
        }
      };

      // ═══ STEP 1: Gemini 색상비율 + 패턴으로 1차 필터 ═══
      if (hasColorNames) {
        // 색상명 비율로 DB 필터 — 쿼리의 주요 색상 포함 원단만
        let q = supabase.from("fabrics").select("*")
          .not("embedding", "is", null).not("image_url", "is", null);

        // 쿼리의 상위 색상으로 필터 (AND 조건)
        for (const cn of queryColorNames) {
          if (cn.pct >= 20) { // 20% 이상 색상만 필터
            q = q.ilike("notes", `%${cn.name}%`);
          }
        }
        // 패턴 필터 (다중 패턴은 OR로 분리)
        q = applyCategoryFilter(q, patternDetail, fabricType);

        const { data } = await q;
        addResults(data);
      } else if (hasPatternFilter) {
        // 색상명 없으면 패턴만 필터 (텍스트 검색 등)
        let q = supabase.from("fabrics").select("*")
          .not("embedding", "is", null).not("image_url", "is", null);
        q = applyCategoryFilter(q, patternDetail, fabricType);
        if (hasTextColor) q = q.ilike("notes", `%${dominantColor}%`);
        const { data } = await q;
        addResults(data);
      } else if (hasTextColor) {
        const { data } = await supabase.from("fabrics").select("*")
          .not("embedding", "is", null).not("image_url", "is", null)
          .ilike("notes", `%${dominantColor}%`);
        addResults(data);
      }

      // 1차 필터 부족하면 CLIP으로 확장
      if (allCandidates.length < matchCount) {
        const { data } = await supabase.rpc("search_fabrics", {
          query_embedding: vectorString,
          match_threshold: matchThreshold,
          match_count: 300,
        });
        addResults(data as Record<string, unknown>[] | null);
      }

      // ═══ STEP 2: 색상명 비율로 정밀 필터 (불일치 제거) ═══
      if (hasColorNames && allCandidates.length > matchCount) {
        const colorScored = allCandidates.map(fabric => {
          const fabricColorNames = parseColorNames((fabric.notes as string) || "");
          const score = fabricColorNames ? colorNameSimilarity(queryColorNames!, fabricColorNames) : 0;
          return { fabric, score };
        });
        colorScored.sort((a, b) => b.score - a.score);
        // 색상 매칭 상위만 유지 (최소 matchCount개)
        allCandidates = colorScored
          .filter(c => c.score > 0.3)
          .slice(0, Math.max(matchCount * 3, 300))
          .map(c => c.fabric);
      }

      if (allCandidates.length > 0) {
        // ═══ STEP 3: CLIP 텍스처 유사도로 100개 추출 ═══
        const queryVec = embedding as number[];

        const scored = allCandidates.map((fabric: Record<string, unknown>) => {
          const embStr = fabric.embedding as string;
          let fabVec: number[];
          try {
            fabVec = typeof embStr === "string" ? JSON.parse(embStr) : embStr as number[];
          } catch {
            return null;
          }
          if (!fabVec || fabVec.length !== 512) return null;

          // CLIP 코사인 유사도 (텍스처 비교)
          let dot = 0, normA = 0, normB = 0;
          for (let i = 0; i < 512; i++) {
            dot += queryVec[i] * fabVec[i];
            normA += queryVec[i] * queryVec[i];
            normB += fabVec[i] * fabVec[i];
          }
          const clipSim = dot / (Math.sqrt(normA) * Math.sqrt(normB));

          // RGB 색상 점수 (톤 세밀 정렬)
          let rgbSim = 0;
          if (queryColors) {
            const fabricClusters = parseColorClusters((fabric.notes as string) || "");
            if (fabricClusters) {
              rgbSim = colorDistributionSimilarity(queryColors, fabricClusters);
            }
          }

          // CLIP 텍스처 60% + RGB 톤 40%
          // (색상은 이미 STEP 1-2에서 필터됨, 여기서는 텍스처+톤만)
          const similarity = clipSim * 0.6 + rgbSim * 0.4;

          const { embedding: _, ...rest } = fabric;
          return { ...rest, similarity, category_match: true };
        }).filter(Boolean) as Record<string, unknown>[];

        scored.sort((a, b) => (b.similarity as number) - (a.similarity as number));

        // → 이 100개가 GPT-4o 랭킹으로 넘어감 (텍스처+패턴 최종 비교)
        const visibleScored = visible(scored);
        return NextResponse.json({
          results: visibleScored.slice(0, matchCount),
          total: visibleScored.length,
          detectedCategory: patternDetail || fabricType || null,
          filteredCount: visibleScored.length,
        });
      }
    }

    // 필터 없거나 필터 결과 0 → 일반 CLIP 검색
    const { data: results, error } = await supabase.rpc("search_fabrics", {
      query_embedding: vectorString,
      match_threshold: matchThreshold,
      match_count: matchCount,
    });

    if (error) {
      console.error("Supabase search error:", error);
      return NextResponse.json(
        { error: "검색 중 오류가 발생했습니다: " + error.message },
        { status: 500 }
      );
    }

    const visibleResults = visible(
      (results || []).map(({ embedding, ...rest }: Record<string, unknown>) => rest)
    );
    return NextResponse.json({
      results: visibleResults.slice(0, matchCount),
      total: visibleResults.length,
      detectedCategory: null,
    });
  } catch (err) {
    console.error("Search API error:", err);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

// 색상명 → 대표 RGB 매핑 (색상 비율 정렬용)
const COLOR_RGB_MAP: Record<string, number[]> = {
  "아이보리": [245, 240, 225],
  "베이지": [210, 180, 140],
  "브라운": [139, 90, 43],
  "그레이": [150, 150, 150],
  "블랙": [30, 30, 30],
  "네이비": [27, 42, 74],
  "블루": [50, 100, 200],
  "그린": [50, 150, 50],
  "레드": [200, 50, 50],
  "핑크": [230, 150, 170],
  "옐로우": [230, 200, 50],
  "오렌지": [230, 130, 50],
  "퍼플": [130, 60, 180],
  "민트": [100, 200, 180],
  "차콜": [70, 70, 70],
};

// 원단의 notes에서 특정 색상의 RGB 유사도 점수 계산
function getColorRelevanceScore(notes: string | null, colorName: string): number {
  if (!notes) return 0;

  // 1. notes에서 색상명 비율 추출 (예: "그린:40,베이지:30")
  const colorPctMatch = notes.match(new RegExp(colorName + ":(\\d+)"));
  const textPct = colorPctMatch ? parseInt(colorPctMatch[1]) : 0;

  // 2. RGB 클러스터에서 해당 색상과의 유사도 계산
  const targetRgb = COLOR_RGB_MAP[colorName];
  if (!targetRgb) return textPct;

  const clusters = parseColorClusters(notes);
  if (!clusters) return textPct;

  let bestMatch = 0;
  for (const c of clusters) {
    const dist = rgbDistance(targetRgb, c.rgb);
    const sim = Math.max(0, 1 - dist * 2) * c.pct;
    if (sim > bestMatch) bestMatch = sim;
  }

  // 텍스트 비율 + RGB 유사도 합산
  return textPct * 0.5 + bestMatch * 0.5;
}

// GET: 전체 원단 목록 (필터/페이지네이션)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const type = searchParams.get("type") || "";
  const subtype = searchParams.get("subtype") || "";
  const usage = searchParams.get("usage") || "";
  // '월커버링' 라벨 → 기존 '벽패널' 데이터로 조회 (라벨↔컬럼 분리)
  const usageCol = usage === "월커버링" ? "벽패널" : usage;
  const color = searchParams.get("color") || "";
  const search = searchParams.get("search") || "";
  const wide = searchParams.get("wide") === "1"; // 대폭만 (width_mm >= 2000 = 200cm)
  const WIDE_MIN_MM = 2000;
  const sort = searchParams.get("sort") || "newest"; // newest | name | price_high | price_low
  // 소재 최소 함량 필터 (%): 0이면 미적용
  const coMin = parseFloat(searchParams.get("co_min") || "0") || 0; // 면
  const liMin = parseFloat(searchParams.get("li_min") || "0") || 0; // 린넨
  const woMin = parseFloat(searchParams.get("wo_min") || "0") || 0; // 울

  // 색상 필터 경로용 JS 정렬 비교자
  const sortCmp = (a: Record<string, unknown>, b: Record<string, unknown>): number => {
    switch (sort) {
      case "name": return String(a.name || "").localeCompare(String(b.name || ""));
      case "price_high": return Number(b.price_per_yard || 0) - Number(a.price_per_yard || 0);
      case "price_low": return Number(a.price_per_yard ?? 1e12) - Number(b.price_per_yard ?? 1e12);
      case "newest":
      default: return new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime();
    }
  };

  const supabase = createServiceClient();

  // 검색어에서 원단명-컬러번호 분리 (MONCLER-24, MONCLER#24, MONCLER 24 등)
  let searchName = "";
  let searchColor = "";
  if (search) {
    const sep = search.match(/^(.+?)[\s\-#]+(.+)$/);
    if (sep) {
      searchName = sep[1].trim();
      searchColor = sep[2].trim();
    }
  }

  const colors = color ? color.split(",").filter(Boolean) : [];

  // ─── 모드 결정: 색상 필터 또는 검색이 있으면 개별모드, 아니면 대표(디자인)모드 ───
  const individualMode = colors.length > 0 || !!search;

  if (!individualMode) {
    // 대표모드: 디자인(name) 단위 그룹핑 RPC
    const subtypeArr = subtype ? subtype.split(",").map((s) => s.trim()).filter(Boolean) : null;
    const { data, error } = await supabase.rpc("list_design_groups", {
      p_type: type || null,
      p_subtypes: subtypeArr && subtypeArr.length ? subtypeArr : null,
      p_usage: usageCol || null,
      p_wide: wide,
      p_search: null,
      p_sort: sort,
      p_limit: limit,
      p_offset: (page - 1) * limit,
      p_co_min: coMin,
      p_li_min: liMin,
      p_wo_min: woMin,
    });
    if (!error) {
      const total = data && data.length ? Number(data[0].total_count) : 0;
      const totalFabrics = data && data.length ? Number(data[0].total_fabric_count) : 0;
      const fabrics = (data || []).map(({ total_count, total_fabric_count, color_count, ...rest }: Record<string, unknown>) => ({
        ...rest,
        color_count: Number(color_count),
      }));
      return NextResponse.json({
        fabrics, total, totalFabrics, page, totalPages: Math.ceil(total / limit), mode: "design",
      });
    }
    // RPC 미생성/오류 시 → 개별모드로 폴백 (아래 로직 실행, 사이트 안 깨짐)
  }

  // 색상 필터 있으면 → 전체 가져와서 RGB 비율순 정렬
  if (colors.length > 0) {
    let query = supabase
      .from("fabrics")
      .select("*")
      .eq("is_active", true)
      .not("image_url", "is", null);

    if (wide) query = query.gte("width_mm", WIDE_MIN_MM);
    if (coMin > 0) query = query.gte("co_percent", coMin);
    if (liMin > 0) query = query.gte("li_percent", liMin);
    if (woMin > 0) query = query.gte("wo_percent", woMin);

    // 모든 선택 색상을 포함하는 원단 필터 (AND 조건)
    for (const c of colors) {
      query = query.ilike("notes", `%${c}%`);
    }

    if (search) {
      if (searchName && searchColor) {
        query = query.ilike("name", `%${searchName}%`).ilike("color_code", `%${searchColor}%`);
      } else {
        query = query.or(`name.ilike.%${search}%,color_code.ilike.%${search}%`);
      }
    }
    if (subtype) {
      const subtypes = subtype.split(",").map(s => s.trim()).filter(Boolean);
      if (subtypes.length === 1) {
        query = query.ilike("pattern_detail", `%${subtypes[0]}%`);
      } else if (subtypes.length > 1) {
        query = query.or(subtypes.map(s => `pattern_detail.ilike.%${s}%`).join(","));
      }
      if (type === "커튼") query = query.eq("is_curtain_eligible", true);
      else if (type && type !== "패턴") query = query.ilike("fabric_type", `%${type}%`);
    } else if (type) {
      if (type === "패턴") query = query.not("pattern_detail", "is", null).neq("pattern_detail", "무지");
      else if (type === "커튼") query = query.eq("is_curtain_eligible", true);
      else query = query.ilike("fabric_type", `%${type}%`);
    }
    if (usageCol) query = query.contains("usage_types", [usageCol]);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 선택한 정렬 우선, 동점 시 색상 일치도
    const sorted = (data || [])
      .map((fabric) => ({
        ...fabric,
        _colorScore: colors.reduce((sum, c) => sum + getColorRelevanceScore(fabric.notes, c), 0),
      }))
      .sort((a, b) => sortCmp(a, b) || b._colorScore - a._colorScore);

    const total = sorted.length;
    const from = (page - 1) * limit;
    const paged = sorted.slice(from, from + limit);

    const fabrics = paged.map(
      ({ embedding, _colorScore, ...rest }: Record<string, unknown>) => rest
    );

    return NextResponse.json({
      fabrics,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      mode: "individual",
    });
  }

  // 검색(색상 없음) → 개별 원단
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("fabrics")
    .select("*", { count: "exact" })
    .eq("is_active", true)
    .not("image_url", "is", null);

  // 정렬 적용
  if (sort === "name") query = query.order("name", { ascending: true });
  else if (sort === "price_high") query = query.order("price_per_yard", { ascending: false, nullsFirst: false });
  else if (sort === "price_low") query = query.order("price_per_yard", { ascending: true, nullsFirst: false });
  else query = query.order("created_at", { ascending: false }); // newest (기본)

  query = query.range(from, to);

  if (wide) query = query.gte("width_mm", WIDE_MIN_MM);

  if (search) {
    if (searchName && searchColor) {
      query = query.ilike("name", `%${searchName}%`).ilike("color_code", `%${searchColor}%`);
    } else {
      query = query.or(`name.ilike.%${search}%,color_code.ilike.%${search}%`);
    }
  }
  if (subtype) {
    const subtypes = subtype.split(",").map(s => s.trim()).filter(Boolean);
    if (subtypes.length === 1) {
      query = query.ilike("pattern_detail", `%${subtypes[0]}%`);
    } else if (subtypes.length > 1) {
      query = query.or(subtypes.map(s => `pattern_detail.ilike.%${s}%`).join(","));
    }
    if (type === "커튼") query = query.eq("is_curtain_eligible", true);
    else if (type && type !== "패턴") query = query.eq("fabric_type", type);
  } else if (type) {
    if (type === "패턴") query = query.not("pattern_detail", "is", null).neq("pattern_detail", "무지");
    else if (type === "커튼") query = query.eq("is_curtain_eligible", true);
    else query = query.eq("fabric_type", type);
  }
  if (usageCol) query = query.contains("usage_types", [usageCol]);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const fabrics = (data || []).map(
    ({ embedding, ...rest }: Record<string, unknown>) => rest
  );

  return NextResponse.json({
    fabrics,
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
    mode: "individual",
  });
}
