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

// RGB 거리 계산 (0~1, 0이 완전 같음)
function rgbDistance(rgb1: number[], rgb2: number[]): number {
  const dr = rgb1[0] - rgb2[0];
  const dg = rgb1[1] - rgb2[1];
  const db = rgb1[2] - rgb2[2];
  return Math.sqrt(dr * dr + dg * dg + db * db) / 441.67; // max distance = sqrt(255²*3)
}

// notes에서 RGB 파싱: "아이보리:60,차콜:40|rgb:128,100,80" → [128,100,80]
function parseRGB(notes: string | null): number[] | null {
  if (!notes) return null;
  const match = notes.match(/\|rgb:(\d+),(\d+),(\d+)/);
  if (!match) return null;
  return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { embedding, matchCount = 12, matchThreshold = 0.1, fabricType, patternDetail } = body;
    const queryRGB = body.rgb as number[] | undefined; // [R, G, B] from uploaded image

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

    // Gemini 필터가 있으면: 해당 카테고리 전체에서 CLIP 유사도 정렬
    if (patternDetail || fabricType) {
      // 1) 필터 조건에 맞는 원단 전체 가져오기 (임베딩 포함)
      // 색상 필터 포함 쿼리 + 색상 없는 쿼리 (fallback)
      const dominantColor = body.dominantColor as string | undefined;

      // 1차: 패턴 + 색상 필터
      let allCandidates: Record<string, unknown>[] = [];

      if (dominantColor) {
        // 먼저 패턴 + 색상 매칭
        let colorQuery = supabase
          .from("fabrics")
          .select("*")
          .not("embedding", "is", null)
          .not("image_url", "is", null)
          .ilike("notes", `%${dominantColor}%`);

        if (patternDetail) {
          colorQuery = colorQuery.eq("pattern_detail", patternDetail);
        } else if (fabricType) {
          colorQuery = colorQuery.eq("fabric_type", fabricType);
        }

        const { data: colorCandidates } = await colorQuery;
        if (colorCandidates) allCandidates = colorCandidates;

        // 색상 매칭 결과가 부족하면 패턴만으로 보충
        if (allCandidates.length < matchCount) {
          let patternQuery = supabase
            .from("fabrics")
            .select("*")
            .not("embedding", "is", null)
            .not("image_url", "is", null);

          if (patternDetail) {
            patternQuery = patternQuery.eq("pattern_detail", patternDetail);
          } else if (fabricType) {
            patternQuery = patternQuery.eq("fabric_type", fabricType);
          }

          const { data: patternCandidates } = await patternQuery;
          if (patternCandidates) {
            const existingIds = new Set(allCandidates.map((c) => c.id));
            const extra = patternCandidates.filter((c) => !existingIds.has(c.id));
            allCandidates = [...allCandidates, ...extra];
          }
        }
      } else {
        // 색상 없으면 패턴만
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
        // 2) 각 후보의 CLIP 유사도 + 색상 보너스 점수 계산
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

          // 코사인 유사도
          let dot = 0, normA = 0, normB = 0;
          for (let i = 0; i < 512; i++) {
            dot += queryVec[i] * fabVec[i];
            normA += queryVec[i] * queryVec[i];
            normB += fabVec[i] * fabVec[i];
          }
          const clipSimilarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));

          // 색상 보너스 (이름 매칭 + RGB 거리)
          let colorBonus = 0;

          // 1) 색상 이름 매칭
          if (dominantColor) {
            const notes = (fabric.notes as string) || "";
            if (notes.includes(dominantColor)) {
              colorBonus += 0.03;
              const colorMatch = notes.match(new RegExp(`${dominantColor}:(\\d+)`));
              if (colorMatch) {
                colorBonus += parseInt(colorMatch[1]) * 0.0005;
              }
            }
          }

          // 2) RGB 거리 보너스 (가장 강력한 색상 필터)
          if (queryRGB && queryRGB.length === 3) {
            const fabricRGB = parseRGB((fabric.notes as string) || "");
            if (fabricRGB) {
              const dist = rgbDistance(queryRGB, fabricRGB);
              // dist 0 = 완전 같음 → 보너스 0.15
              // dist 0.5 = 꽤 다름 → 보너스 0
              colorBonus += Math.max(0, 0.15 * (1 - dist * 2));
            }
          }

          const similarity = clipSimilarity + colorBonus;

          const { embedding: _, ...rest } = fabric;
          return { ...rest, similarity, category_match: true };
        }).filter(Boolean) as Record<string, unknown>[];

        // 통합 점수 기준 정렬
        scored.sort((a, b) => (b.similarity as number) - (a.similarity as number));

        // 필터 결과가 충분하면 바로 반환
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
