import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// Vercel 서버리스 함수 설정: 첫 호출 시 모델 로딩에 시간 필요
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * 원단 유사도 검색 API (Transformers.js CLIP ViT-B/32 + pgvector)
 *
 * 흐름: 이미지 업로드 → Transformers.js로 CLIP 임베딩 직접 생성 (서버 내 실행)
 *       → Supabase pgvector 코사인 유사도 검색
 *
 * DB 임베딩: sentence-transformers clip-ViT-B-32로 생성 (동일 모델, 512차원)
 * Transformers.js는 동일한 openai/clip-vit-base-patch32 모델의 ONNX 버전 사용
 * 외부 API 불필요 - 서버에서 직접 실행하여 정확도 보장
 */

// 모델 싱글톤 (서버리스 함수 인스턴스 내에서 재사용)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let processorPromise: Promise<any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let modelPromise: Promise<any> | null = null;

async function loadModel() {
  if (!processorPromise || !modelPromise) {
    // 동적 import (Transformers.js는 ESM)
    const { AutoProcessor, CLIPVisionModelWithProjection, env } =
      await import("@xenova/transformers");

    // 로컬 모델 비활성화, 원격에서 다운로드
    env.allowLocalModels = false;
    // Vercel 서버리스에서 /tmp에 캐시
    env.cacheDir = "/tmp/transformers-cache";

    console.log("CLIP 모델 로딩 시작...");

    processorPromise = AutoProcessor.from_pretrained(
      "Xenova/clip-vit-base-patch32"
    );
    modelPromise = CLIPVisionModelWithProjection.from_pretrained(
      "Xenova/clip-vit-base-patch32",
      { quantized: false } // fp32로 정확도 극대화 (DB 임베딩과 일치)
    );
  }

  const [processor, model] = await Promise.all([
    processorPromise,
    modelPromise,
  ]);
  console.log("CLIP 모델 로딩 완료");
  return { processor, model };
}

async function getClipEmbedding(imageBuffer: Buffer): Promise<number[]> {
  const { RawImage } = await import("@xenova/transformers");
  const { processor, model } = await loadModel();

  // Buffer → RawImage 변환 (Uint8Array로 변환 후 Blob 생성)
  const uint8Array = new Uint8Array(imageBuffer);
  const blob = new Blob([uint8Array]);
  const image = await RawImage.fromBlob(blob);

  // 이미지 전처리 (CLIP 프로세서가 리사이즈, 정규화 등 처리)
  const imageInputs = await processor(image);

  // CLIP 비전 모델로 임베딩 생성
  const output = await model(imageInputs);

  // image_embeds: 512차원 벡터 (projection head 통과 후)
  const embeddings = output.image_embeds;
  const vector: number[] = Array.from(embeddings.data as Float32Array);

  console.log(`CLIP 임베딩 생성 완료: ${vector.length}차원`);

  // L2 정규화 (sentence-transformers와 동일)
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (norm > 0) {
    return vector.map((val) => val / norm);
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

    // CLIP 임베딩 생성 (Transformers.js - 서버 내 직접 실행)
    let queryEmbedding: number[];
    try {
      queryEmbedding = await getClipEmbedding(imageBuffer);
    } catch (clipError) {
      console.error("CLIP 모델 오류:", clipError);
      return NextResponse.json(
        {
          error:
            "AI 모델 로딩 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        },
        { status: 503 }
      );
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
