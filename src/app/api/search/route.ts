import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * 원단 유사도 검색 API (pgvector 코사인 유사도)
 *
 * POST: 클라이언트에서 생성한 CLIP 임베딩 벡터를 받아 Supabase pgvector 검색
 *       → 브라우저에서 Transformers.js로 임베딩 생성 후 이 API로 전송
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
  // 각 쿼리 색상에 대해 가장 가까운 원단 색상 찾기 (비율 가중)
  let totalScore = 0;

  for (const qc of query) {
    let bestMatch = 0;
    for (const fc of fabric) {
      const dist = rgbDistance(qc.rgb, fc.rgb);
      const colorSim = Math.max(0, 1 - dist * 2.5); // 거리가 가까울수록 1에 가까움
      // 비율 유사도 (비율 차이가 적을수록 높음)
      const pctSim = 1 - Math.abs(qc.pct - fc.pct) / 100;
      const match = colorSim * 0.7 + pctSim * 0.3;
      if (match > bestMatch) bestMatch = match;
    }
    totalScore += bestMatch * (qc.pct / 100); // 쿼리 색상 비율로 가중
  }

  return totalScore;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { embedding, matchCount = 12, matchThreshold = 0.1, fabricType, patternDetail } = body;
    // 새 형식: [{rgb:[R,G,B], pct:60}, ...] 또는 구 형식: [R,G,B]
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

    // 필터 검색: 색상 우선 → 패턴/타입 → CLIP 유사도 정렬
    if (patternDetail || fabricType || body.dominantColor) {
      const dominantColor = body.dominantColor as string | undefined;
      let allCandidates: Record<string, unknown>[] = [];

      // ─── STEP 1: 색상으로 먼저 필터 (색상이 가장 중요) ───
      if (dominantColor) {
        let colorQuery = supabase
          .from("fabrics")
          .select("*")
          .not("embedding", "is", null)
          .not("image_url", "is", null)
          .ilike("notes", `%${dominantColor}%`);

        // 색상 + 패턴/타입 동시 필터
        if (patternDetail) {
          colorQuery = colorQuery.eq("pattern_detail", patternDetail);
        } else if (fabricType) {
          colorQuery = colorQuery.eq("fabric_type", fabricType);
        }

        const { data: colorPatternResults } = await colorQuery;
        if (colorPatternResults) allCandidates = colorPatternResults;

        // 색상+패턴 결과가 부족하면 → 색상만으로 확장 (패턴 무시)
        if (allCandidates.length < matchCount && (patternDetail || fabricType)) {
          const { data: colorOnlyResults } = await supabase
            .from("fabrics")
            .select("*")
            .not("embedding", "is", null)
            .not("image_url", "is", null)
            .ilike("notes", `%${dominantColor}%`);

          if (colorOnlyResults) {
            const existingIds = new Set(allCandidates.map((c) => c.id));
            const extra = colorOnlyResults.filter((c) => !existingIds.has(c.id));
            allCandidates = [...allCandidates, ...extra];
          }
        }
      } else {
        // 색상 없으면 패턴/타입만
        let filterQuery = supabase
          .from("fabrics")
          .select("*")
          .not("embedding", "is", null)
          .not("image_url", "is", null);

        if (patternDetail) {
          filterQuery = filterQuery.eq("pattern_detail", patternDetail);
        } else if (fabricType) {
          filterQuery = filterQuery.eq("fabric_type", fabricType);
        }

        const { data } = await filterQuery;
        if (data) allCandidates = data;
      }

      if (allCandidates.length > 0) {
        // ─── STEP 2: 색상 유사도(60%) + CLIP 유사도(40%) 점수 계산 ───
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

          // CLIP 코사인 유사도 (패턴/텍스처)
          let dot = 0, normA = 0, normB = 0;
          for (let i = 0; i < 512; i++) {
            dot += queryVec[i] * fabVec[i];
            normA += queryVec[i] * queryVec[i];
            normB += fabVec[i] * fabVec[i];
          }
          const clipSimilarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));

          // 색상 점수 (0~1)
          let colorScore = 0;

          // 1) 색상 이름 매칭
          if (dominantColor) {
            const notes = (fabric.notes as string) || "";
            if (notes.includes(dominantColor)) {
              colorScore += 0.3;
              const colorMatch = notes.match(new RegExp(`${dominantColor}:(\\d+)`));
              if (colorMatch) {
                // 비율이 높을수록 보너스 (100% → +0.3, 50% → +0.15)
                colorScore += (parseInt(colorMatch[1]) / 100) * 0.3;
              }
            }
          }

          // 2) RGB 색상 분포 비교
          if (queryColors) {
            const fabricClusters = parseColorClusters((fabric.notes as string) || "");
            if (fabricClusters) {
              const sim = colorDistributionSimilarity(queryColors, fabricClusters);
              colorScore += sim * 0.4; // 최대 0.4
            }
          }

          // 최종 점수: 색상 60% + CLIP 40%
          const similarity = colorScore * 0.6 + clipSimilarity * 0.4;

          const { embedding: _, ...rest } = fabric;
          return { ...rest, similarity, category_match: true };
        }).filter(Boolean) as Record<string, unknown>[];

        // 점수 기준 정렬
        scored.sort((a, b) => (b.similarity as number) - (a.similarity as number));

        if (scored.length >= matchCount) {
          return NextResponse.json({
            results: scored.slice(0, matchCount),
            total: scored.length,
            detectedCategory: patternDetail || fabricType || null,
            filteredCount: scored.length,
          });
        }

        // 부족하면 일반 검색으로 보충
        const { data: generalResults } = await supabase.rpc("search_fabrics", {
          query_embedding: vectorString,
          match_threshold: matchThreshold,
          match_count: matchCount,
        });

        const seenIds = new Set(scored.map((r) => r.id as string));
        const supplement = (generalResults || [])
          .map(({ embedding: _, ...rest }: Record<string, unknown>) => rest)
          .filter((r: Record<string, unknown>) => !seenIds.has(r.id as string));

        return NextResponse.json({
          results: [...scored, ...supplement].slice(0, matchCount),
          total: scored.length,
          detectedCategory: patternDetail || fabricType || null,
          filteredCount: scored.length,
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

    return NextResponse.json({
      results: (results || []).map(
        ({ embedding, ...rest }: Record<string, unknown>) => rest
      ).slice(0, matchCount),
      total: (results || []).length,
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

// GET: 전체 원단 목록 (필터/페이지네이션)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const type = searchParams.get("type") || "";
  const subtype = searchParams.get("subtype") || "";
  const usage = searchParams.get("usage") || "";
  const color = searchParams.get("color") || "";
  const search = searchParams.get("search") || "";

  const supabase = createServiceClient();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("fabrics")
    .select("*", { count: "exact" })
    .not("image_url", "is", null)
    .order("name")
    .range(from, to);

  if (search) {
    // 원단명 또는 컬러번호로 검색
    query = query.or(`name.ilike.%${search}%,color_code.ilike.%${search}%`);
  }

  // 패턴상세가 선택되면 패턴상세 기준으로만 필터 (fabric_type 무시)
  // → 린넨+헤링본, 면+체크 같은 원단도 패턴 필터에 포함
  if (subtype) {
    query = query.eq("pattern_detail", subtype);
    // type이 "패턴"이면 subtype으로 이미 커버되므로 추가 필터 불필요
    // type이 린넨/면/울 등 소재면 소재+패턴 조합 필터
    if (type && type !== "패턴") {
      query = query.eq("fabric_type", type);
    }
  } else if (type) {
    // 패턴상세 없이 원단종류만 선택
    if (type === "패턴") {
      // "패턴" 선택 시: fabric_type이 패턴이거나, pattern_detail이 있는 것 모두 포함
      query = query.not("pattern_detail", "is", null);
    } else {
      query = query.eq("fabric_type", type);
    }
  }

  if (usage) query = query.contains("usage_types", [usage]);
  if (color) query = query.ilike("notes", `%${color}%`);

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
  });
}
