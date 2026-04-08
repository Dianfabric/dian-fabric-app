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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { embedding, matchCount = 12, matchThreshold = 0.1 } = body;

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

    // Supabase pgvector 코사인 유사도 검색
    const supabase = createServiceClient();
    const vectorString = `[${embedding.join(",")}]`;

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

    // 결과에서 embedding 필드 제거 (응답 크기 절약)
    const cleanResults = (results || []).map(
      ({ embedding, ...rest }: Record<string, unknown>) => rest
    );

    return NextResponse.json({
      results: cleanResults,
      total: cleanResults.length,
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
  if (subtype) query = query.eq("pattern_detail", subtype);
  if (usage) query = query.contains("usage_types", [usage]);
  if (color) query = query.eq("notes", color);

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
