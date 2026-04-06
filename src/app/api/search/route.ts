import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

/**
 * 원단 유사도 검색 API
 *
 * 현재 방식: 이미지를 base64로 받아 Supabase에 저장된 CLIP 임베딩과
 * pgvector cosine distance로 비교
 *
 * Phase 1 (현재): 텍스트 기반 검색 + 랜덤 결과 (CLIP API 연동 전)
 * Phase 2: Replicate CLIP API로 이미지 → 벡터 변환 후 pgvector 검색
 */

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json({ error: "이미지를 업로드해주세요" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // ── Phase 1: 임베딩이 있는 원단 중 랜덤 Top-10 반환
    // (CLIP API 연동 전 임시 로직 — 실제 이미지 유사도 검색은 Phase 2에서)
    const { data: fabrics, error } = await supabase
      .from("fabrics")
      .select("*")
      .not("embedding", "is", null)
      .not("image_url", "is", null)
      .limit(100);

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "검색 중 오류가 발생했습니다" }, { status: 500 });
    }

    // 랜덤 셔플 후 Top-10 (Phase 2에서 실제 유사도로 교체)
    const shuffled = (fabrics || []).sort(() => Math.random() - 0.5);
    const results = shuffled.slice(0, 10).map((f, i) => ({
      ...f,
      similarity: parseFloat((0.97 - i * 0.03 + Math.random() * 0.01).toFixed(4)),
      embedding: undefined, // 응답에서 벡터 제거 (용량 절감)
    }));

    // 유사도 내림차순 정렬
    results.sort((a, b) => b.similarity - a.similarity);

    return NextResponse.json({
      results,
      total: fabrics?.length || 0,
      note: "Phase 1: 임시 랜덤 결과입니다. CLIP API 연동 후 실제 유사도 검색으로 전환됩니다.",
    });
  } catch (err) {
    console.error("Search API error:", err);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}

// GET: 전체 원단 목록 (필터/페이지네이션)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const type = searchParams.get("type") || "";
  const usage = searchParams.get("usage") || "";

  const supabase = createServiceClient();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("fabrics")
    .select("*", { count: "exact" })
    .not("image_url", "is", null)
    .order("name")
    .range(from, to);

  if (type) query = query.eq("fabric_type", type);
  if (usage) query = query.contains("usage_types", [usage]);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // embedding 필드 제거
  const fabrics = (data || []).map(({ embedding, ...rest }) => rest);

  return NextResponse.json({
    fabrics,
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  });
}
