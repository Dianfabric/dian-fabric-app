import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * 원단 자동 분류 API
 *
 * POST: 임베딩 벡터를 받아 패턴/색상 분류 결과 반환
 * - 새 원단 업로드 시 호출하여 fabric_type, pattern_detail, notes(색상) 자동 설정
 * - 기존 원단 재분류에도 사용 가능
 *
 * body: { embedding: number[], fabricId?: string }
 * - fabricId가 있으면 DB 직접 업데이트
 * - 없으면 분류 결과만 반환
 */

// 패턴 라벨 텍스트 임베딩 (서버 시작 시 lazy 로드)
let labelEmbeddings: {
  patterns: Record<string, number[]>;
  colors: Record<string, number[]>;
} | null = null;

const PATTERN_LABELS: Record<string, string[]> = {
  "무지": ["solid plain fabric", "무지 원단 단색"],
  "벨벳": ["velvet fabric soft plush", "벨벳 원단 부드러운"],
  "스웨이드": ["suede fabric matte", "스웨이드 원단 매트"],
  "인조가죽": ["faux leather fabric synthetic", "인조가죽 원단"],
  "부클": ["boucle textured curly yarn fabric", "부클레 원단 곱슬 질감"],
  "하운드투스": ["houndstooth pattern fabric", "하운드투스 패턴 원단"],
  "스트라이프": ["stripe striped pattern fabric", "스트라이프 줄무늬 원단"],
  "체크": ["check checkered plaid pattern fabric", "체크 격자무늬 원단"],
  "헤링본": ["herringbone pattern fabric", "헤링본 패턴 원단"],
  "추상": ["abstract artistic pattern fabric", "추상 예술적 패턴 원단"],
  "자연": ["nature landscape scenic pattern fabric", "자연 풍경 패턴 원단"],
  "동물": ["animal print pattern fabric leopard zebra", "동물 무늬 패턴 원단"],
  "식물": ["floral botanical plant leaf pattern fabric", "식물 꽃 잎 패턴 원단"],
  "큰패턴": ["large bold pattern fabric big motif", "큰패턴 대형 무늬 원단"],
};

const COLOR_LABELS: Record<string, string[]> = {
  "화이트": ["white bright clean fabric", "흰색 화이트 원단"],
  "아이보리": ["ivory cream off-white warm fabric", "아이보리 크림색 원단"],
  "베이지": ["beige tan sand khaki fabric", "베이지 탄 모래색 원단"],
  "브라운": ["brown chocolate coffee dark brown fabric", "갈색 브라운 초콜릿 원단"],
  "그레이": ["gray grey silver neutral fabric", "회색 그레이 원단"],
  "블랙": ["black dark charcoal fabric", "검정 블랙 원단"],
  "네이비": ["navy dark blue deep blue fabric", "네이비 남색 진한파랑 원단"],
  "블루": ["blue sky blue cobalt fabric", "파란색 블루 원단"],
  "그린": ["green emerald olive forest fabric", "초록색 그린 원단"],
  "레드": ["red crimson scarlet burgundy fabric", "빨간색 레드 원단"],
  "핑크": ["pink rose blush fabric", "핑크 분홍색 원단"],
  "옐로우": ["yellow golden bright fabric", "노란색 옐로우 원단"],
  "오렌지": ["orange tangerine amber fabric", "주황색 오렌지 원단"],
  "퍼플": ["purple violet lavender fabric", "보라색 퍼플 원단"],
  "민트": ["mint teal aqua turquoise fabric", "민트 청록색 원단"],
};

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function l2Normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? vec.map((v) => v / norm) : vec;
}

async function getTextEmbedding(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tokenizer: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  text: string
): Promise<number[]> {
  const inputs = tokenizer(text, { padding: true, truncation: true });
  const output = await model(inputs);
  const rawData = output.text_embeds?.data || output.text_embeddings?.data;
  if (!rawData) throw new Error("텍스트 임베딩 추출 실패");
  return l2Normalize(Array.from(rawData));
}

