import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel 타임아웃 60초

/**
 * 레퍼런스 기반 재분류 API (v2 - 상대적 비교)
 *
 * CLIP 임베딩은 원단 이미지 간 유사도가 전부 0.85~0.95 범위에 있어서
 * 절대 임계값(0.75)으로는 구분이 안됨.
 *
 * 새 로직:
 * 1. 타겟 카테고리의 검증된 원단 임베딩 → centroid (기준 벡터)
 * 2. 전체 원단 랜덤 샘플 → generalCentroid (일반 벡터)
 * 3. 미검증 원단 각각: sim(target) - sim(general) = margin
 * 4. margin이 상위 N%이면 해당 카테고리로 분류
 *
 * 즉, "평균적인 원단보다 스트라이프에 얼마나 더 가까운가"로 판단
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
    for (let i = 0; i < dim; i++) avg[i] += emb[i];
  }
  for (let i = 0; i < dim; i++) avg[i] /= embeddings.length;
  const norm = Math.sqrt(avg.reduce((s, v) => s + v * v, 0));
  if (norm > 0) for (let i = 0; i < dim; i++) avg[i] /= norm;
  return avg;
}

function parseEmbedding(raw: unknown): number[] | null {
  if (!raw) return null;
  try {
    const emb = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(emb) && emb.length > 0) return emb;
  } catch { /* ignore */ }
  return null;
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  const { category, subtype } = await request.json();

  const label = subtype || category;
  if (!label || label === "전체 (무작위)") {
    return NextResponse.json({ error: "카테고리를 선택해주세요" }, { status: 400 });
  }

  // ─── 1. 타겟 카테고리의 검증된 원단 임베딩 ───
  let vQuery = supabase
    .from("fabrics")
    .select("embedding")
    .eq("manually_verified", true)
    .not("embedding", "is", null);

  if (subtype) {
    vQuery = vQuery.eq("pattern_detail", subtype);
  } else {
    vQuery = vQuery.eq("fabric_type", category);
  }

  const { data: verifiedRows, error: vErr } = await vQuery;
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

  const targetEmbeddings: number[][] = [];
  for (const row of verifiedRows || []) {
    const emb = parseEmbedding(row.embedding);
    if (emb) targetEmbeddings.push(emb);
  }

  if (targetEmbeddings.length < 3) {
    return NextResponse.json({
      error: `레퍼런스가 부족합니다 (최소 3개 필요, 현재 ${targetEmbeddings.length}개)`,
    }, { status: 400 });
  }

  const targetCentroid = averageEmbeddings(targetEmbeddings);

  // ─── 2. 일반 벡터 (전체 랜덤 샘플 200개) ───
  const { data: generalRows } = await supabase
    .from("fabrics")
    .select("embedding")
    .not("embedding", "is", null)
    .limit(300);

  const generalEmbeddings: number[][] = [];
  for (const row of generalRows || []) {
    const emb = parseEmbedding(row.embedding);
    if (emb) generalEmbeddings.push(emb);
  }
  const generalCentroid = averageEmbeddings(generalEmbeddings);

  // ─── 3. 미검증 원단 스캔 + margin 계산 ───
  const targetFabricType = subtype ? "패턴" : category;
  const targetPatternDetail = subtype || null;

  // 이미 해당 카테고리인 원단은 건너뛰기 위한 조건
  let candidates: { id: string; margin: number }[] = [];
  let page = 0;

  while (true) {
    const from = page * 500;
    const { data: rows, error: uErr } = await supabase
      .from("fabrics")
      .select("id, embedding, fabric_type, pattern_detail")
      .eq("manually_verified", false)
      .not("embedding", "is", null)
      .range(from, from + 499);

    if (uErr || !rows || rows.length === 0) break;

    for (const row of rows) {
      // 이미 해당 카테고리면 건너뛰기
      if (subtype && row.pattern_detail === subtype) continue;
      if (!subtype && row.fabric_type === category) continue;

      const emb = parseEmbedding(row.embedding);
      if (!emb) continue;

      const simTarget = cosineSimilarity(targetCentroid, emb);
      const simGeneral = cosineSimilarity(generalCentroid, emb);
      const margin = simTarget - simGeneral;

      candidates.push({ id: row.id, margin });
    }

    if (rows.length < 500) break;
    page++;
  }

  // ─── 4. margin 기준 상위 원단만 분류 ───
  // 검증된 원단의 margin 분포를 기준으로 임계값 결정
  const verifiedMargins: number[] = [];
  for (const emb of targetEmbeddings) {
    const simT = cosineSimilarity(targetCentroid, emb);
    const simG = cosineSimilarity(generalCentroid, emb);
    verifiedMargins.push(simT - simG);
  }
  verifiedMargins.sort((a, b) => a - b);

  // 검증된 원단 중 하위 10% margin을 임계값으로 사용
  // (검증된 원단의 90%가 이 임계값 이상)
  const thresholdIndex = Math.floor(verifiedMargins.length * 0.1);
  const marginThreshold = verifiedMargins[thresholdIndex];

  // 임계값 이상인 미검증 원단을 분류
  const toClassify = candidates.filter(c => c.margin >= marginThreshold);

  let classified = 0;
  let errors = 0;

  // 배치 업데이트 (50개씩)
  for (let i = 0; i < toClassify.length; i += 50) {
    const batch = toClassify.slice(i, i + 50);
    const ids = batch.map(c => c.id);

    const updateData: Record<string, unknown> = {
      fabric_type: targetFabricType,
    };
    if (targetPatternDetail) {
      updateData.pattern_detail = targetPatternDetail;
    }

    const { error: upErr, count } = await supabase
      .from("fabrics")
      .update(updateData)
      .in("id", ids);

    if (upErr) {
      errors += batch.length;
    } else {
      classified += count || batch.length;
    }
  }

  return NextResponse.json({
    success: true,
    category: label,
    referenceCount: targetEmbeddings.length,
    totalCandidates: candidates.length,
    marginThreshold: marginThreshold.toFixed(6),
    classified,
    errors,
  });
}
