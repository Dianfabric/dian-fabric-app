/**
 * CLIP 벡터 기반 원단 자동 분류 스크립트
 *
 * 각 원단의 임베딩 벡터를 카테고리/색상 텍스트 임베딩과 비교하여
 * pattern_detail(패턴 상세), category(색상) 컬럼을 자동 업데이트
 *
 * 실행: node scripts/classify-fabrics.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { AutoTokenizer, CLIPTextModelWithProjection, env } from "@huggingface/transformers";

env.allowLocalModels = false;

// ─── Supabase 설정 (.env.local에서 읽기) ───
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
const envVars = {};
envContent.split("\n").forEach((line) => {
  const [key, ...vals] = line.split("=");
  if (key && vals.length) envVars[key.trim()] = vals.join("=").trim();
});

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = envVars.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ .env.local에서 Supabase 키를 찾을 수 없습니다");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── 분류 라벨 정의 ───
const PATTERN_LABELS = {
  "무지": ["solid plain fabric", "무지 원단 단색"],
  "벨벳": ["velvet fabric soft plush", "벨벳 원단 부드러운"],
  "스웨이드": ["suede fabric matte", "스웨이드 원단 매트"],
  "인조가죽": ["faux leather fabric synthetic", "인조가죽 원단"],
  "린넨": ["linen fabric natural texture", "린넨 원단 자연스러운"],
  "자카드": ["jacquard woven pattern fabric", "자카드 직물 원단"],
  "시어": ["sheer transparent fabric", "시어 투명 원단"],
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

const COLOR_LABELS = {
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

// ─── 유틸 ───
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function l2Normalize(vec) {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? vec.map((v) => v / norm) : vec;
}

async function getTextEmbedding(tokenizer, model, text) {
  const inputs = tokenizer(text, { padding: true, truncation: true });
  const output = await model(inputs);
  const rawData = output.text_embeds?.data || output.text_embeddings?.data;
  if (!rawData) throw new Error("텍스트 임베딩 추출 실패");
  return l2Normalize(Array.from(rawData));
}

// ─── 메인 ───
async function main() {
  console.log("=== CLIP 벡터 기반 원단 자동 분류 ===\n");

  // 1. CLIP 텍스트 모델 로드
  console.log("[1/4] CLIP 텍스트 모델 로딩...");
  const tokenizer = await AutoTokenizer.from_pretrained("Xenova/clip-vit-base-patch32");
  const model = await CLIPTextModelWithProjection.from_pretrained(
    "Xenova/clip-vit-base-patch32",
    { dtype: "q8" }
  );
  console.log("  ✓ 모델 로드 완료\n");

  // 2. 카테고리/색상 텍스트 임베딩 생성
  console.log("[2/4] 카테고리 & 색상 텍스트 임베딩 생성...");

  const patternEmbeddings = {};
  for (const [label, texts] of Object.entries(PATTERN_LABELS)) {
    // 여러 텍스트의 임베딩 평균으로 더 정확하게
    const embeddings = await Promise.all(
      texts.map((t) => getTextEmbedding(tokenizer, model, t))
    );
    const avg = embeddings[0].map((_, i) =>
      embeddings.reduce((sum, emb) => sum + emb[i], 0) / embeddings.length
    );
    patternEmbeddings[label] = l2Normalize(avg);
  }
  console.log(`  ✓ 패턴 ${Object.keys(patternEmbeddings).length}개 라벨 준비`);

  const colorEmbeddings = {};
  for (const [label, texts] of Object.entries(COLOR_LABELS)) {
    const embeddings = await Promise.all(
      texts.map((t) => getTextEmbedding(tokenizer, model, t))
    );
    const avg = embeddings[0].map((_, i) =>
      embeddings.reduce((sum, emb) => sum + emb[i], 0) / embeddings.length
    );
    colorEmbeddings[label] = l2Normalize(avg);
  }
  console.log(`  ✓ 색상 ${Object.keys(colorEmbeddings).length}개 라벨 준비\n`);

  // 3. Supabase에서 원단 데이터 가져오기
  console.log("[3/4] Supabase에서 원단 데이터 로드...");

  let allFabrics = [];
  let page = 0;
  const pageSize = 1000; // Supabase 최대 1000

  while (true) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    console.log(`  로딩 중... (${from}~${to})`);

    const { data, error } = await supabase
      .from("fabrics")
      .select("id, name, color_code, embedding, fabric_type, pattern_detail, category")
      .not("embedding", "is", null)
      .range(from, to);

    if (error) {
      console.error("  DB 오류:", error.message);
      break;
    }
    if (!data || data.length === 0) break;
    allFabrics = allFabrics.concat(data);
    console.log(`  → ${data.length}개 로드 (총 ${allFabrics.length}개)`);
    if (data.length < pageSize) break; // 마지막 페이지
    page++;
  }

  console.log(`  ✓ 총 ${allFabrics.length}개 원단 로드 완료\n`);

  // 4. 분류 실행
  console.log("[4/4] 분류 시작...\n");

  let updated = 0;
  let errors = 0;

  for (let i = 0; i < allFabrics.length; i++) {
    const fabric = allFabrics[i];

    // embedding은 string으로 올 수 있음 (pgvector)
    let embedding = fabric.embedding;
    if (typeof embedding === "string") {
      embedding = JSON.parse(embedding.replace(/^\[/, "[").replace(/\]$/, "]"));
    }
    if (!Array.isArray(embedding) || embedding.length !== 512) {
      console.log(`  ⚠ ${fabric.name}: 임베딩 형식 오류 (스킵)`);
      errors++;
      continue;
    }

    const normalizedEmb = l2Normalize(embedding);

    // 패턴 분류
    let bestPattern = "";
    let bestPatternScore = -1;
    for (const [label, textEmb] of Object.entries(patternEmbeddings)) {
      const score = cosineSimilarity(normalizedEmb, textEmb);
      if (score > bestPatternScore) {
        bestPatternScore = score;
        bestPattern = label;
      }
    }

    // 색상 분류
    let bestColor = "";
    let bestColorScore = -1;
    for (const [label, textEmb] of Object.entries(colorEmbeddings)) {
      const score = cosineSimilarity(normalizedEmb, textEmb);
      if (score > bestColorScore) {
        bestColorScore = score;
        bestColor = label;
      }
    }

    // DB CHECK 제약조건:
    //   fabric_type: 무지, 벨벳, 패턴, 스웨이드, 인조가죽 (5개만)
    //   category: 용도 전용 (색상 저장 불가)
    //   pattern_detail: 제한 없음
    //   notes: 제한 없음 → 색상 저장용
    const ALLOWED_TYPES = ["무지", "벨벳", "패턴", "스웨이드", "인조가죽"];
    const SUB_PATTERNS = [
      "부클", "하운드투스", "스트라이프", "체크", "헤링본",
      "추상", "자연", "동물", "식물", "큰패턴"
    ];

    const isSubPattern = SUB_PATTERNS.includes(bestPattern);
    // 린넨/자카드/시어는 DB에 허용 안 됨 → 가장 가까운 허용 타입으로
    let fabricType = isSubPattern ? "패턴" : bestPattern;
    if (!ALLOWED_TYPES.includes(fabricType)) {
      fabricType = "무지"; // 린넨/자카드/시어 등은 일단 무지로 (나중에 제약조건 수정 필요)
    }
    const patternDetail = isSubPattern ? bestPattern : null;

    const updateData = {
      fabric_type: fabricType,
      pattern_detail: patternDetail,
      notes: bestColor, // 색상을 notes에 저장 (category는 CHECK 제약)
      auto_classified: true,
    };

    const { error: updateError } = await supabase
      .from("fabrics")
      .update(updateData)
      .eq("id", fabric.id);

    if (updateError) {
      console.log(`  ✗ ${fabric.name}: 업데이트 실패 - ${updateError.message}`);
      errors++;
    } else {
      updated++;
      const progress = `[${i + 1}/${allFabrics.length}]`;
      console.log(
        `  ${progress} ${fabric.name} → 종류: ${fabricType}${patternDetail ? ` (${patternDetail})` : ""} | 색상: ${bestColor} (${(bestPatternScore * 100).toFixed(1)}% / ${(bestColorScore * 100).toFixed(1)}%)`
      );
    }
  }

  console.log(`\n=== 분류 완료 ===`);
  console.log(`  ✓ 업데이트: ${updated}개`);
  console.log(`  ✗ 오류: ${errors}개`);
  console.log(`  총: ${allFabrics.length}개\n`);
}

main().catch(console.error);