async function ensureLabelEmbeddings() {
  if (labelEmbeddings) return labelEmbeddings;

  const {
    AutoTokenizer,
    CLIPTextModelWithProjection,
    env,
  } = await import("@huggingface/transformers");
  env.allowLocalModels = false;

  const tokenizer = await AutoTokenizer.from_pretrained("Xenova/clip-vit-base-patch32");
  const model = await CLIPTextModelWithProjection.from_pretrained(
    "Xenova/clip-vit-base-patch32",
    { dtype: "q8" }
  );

  const patterns: Record<string, number[]> = {};
  for (const [label, texts] of Object.entries(PATTERN_LABELS)) {
    const embeddings = await Promise.all(
      texts.map((t) => getTextEmbedding(tokenizer, model, t))
    );
    const avg = embeddings[0].map((_, i) =>
      embeddings.reduce((sum, emb) => sum + emb[i], 0) / embeddings.length
    );
    patterns[label] = l2Normalize(avg);
  }

  const colors: Record<string, number[]> = {};
  for (const [label, texts] of Object.entries(COLOR_LABELS)) {
    const embeddings = await Promise.all(
      texts.map((t) => getTextEmbedding(tokenizer, model, t))
    );
    const avg = embeddings[0].map((_, i) =>
      embeddings.reduce((sum, emb) => sum + emb[i], 0) / embeddings.length
    );
    colors[label] = l2Normalize(avg);
  }

  labelEmbeddings = { patterns, colors };
  return labelEmbeddings;
}

function classify(embedding: number[], labels: Record<string, number[]>) {
  const normalized = l2Normalize(embedding);
  let best = "";
  let bestScore = -1;
  for (const [label, textEmb] of Object.entries(labels)) {
    const score = cosineSimilarity(normalized, textEmb);
    if (score > bestScore) {
      bestScore = score;
      best = label;
    }
  }
  return { label: best, score: bestScore };
}

export async function POST(request: NextRequest) {
  try {
    const { embedding, fabricId } = await request.json();

    if (!embedding || !Array.isArray(embedding) || embedding.length !== 512) {
      return NextResponse.json(
        { error: "512차원 임베딩 벡터가 필요합니다" },
        { status: 400 }
      );
    }

    const { patterns, colors } = await ensureLabelEmbeddings();

    const patternResult = classify(embedding, patterns);
    const colorResult = classify(embedding, colors);

    const ALLOWED_TYPES = ["무지", "벨벳", "패턴", "스웨이드", "인조가죽"];
    const SUB_PATTERNS = [
      "부클", "하운드투스", "스트라이프", "체크", "헤링본",
      "추상", "자연", "동물", "식물", "큰패턴",
    ];

    const isSubPattern = SUB_PATTERNS.includes(patternResult.label);
    let fabricType = isSubPattern ? "패턴" : patternResult.label;
    if (!ALLOWED_TYPES.includes(fabricType)) fabricType = "무지";
    const patternDetail = isSubPattern ? patternResult.label : null;

    const result = {
      fabric_type: fabricType,
      pattern_detail: patternDetail,
      color: colorResult.label,
      pattern_score: patternResult.score,
      color_score: colorResult.score,
    };

    // fabricId가 있으면 DB 업데이트
    if (fabricId) {
      const supabase = createServiceClient();
      const { error } = await supabase
        .from("fabrics")
        .update({
          fabric_type: fabricType,
          pattern_detail: patternDetail,
          notes: colorResult.label,
          auto_classified: true,
        })
        .eq("id", fabricId);

      if (error) {
        return NextResponse.json(
          { error: "DB 업데이트 실패: " + error.message, ...result },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Classify API error:", err);
    return NextResponse.json(
      { error: "분류 서버 오류" },
      { status: 500 }
    );
  }
}
