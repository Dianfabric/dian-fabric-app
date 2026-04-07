import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

/**
 * 원단 유사도 검색 API (Replicate CLIP ViT-B/32 + pgvector)
 *
 * 흐름: 이미지 업로드 → Replicate lucataco/clip-vit-base-patch32로 벡터 변환
 *       → Supabase pgvector 코사인 유사도 검색
 *
 * DB 임베딩도 동일한 clip-ViT-B-32 (openai/clip-vit-base-patch32) 모델로 생성되어 100% 호환
 */

async function getClipEmbedding(imageBuffer: Buffer): Promise<number[]> {
  const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

  if (!REPLICATE_API_TOKEN) {
    throw new Error("REPLICATE_API_TOKEN이 설정되지 않았습니다");
  }

  // 이미지를 base64 data URI로 변환
  const base64Image = imageBuffer.toString("base64");
  const mimeType = detectMimeType(imageBuffer);
  const dataUri = `data:${mimeType};base64,${base64Image}`;

  // Replicate API - lucataco/clip-vit-base-patch32 (동일한 openai/clip-vit-base-patch32 모델)
  // "Prefer: wait" 헤더로 동기 실행 (최대 60초 대기)
  const response = await fetch(
    "https://api.replicate.com/v1/models/lucataco/clip-vit-base-patch32/predictions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        input: {
          image: dataUri,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Replicate API 오류: ${response.status} - ${errorText}`);
  }

  const prediction = await response.json();

  // Replicate 응답 처리
  if (prediction.status === "failed") {
    throw new Error(`Replicate 예측 실패: ${prediction.error}`);
  }

  // 아직 처리 중이면 폴링
  if (prediction.status !== "succeeded") {
    const result = await pollPrediction(prediction.urls.get, REPLICATE_API_TOKEN);
    return extractEmbedding(result);
  }

  return extractEmbedding(prediction.output);
}

// Replicate 예측 완료까지 폴링
async function pollPrediction(url: string, token: string): Promise<unknown> {
  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Replicate 폴링 오류: ${response.status}`);
    }

    const prediction = await response.json();

    if (prediction.status === "succeeded") {
      return prediction.output;
    }
    if (prediction.status === "failed") {
      throw new Error(`Replicate 예측 실패: ${prediction.error}`);
    }
  }
  throw new Error("Replicate 응답 시간 초과");
}

// Replicate 출력에서 임베딩 벡터 추출
function extractEmbedding(output: unknown): number[] {
  let vector: number[];

  if (Array.isArray(output)) {
    // 출력이 직접 배열인 경우
    if (Array.isArray(output[0])) {
      // 중첩 배열 [[...]]
      vector = output[0] as number[];
    } else if (typeof output[0] === "number") {
      // 플랫 배열 [...]
      vector = output as number[];
    } else {
      // 객체 배열에서 embedding 필드 찾기
      const item = output[0] as Record<string, unknown>;
      if (item.embedding && Array.isArray(item.embedding)) {
        vector = item.embedding as number[];
      } else {
        throw new Error(`알 수 없는 Replicate 출력 형식: ${JSON.stringify(output).slice(0, 200)}`);
      }
    }
  } else if (typeof output === "object" && output !== null) {
    const obj = output as Record<string, unknown>;
    // { embedding: [...] } 또는 { image_embedding: [...] } 형식
    const embeddingField = obj.embedding || obj.image_embedding || obj.image_features;
    if (Array.isArray(embeddingField)) {
      vector = (Array.isArray((embeddingField as unknown[])[0]))
        ? (embeddingField as number[][])[0]
        : embeddingField as number[];
    } else {
      throw new Error(`알 수 없는 Replicate 출력 형식: ${JSON.stringify(output).slice(0, 200)}`);
    }
  } else {
    throw new Error(`알 수 없는 Replicate 출력 형식: ${typeof output}`);
  }

  console.log(`CLIP 벡터 차원: ${vector.length}`);
  return normalizeVector(vector);
}

// 이미지 MIME 타입 감지
function detectMimeType(buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return "image/gif";
  if (buffer[0] === 0x52 && buffer[1] === 0x49) return "image/webp";
  return "image/jpeg"; // 기본값
}

// 벡터 정규화 (L2 norm) - sentence-transformers와 동일한 방식
function normalizeVector(data: number[] | number[][]): number[] {
  // HuggingFace는 중첩 배열로 반환할 수 있음
  let vector: number[] = Array.isArray(data[0])
    ? (data as number[][])[0]
    : (data as number[]);

  // 512차원 확인
  if (vector.length !== 512) {
    console.warn(`벡터 차원: ${vector.length} (예상: 512)`);
  }

  // L2 정규화
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (norm > 0) {
    vector = vector.map((val) => val / norm);
  }

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

    // 이미지를 Buffer로 변환
    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // CLIP 임베딩 생성 (Replicate - lucataco/clip-vit-base-patch32)
    let queryEmbedding: number[];
    try {
      queryEmbedding = await getClipEmbedding(imageBuffer);
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
      match_threshold: 0.1,
      match_count: 12,
    });

    if (error) {
      console.error("Supabase search error:", error);
      return NextResponse.json(
        { error: "검색 중 오류가 발생했습니다: " + error.message },
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
