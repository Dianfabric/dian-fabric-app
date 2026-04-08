import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import {
  PATTERN_LABELS,
  COLOR_LABELS,
  ALLOWED_FABRIC_TYPES,
  SUB_PATTERN_TYPES,
} from "@/lib/classification-labels";

export const dynamic = "force-dynamic";

/**
 * 원단 자동 분류 API
 *
 * POST: 임베딩 벡터를 받아 패턴/색상 분류 결과 반환
 * body: { embedding: number[], fabricId?: string }
 */

// 라벨 임베딩 캐시 (서버 시작 시 lazy 로드)
let labelEmbeddings: {
  patterns: Record<string, number[]>;
  colors: Record<string, number[]>;
} | null = null;

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
    const normalized = l2Normalize(embedding);

    // 패턴 분류 (1등)
    let bestPattern = "";
    let bestPatternScore = -1;
    for (const [label, textEmb] of Object.entries(patterns)) {
      const score = cosineSimilarity(normalized, textEmb);
      if (score > bestPatternScore) {
        bestPatternScore = score;
        bestPattern = label;
      }
    }

    // 색상 분류 (다중 태깅: 1등 대비 95% 이상이면 모두 포함, 최대 3개)
    const colorScores: { label: string; score: number }[] = [];
    for (const [label, textEmb] of Object.entries(colors)) {
      const score = cosineSimilarity(normalized, textEmb);
      colorScores.push({ label, score });
    }
    colorScores.sort((a, b) => b.score - a.score);

    const topScore = colorScores[0].score;
    const matchedColors = colorScores
      .filter((c) => c.score >= topScore * 0.95)
      .slice(0, 3)
      .map((c) => c.label);

    const isSubPattern = SUB_PATTERN_TYPES.includes(bestPattern);
    let fabricType = isSubPattern ? "패턴" : bestPattern;
    if (!ALLOWED_FABRIC_TYPES.includes(fabricType)) fabricType = "무지";
    const patternDetail = isSubPattern ? bestPattern : null;
    const colorStr = matchedColors.join(",");

    const result = {
      fabric_type: fabricType,
      pattern_detail: patternDetail,
      colors: matchedColors,
      color_str: colorStr,
      pattern_score: bestPatternScore,
      color_scores: colorScores.slice(0, 5),
    };

    // fabricId가 있으면 DB 업데이트
    if (fabricId) {
      const supabase = createServiceClient();
      const { error } = await supabase
        .from("fabrics")
        .update({
          fabric_type: fabricType,
          pattern_detail: patternDetail,
          notes: colorStr,
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
