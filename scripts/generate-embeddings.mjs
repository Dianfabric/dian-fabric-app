/**
 * 임베딩 없는 원단에 대해 CLIP 이미지 임베딩을 생성하는 스크립트
 *
 * 이미지 URL → CLIP 모델 → 512차원 벡터 → Supabase embedding 컬럼 업데이트
 * 이후 classify-fabrics.mjs로 패턴/색상 분류까지 실행
 *
 * 실행: node scripts/generate-embeddings.mjs
 */

import { createClient } from "@supabase/supabase-js";
import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
} from "@huggingface/transformers";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

env.allowLocalModels = false;

// ─── .env.local 로드 ───
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

// ─── 설정 ───
const CONCURRENCY = 5; // 동시 처리 수
const BATCH_SIZE = 100; // DB 조회 배치 크기

// ─── 유틸 ───
function l2Normalize(vec) {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? vec.map((v) => v / norm) : vec;
}

// ─── 메인 ───
async function main() {
  console.log("=== CLIP 이미지 임베딩 생성 ===\n");

  // 1. CLIP 모델 로드
  console.log("[1/3] CLIP Vision 모델 로딩...");
  const startLoad = Date.now();
  const [processor, model] = await Promise.all([
    AutoProcessor.from_pretrained("Xenova/clip-vit-base-patch32"),
    CLIPVisionModelWithProjection.from_pretrained("Xenova/clip-vit-base-patch32", {
      dtype: "q8",
    }),
  ]);
  console.log(`  ✓ 모델 로드 완료 (${((Date.now() - startLoad) / 1000).toFixed(1)}초)\n`);

  // 2. 임베딩 없는 원단 로드
  console.log("[2/3] 임베딩 없는 원단 목록 로드...");
  let allFabrics = [];
  let page = 0;

  while (true) {
    const from = page * 1000;
    const to = from + 999;
    const { data, error } = await supabase
      .from("fabrics")
      .select("id, name, image_url")
      .is("embedding", null)
      .not("image_url", "is", null)
      .range(from, to);

    if (error) {
      console.error("  DB 오류:", error.message);
      break;
    }
    if (!data || data.length === 0) break;
    allFabrics = allFabrics.concat(data);
    if (data.length < 1000) break;
    page++;
  }
  console.log(`  ✓ ${allFabrics.length}개 원단 (임베딩 필요)\n`);

  if (allFabrics.length === 0) {
    console.log("  모든 원단에 임베딩이 이미 있습니다!");
    return;
  }

  // 3. 임베딩 생성
  console.log(`[3/3] 임베딩 생성 시작 (동시 ${CONCURRENCY}개)...\n`);

  let success = 0;
  let failed = 0;
  const startTime = Date.now();

  // 워커 함수
  async function processOne(fabric) {
    try {
      // 이미지 다운로드
      const image = await RawImage.fromURL(fabric.image_url);

      // CLIP 임베딩 생성
      const imageInputs = await processor(image);
      const output = await model(imageInputs);

      let rawData = null;
      if (output.image_embeds) rawData = output.image_embeds.data;
      else if (output.image_embeddings) rawData = output.image_embeddings.data;
      if (!rawData || rawData.length === 0) throw new Error("임베딩 추출 실패");

      const vector = l2Normalize(Array.from(rawData));
      const vectorString = `[${vector.join(",")}]`;

      // DB 업데이트
      const { error } = await supabase
        .from("fabrics")
        .update({ embedding: vectorString })
        .eq("id", fabric.id);

      if (error) throw new Error(error.message);

      success++;
      return true;
    } catch (err) {
      failed++;
      console.log(`  ✗ ${fabric.name}: ${err.message}`);
      return false;
    }
  }

  // 배치 처리 (동시 CONCURRENCY개씩)
  for (let i = 0; i < allFabrics.length; i += CONCURRENCY) {
    const batch = allFabrics.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(processOne));

    const done = i + batch.length;
    const elapsed = (Date.now() - startTime) / 1000;
    const perItem = elapsed / done;
    const remaining = perItem * (allFabrics.length - done);
    const remainMin = Math.ceil(remaining / 60);

    // 50개마다 진행률 표시
    if (done % 50 === 0 || done === allFabrics.length) {
      const pct = ((done / allFabrics.length) * 100).toFixed(1);
      console.log(
        `  [${done}/${allFabrics.length}] ${pct}% | ✓${success} ✗${failed} | 남은시간: ~${remainMin}분`
      );
    }
  }

  const totalMin = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log(`\n=== 임베딩 생성 완료 ===`);
  console.log(`  ✓ 성공: ${success}개`);
  console.log(`  ✗ 실패: ${failed}개`);
  console.log(`  ⏱ 소요시간: ${totalMin}분`);
  console.log(`\n💡 이제 'node scripts/classify-fabrics.mjs'로 분류를 실행하세요.`);
}

main().catch(console.error);
