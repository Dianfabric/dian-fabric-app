import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * DINOv2 기반 원단 유사도 검색 API
 *
 * 기존 /api/search와 동일한 파이프라인이지만:
 *   - embedding 컬럼 → embedding_dino 컬럼
 *   - search_fabrics RPC → search_fabrics_dino RPC
 *   - 768차원 (CLIP 512차원 대신)
 *   - embeddingWeight 파라미터로 슬라이더 조정 가능 (기본 0.6)
 */

type ColorCluster = { rgb: number[]; pct: number };

function rgbDistance(rgb1: number[], rgb2: number[]): number {
  const dr = rgb1[0] - rgb2[0];
  const dg = rgb1[1] - rgb2[1];
  const db = rgb1[2] - rgb2[2];
  return Math.sqrt(dr * dr + dg * dg + db * db) / 441.67;
}

function parseColorClusters(notes: string | null): ColorCluster[] | null {
  if (!notes) return null;
  const rgbPart = notes.match(/\|rgb:([^|]*)/)?.[1];
  if (!rgbPart) return null;

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

  const m = rgbPart.match(/(\d+),(\d+),(\d+)/);
  if (!m) return null;
  return [{ rgb: [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])], pct: 100 }];
}

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

function colorNameSimilarity(query: ColorName[], fabric: ColorName[]): number {
  let matchScore = 0;
  for (const qc of query) {
    const match = fabric.find((fc) => fc.name === qc.name);
    if (match) {
      const pctSim = 1 - Math.abs(qc.pct - match.pct) / 100;
      matchScore += pctSim * (qc.pct / 100);
    }
  }
  let penalty = 0;
  for (const fc of fabric) {
    const inQuery = query.find((qc) => qc.name === fc.name);
    if (!inQuery) penalty += fc.pct / 100;
  }
  return Math.max(0, matchScore - penalty * 0.8);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      embedding,
      matchCount = 12,
      matchThreshold = 0.1,
      fabricType,
      patternDetail,
    } = body;

    // 슬라이더로 조정 가능한 임베딩 가중치 (기본 0.6 = CLIP 라우트와 동일)
    const embeddingWeight: number = typeof body.embeddingWeight === "number"
      ? Math.max(0, Math.min(1, body.embeddingWeight))
      : 0.6;
    const rgbWeight = 1 - embeddingWeight;

    const queryColorNames: ColorName[] | null = body.colorNames || null;
    const rawRGB = body.rgb;
    let queryColors: ColorCluster[] | null = null;
    if (rawRGB) {
      if (Array.isArray(rawRGB) && rawRGB.length > 0 && typeof rawRGB[0] === "object") {
        queryColors = rawRGB as ColorCluster[];
      } else if (Array.isArray(rawRGB) && rawRGB.length === 3 && typeof rawRGB[0] === "number") {
        queryColors = [{ rgb: rawRGB as number[], pct: 100 }];
      }
    }

    if (!embedding || !Array.isArray(embedding)) {
      return NextResponse.json({ error: "임베딩 벡터가 필요합니다" }, { status: 400 });
    }
    if (embedding.length !== 768) {
      return NextResponse.json(
        { error: `임베딩 차원 오류: ${embedding.length}차원 (DINOv2는 768차원)` },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const vectorString = `[${embedding.join(",")}]`;

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

      // STEP 1: 색상명 + 패턴 1차 필터
      if (hasColorNames) {
        let q = supabase
          .from("fabrics")
          .select("*")
          .not("embedding_dino", "is", null)
          .not("image_url", "is", null);

        for (const cn of queryColorNames) {
          if (cn.pct >= 20) q = q.ilike("notes", `%${cn.name}%`);
        }
        if (patternDetail) q = q.ilike("pattern_detail", `%${patternDetail}%`);
        else if (fabricType) q = q.ilike("fabric_type", `%${fabricType}%`);

        const { data } = await q;
        addResults(data);
      } else if (hasPatternFilter) {
        let q = supabase
          .from("fabrics")
          .select("*")
          .not("embedding_dino", "is", null)
          .not("image_url", "is", null);
        if (patternDetail) q = q.ilike("pattern_detail", `%${patternDetail}%`);
        else if (fabricType) q = q.ilike("fabric_type", `%${fabricType}%`);
        if (hasTextColor) q = q.ilike("notes", `%${dominantColor}%`);
        const { data } = await q;
        addResults(data);
      } else if (hasTextColor) {
        const { data } = await supabase
          .from("fabrics")
          .select("*")
          .not("embedding_dino", "is", null)
          .not("image_url", "is", null)
          .ilike("notes", `%${dominantColor}%`);
        addResults(data);
      }

      // 부족하면 DINOv2 RPC로 확장
      if (allCandidates.length < matchCount) {
        const { data } = await supabase.rpc("search_fabrics_dino", {
          query_embedding: vectorString,
          match_threshold: matchThreshold,
          match_count: 300,
        });
        addResults(data as Record<string, unknown>[] | null);
      }

      // STEP 2: 색상명 비율 정밀 필터
      if (hasColorNames && allCandidates.length > matchCount) {
        const colorScored = allCandidates.map((fabric) => {
          const fabricColorNames = parseColorNames((fabric.notes as string) || "");
          const score = fabricColorNames
            ? colorNameSimilarity(queryColorNames!, fabricColorNames)
            : 0;
          return { fabric, score };
        });
        colorScored.sort((a, b) => b.score - a.score);
        allCandidates = colorScored
          .filter((c) => c.score > 0.3)
          .slice(0, Math.max(matchCount * 3, 300))
          .map((c) => c.fabric);
      }

      if (allCandidates.length > 0) {
        // STEP 3: DINOv2 텍스쳐 + RGB 톤 (슬라이더 가중치 적용)
        const queryVec = embedding as number[];
        const queryDim = queryVec.length;

        const scored = allCandidates
          .map((fabric: Record<string, unknown>) => {
            const embStr = fabric.embedding_dino as string;
            let fabVec: number[];
            try {
              fabVec = typeof embStr === "string" ? JSON.parse(embStr) : (embStr as unknown as number[]);
            } catch {
              return null;
            }
            if (!fabVec || fabVec.length !== queryDim) return null;

            // DINOv2 코사인 유사도 (텍스쳐 비교)
            let dot = 0,
              normA = 0,
              normB = 0;
            for (let i = 0; i < queryDim; i++) {
              dot += queryVec[i] * fabVec[i];
              normA += queryVec[i] * queryVec[i];
              normB += fabVec[i] * fabVec[i];
            }
            const dinoSim = dot / (Math.sqrt(normA) * Math.sqrt(normB));

            let rgbSim = 0;
            if (queryColors) {
              const fabricClusters = parseColorClusters((fabric.notes as string) || "");
              if (fabricClusters) {
                rgbSim = colorDistributionSimilarity(queryColors, fabricClusters);
              }
            }

            // 슬라이더로 조정 가능: 기본 DINOv2 60% + RGB 40%
            const similarity = dinoSim * embeddingWeight + rgbSim * rgbWeight;

            const { embedding_dino: _, embedding: __, ...rest } = fabric;
            return { ...rest, similarity, category_match: true };
          })
          .filter(Boolean) as Record<string, unknown>[];

        scored.sort((a, b) => (b.similarity as number) - (a.similarity as number));

        return NextResponse.json({
          results: scored.slice(0, matchCount),
          total: scored.length,
          detectedCategory: patternDetail || fabricType || null,
          filteredCount: scored.length,
          embeddingWeight,
        });
      }
    }

    // 필터 없거나 결과 0 → 순수 DINOv2 검색
    const { data: results, error } = await supabase.rpc("search_fabrics_dino", {
      query_embedding: vectorString,
      match_threshold: matchThreshold,
      match_count: matchCount,
    });

    if (error) {
      console.error("Supabase DINOv2 search error:", error);
      return NextResponse.json(
        { error: "검색 중 오류가 발생했습니다: " + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      results: (results || [])
        .map(({ embedding_dino, embedding, ...rest }: Record<string, unknown>) => rest)
        .slice(0, matchCount),
      total: (results || []).length,
      detectedCategory: null,
      embeddingWeight,
    });
  } catch (err) {
    console.error("DINOv2 Search API error:", err);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
