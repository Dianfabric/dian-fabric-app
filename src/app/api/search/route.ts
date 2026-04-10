import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

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

    // ─── 역할 분리 검색: Gemini→패턴 필터, RGB→색상 필터+정렬 ───
    // dominantColor는 텍스트 검색용 (RGB 없을 때 fallback)
    const dominantColor = body.dominantColor as string | undefined;
    const hasPatternFilter = patternDetail || fabricType;
    const hasRGBData = queryColors && queryColors.length > 0;
    const hasTextColor = !!dominantColor && !hasRGBData; // 텍스트 검색에서만 색상명 사용

    if (hasPatternFilter || hasRGBData || hasTextColor) {
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

      // STEP 1a: 패턴 + 텍스트색상 (텍스트 검색용)
      if (hasPatternFilter && hasTextColor) {
        let q = supabase.from("fabrics").select("*")
          .not("embedding", "is", null).not("image_url", "is", null)
          .ilike("notes", `%${dominantColor}%`);
        if (patternDetail) q = q.eq("pattern_detail", patternDetail);
        else if (fabricType) q = q.eq("fabric_type", fabricType);
        const { data } = await q;
        addResults(data);
      }

      // STEP 1b: 패턴 필터 (Gemini 담당)
      if (hasPatternFilter && allCandidates.length < matchCount) {
        let q = supabase.from("fabrics").select("*")
          .not("embedding", "is", null).not("image_url", "is", null);
        if (patternDetail) q = q.eq("pattern_detail", patternDetail);
        else if (fabricType) q = q.eq("fabric_type", fabricType);
        const { data } = await q;
        addResults(data);
      }

      // STEP 1c: 텍스트 색상만 (패턴 없이)
      if (!hasPatternFilter && hasTextColor && allCandidates.length < matchCount) {
        const { data } = await supabase.from("fabrics").select("*")
          .not("embedding", "is", null).not("image_url", "is", null)
          .ilike("notes", `%${dominantColor}%`);
        addResults(data);
      }

      // 패턴 필터 결과가 부족하면 CLIP 벡터로 확장
      if (allCandidates.length < matchCount) {
        const { data } = await supabase.rpc("search_fabrics", {
          query_embedding: vectorString,
          match_threshold: matchThreshold,
          match_count: 300,
        });
        addResults(data as Record<string, unknown>[] | null);
      }

      // STEP 2: RGB 색상 필터 (이미지 검색) — 패턴 후보 중 색상이 비슷한 것만
      if (hasRGBData && allCandidates.length > matchCount) {
        const colorFiltered = allCandidates.filter((fabric) =>
          passesColorFilter(queryColors!, (fabric.notes as string) || "", 0.3)
        );
        // 색상 필터 결과가 충분하면 사용, 아니면 전체 유지
        if (colorFiltered.length >= Math.min(matchCount, 15)) {
          allCandidates = colorFiltered;
        }
      }

      if (allCandidates.length > 0) {
        // STEP 3: CLIP + RGB로 정렬
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

          // CLIP 코사인 유사도
          let dot = 0, normA = 0, normB = 0;
          for (let i = 0; i < 512; i++) {
            dot += queryVec[i] * fabVec[i];
            normA += queryVec[i] * queryVec[i];
            normB += fabVec[i] * fabVec[i];
          }
          const clipSim = dot / (Math.sqrt(normA) * Math.sqrt(normB));

          // RGB 색상 분포 유사도
          let rgbSim = 0;
          if (queryColors) {
            const fabricClusters = parseColorClusters((fabric.notes as string) || "");
            if (fabricClusters) {
              rgbSim = colorDistributionSimilarity(queryColors, fabricClusters);
            }
          }

          // 최종: CLIP 40% + RGB 60% (색상 중시)
          const similarity = clipSim * 0.4 + rgbSim * 0.6;

          const { embedding: _, ...rest } = fabric;
          return { ...rest, similarity, category_match: true };
        }).filter(Boolean) as Record<string, unknown>[];

        scored.sort((a, b) => (b.similarity as number) - (a.similarity as number));

        return NextResponse.json({
          results: scored.slice(0, matchCount),
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
    query = query.or(`name.ilike.%${search}%,color_code.ilike.%${search}%`);
  }

  if (subtype) {
    query = query.eq("pattern_detail", subtype);
    if (type && type !== "패턴") {
      query = query.eq("fabric_type", type);
    }
  } else if (type) {
    if (type === "패턴") {
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
