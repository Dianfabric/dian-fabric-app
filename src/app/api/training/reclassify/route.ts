import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * 레퍼런스 기반 재분류 API
 *
 * POST: 검증된(confirmed) 원단의 임베딩 평균을 기준으로
 *       미검증 원단들을 자동 재분류
 *
 * body: { category?: string, subtype?: string }
 *
 * 로직:
 * 1. 해당 카테고리의 검증된 원단들 임베딩 → 평균 = 카테고리 기준 벡터
 * 2. 미검증 원단 중 해당 기준 벡터와 유사도 높은 것 → 자동 분류
 */

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function averageEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];
  const dim = embeddings[0].length;
  const avg = new Array(dim).fill(0);
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      avg[i] += emb[i];
    }
  }
  for (let i = 0; i < dim; i++) {
    avg[i] /= embeddings.length;
  }
  // L2 normalize
  const norm = Math.sqrt(avg.reduce((s, v) => s + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < dim; i++) avg[i] /= norm;
  }
  return avg;
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  const { category, subtype } = await request.json();

  // 1. 해당 카테고리의 검증된 원단 임베딩 가져오기
  let verifiedQuery = supabase
    .from("fabrics")
    .select("id, embedding")
    .eq("manually_verified", true)
    .not("embedding", "is", null);

  if (subtype) {
    verifiedQuery = verifiedQuery.eq("pattern_detail", subtype);
  } else if (category && category !== "전체 (무작위)") {
    verifiedQuery = verifiedQuery.eq("fabric_type", category);
  } else {
    return NextResponse.json(
      { error: "카테고리를 선택해주세요" },
      { status: 400 }
    );
  }

  const { data: verifiedFabrics, error: vError } = await verifiedQuery;
  if (vError) {
    return NextResponse.json({ error: vError.message }, { status: 500 });
  }

  if (!verifiedFabrics || verifiedFabrics.length < 3) {
    return NextResponse.json(
      { error: `레퍼런스가 부족합니다 (최소 3개 필요, 현재 ${verifiedFabrics?.length || 0}개)` },
      { status: 400 }
    );
  }

  // 2. 임베딩 파싱 + 평균 계산
  const embeddings: number[][] = [];
  for (const fab of verifiedFabrics) {
    if (fab.embedding) {
      // pgvector는 string "[0.1,0.2,...]" 또는 array로 반환될 수 있음
      const emb = typeof fab.embedding === "string"
        ? JSON.parse(fab.embedding.replace(/^\[/, "[").replace(/\]$/, "]"))
        : fab.embedding;
      if (Array.isArray(emb) && emb.length > 0) {
        embeddings.push(emb);
      }
    }
  }

  if (embeddings.length < 3) {
    return NextResponse.json(
      { error: `유효한 임베딩이 부족합니다 (${embeddings.length}개)` },
      { status: 400 }
    );
  }

  const centroid = averageEmbeddings(embeddings);
  const targetFabricType = subtype ? "패턴" : category;
  const targetPatternDetail = subtype || null;

  // 3. 미검증 원단 가져오기 (페이징)
  let classified = 0;
  let skipped = 0;
  let errors = 0;
  let page = 0;
  const SIMILARITY_THRESHOLD = 0.75; // 유사도 임계값

  while (true) {
    const from = page * 500;
    const { data: unverified, error: uError } = await supabase
      .from("fabrics")
      .select("id, embedding, fabric_type, pattern_detail")
      .eq("manually_verified", false)
      .not("embedding", "is", null)
      .range(from, from + 499);

    if (uError) { errors++; break; }
    if (!unverified || unverified.length === 0) break;

    for (const fab of unverified) {
      if (!fab.embedding) { skipped++; continue; }

      const emb = typeof fab.embedding === "string"
        ? JSON.parse(fab.embedding.replace(/^\[/, "[").replace(/\]$/, "]"))
        : fab.embedding;

      if (!Array.isArray(emb) || emb.length === 0) { skipped++; continue; }

      const similarity = cosineSimilarity(centroid, emb);

      if (similarity >= SIMILARITY_THRESHOLD) {
        // 기준 벡터와 충분히 유사 → 해당 카테고리로 분류
        const updateData: Record<string, unknown> = {
          fabric_type: targetFabricType,
          auto_classified: true,
        };
        if (targetPatternDetail) {
          updateData.pattern_detail = targetPatternDetail;
        }

        const { error: upErr } = await supabase
          .from("fabrics")
          .update(updateData)
          .eq("id", fab.id);

        if (upErr) { errors++; } else { classified++; }
      } else {
        skipped++;
      }
    }

    if (unverified.length < 500) break;
    page++;
  }

  return NextResponse.json({
    success: true,
    category: subtype || category,
    referenceCount: embeddings.length,
    classified,
    skipped,
    errors,
    threshold: SIMILARITY_THRESHOLD,
  });
}
