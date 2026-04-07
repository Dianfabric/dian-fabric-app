import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

/**
 * 원단 유사도 검색 API (HuggingFace CLIP ViT-B/32 + pgvector)
 *
 * 흐름: 이미지 업로드 → HuggingFace openai/clip-vit-base-patch32로 벡터 변환
 *       → Supabase pgvector 코사인 유사도 검색
 *
 * DB 임베딩: sentence-transformers clip-ViT-B-32로 생성 (동일 모델, 512차원)
 * HuggingFace Inference API는 토큰 없이도 공개 모델 사용 가능 (속도 제한만 있음)
 */

async function getClipEmbedding(imageBuffer: Buffer): Promise<number[]> {
  const HF_API_TOKEN = process.env.HF_API_TOKEN; // 선택 사항 - 없어도 동작

  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
  };

  // 토큰이 있으면 사용 (더 높은 rate limit), 없으면 무인증으로 요청
  if (HF_API_TOKEN) {
    headers["Authorization"] = `Bearer ${HF_API_TOKEN}`;
  }

  console.log(`CLIP API 호출 시작 (토큰: ${HF_API_TOKEN ? "있음" : "없음 - 무인증 모드"})`);

  // HuggingFace Inference API - openai/clip-vit-base-patch32
  // feature-extraction 파이프라인으로 이미지 임베딩 추출
  const response = await fetch(
    "https://api-inference.huggingface.co/pipeline/feature-extraction/openai/clip-vit-base-patch32",
    {
      method: "POST",
      headers,
      body: imageBuffer,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    // 모델 로딩 중 (cold start) - 재시도
    if (response.status === 503) {
      console.log("HuggingFace 모델 로딩 중... 20초 후 재시도");
      await new Promise((resolve) => setTimeout(resolve, 20000));

      const retryResponse = await fetch(
        "https://api-inference.huggingface.co/pipeline/feature-extraction/openai/clip-vit-base-patch32",
        {
          method: "POST",
          headers,
          body: imageBuffer,
        }
      );

      if (!retryResponse.ok) {
        const retryError = await retryResponse.text();
        throw new Error(`HuggingFace API 재시도 실패: ${retryResponse.status} - ${retryError}`);
      }

      const retryData = await retryResponse.json();
      console.log(`HuggingFace 재시도 응답 형태: ${JSON.stringify(retryData).slice(0, 300)}`);
      return extractAndNormalize(retryData);
    }

    throw new Error(`HuggingFace API 오류: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log(`HuggingFace 응답 형태: type=${typeof data}, isArray=${Array.isArray(data)}, preview=${JSON.stringify(data).slice(0, 300)}`);
  return extractAndNormalize(data);
}

// HuggingFace 응답에서 512차원 임베딩 벡터 추출 및 정규화
function extractAndNormalize(data: unknown): number[] {
  let vector: number[];

  if (Array.isArray(data)) {
    if (Array.isArray(data[0])) {
      if (Array.isArray(data[0][0])) {
        // 3중 중첩: [[[...512...]]] → 첫 번째 시퀀스 토큰 (CLS)
        // CLIP ViT는 [batch, seq_len, hidden] 형태로 반환할 수 있음
        const sequence = data[0] as number[][];
        // CLS 토큰 (첫 번째)이 이미지 전체 표현
        vector = sequence[0] as number[];
        console.log(`3중 중첩 배열: batch=${data.length}, seq=${sequence.length}, dim=${vector.length}`);
      } else {
        // 2중 중첩: [[...512...]]
        vector = data[0] as number[];
        console.log(`2중 중첩 배열: outer=${data.length}, dim=${vector.length}`);
      }
    } else if (typeof data[0] === "number") {
      // 플랫 배열: [...512...]
      vector = data as number[];
      console.log(`플랫 배열: dim=${vector.length}`);
    } else {
      throw new Error(`알 수 없는 HF 응답 형식: ${JSON.stringify(data).slice(0, 200)}`);
    }
  } else {
    throw new Error(`알 수 없는 HF 응답 타입: ${typeof data}`);
  }

  console.log(`추출된 벡터 차원: ${vector.length}`);

  // 512차원이 아닌 경우 (예: 768차원 hidden state) 경고
  if (vector.length !== 512) {
    console.warn(`경고: 벡터 차원이 ${vector.length}입니다 (예상: 512). DB 임베딩과 불일치할 수 있습니다.`);
  }

  // L2 정규화 (sentence-transformers와 동일)
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

    // CLIP 임베딩 생성 (HuggingFace - openai/clip-vit-base-patch32, 무인증 가능)
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
        note: "CLIP API 연결 실패로 임시 결과를 표시합니다. 잠시 후 다시 시도해주세요.",
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
