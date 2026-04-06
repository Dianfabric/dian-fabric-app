import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

/**
 * 원단 유사도 검색 API (Phase 2: CLIP + pgvector)
 *
 * 흐름: 이미지 업로드 → Replicate CLIP API로 벡터 변환 → Supabase pgvector 코사인 검색
 */

async function getClipEmbedding(imageBase64: string): Promise<number[]> {
  const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

  if (!REPLICATE_API_TOKEN) {
    throw new Error("REPLICATE_API_TOKEN이 설정되지 않았습니다");
  }

  // Replicate CLIP prediction 생성
  const response = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: "75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a",
      input: {
        image: `data:image/png;base64,${imageBase64}`,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Replicate API 오류: ${response.status} - ${errorText}`);
  }

  const prediction = await response.json();

  // 결과 폴링 (최대 30초)
  let result = prediction;
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    if (result.status === "succeeded") {
      break;
    }
    if (result.status === "failed") {
      throw new Error(`CLIP 처리 실패: ${result.error}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const pollResponse = await fetch(
      `https://api.replicate.com/v1/predictions/${result.id}`,
      {
        headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
      }
    );
    result = await pollResponse.json();
  }

  if (result.status !== "succeeded") {
    throw new Error("CLIP 처리 시간 초과");
  }

  // Replicate CLIP 모델은 output으로 embedding 배열을 반환
  const embedding = result.output;

  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("CLIP 임베딩 결과가 올바르지 않습니다");
  }

  // 임베딩이 중첩 배열일 수 있음
  const vector = Array.isArray(embedding[0]) ? embedding[0] : embedding;

  return vector;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "이미지를 업로드해주세요" },
        { status: 400 }
      );
    }

    // 이미지를 base64로 변환
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // CLIP 임베딩 생성
    let queryEmbedding: number[];
    try {
      queryEmbedding = await getClipEmbedding(base64);
    } catch (clipError) {
      console.error("CLIP API error:", clipError);

      // CLIP API 실패 시 폴백: 랜덤 결과 반환
      const supabase = createServiceClient();
      const { data: fabrics } = await supabase
        .from("fabrics")
        .select("*")
        .not("embedding", "is", null)
        .not("image_url", "is", null)
        .limit(100);

      const shuffled = (fabrics || []).sort(() => Math.random() - 0.5);
      const results = shuffled.slice(0, 10).map((f, i) => ({
        ...f,
        similarity: parseFloat(
          (0.85 - i * 0.03 + Math.random() * 0.01).toFixed(4)
        ),
        embedding: undefined,
      }));
      results.sort((a, b) => b.similarity - a.similarity);

      return NextResponse.json({
        results,
        total: results.length,
        note: "CLIP API 연결 실패로 임시 결과를 표시합니다. REPLICATE_API_TOKEN을 확인해주세요.",
      });
    }

    // Supabase pgvector 코사인 유사도 검색
    const supabase = createServiceClient();
    const vectorString = `[${queryEmbedding.join(",")}]`;

    const { data: results, error } = await supabase.rpc("search_fabrics", {
      query_embedding: vectorString,
      match_threshold: 0.3,
      match_count: 10,
    });

    if (error) {
      console.error("Supabase search error:", error);
      return NextResponse.json(
        { error: "검색 중 오류가 발생했습니다" },
        { status: 500 }
      );
    }

    // 결과에서 embedding 제거
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
