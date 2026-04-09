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
    const { embedding, matchCount = 12, matchThreshold = 0.1, fabricType, patternDetail } = body;

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

    // 카테고리 필터가 있으면 필터 검색 + 일반 검색 병행
    let filteredResults: Record<string, unknown>[] = [];
    let generalResults: Record<string, unknown>[] = [];

    // 1) 카테고리 필터 검색 (같은 패턴 안에서 검색)
    if (fabricType || patternDetail) {
      const filterParam = patternDetail || fabricType;
      const filterField = patternDetail ? "pattern_detail" : "fabric_type";

      const { data } = await supabase.rpc("search_fabrics_filtered", {
        query_embedding: vectorString,
        match_threshold: matchThreshold,
        match_count: matchCount,
        filter_field: filterField,
        filter_value: filterParam,
      });

      if (data) {
        filteredResults = data.map(
          ({ embedding, ...rest }: Record<string, unknown>) => ({ ...rest, category_match: true })
        );
      }
    }

    // 2) 일반 검색 (전체에서 검색)
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

    generalResults = (results || []).map(
      ({ embedding, ...rest }: Record<string, unknown>) => rest
    );

    // 3) 결과 합치기: 필터 결과 우선, 중복 제거
    const seenIds = new Set<string>();
    const combined: Record<string, unknown>[] = [];

    for (const r of filteredResults) {
      if (!seenIds.has(r.id as string)) {
        seenIds.add(r.id as string);
        combined.push(r);
      }
    }
    for (const r of generalResults) {
      if (!seenIds.has(r.id as string)) {
        seenIds.add(r.id as string);
        combined.push(r);
      }
    }

    return NextResponse.json({
      results: combined.slice(0, matchCount),
      total: combined.length,
      detectedCategory: patternDetail || fabricType || null,
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
  if (type) query = query.eq("fabric_type", type);
  if (subtype) query = query.eq("pattern_detail", subtype);
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
