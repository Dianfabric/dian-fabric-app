/**
 * 전체 원단 이미지에서 평균 RGB 추출
 * → notes 컬럼에 |rgb:R,G,B 형태로 저장
 * → 검색 시 색상 유사도 비교에 사용
 */

import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const sharp = require("sharp");
import fs from "fs";

// ─── 설정 ───
const envContent = fs.readFileSync(".env.local", "utf-8");
const env = {};
envContent.split("\n").forEach((line) => {
  const [key, ...vals] = line.split("=");
  if (key && vals.length) env[key.trim()] = vals.join("=").trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const CONCURRENCY = 10;

// ─── 이미지에서 평균 RGB 추출 ───
async function extractAvgRGB(imageUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const res = await fetch(imageUrl, { signal: controller.signal });
  clearTimeout(timeout);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  // 이미지 중앙 영역 크롭 (테두리 제거) → 리사이즈 → 평균 RGB
  const metadata = await sharp(buffer).metadata();
  const w = metadata.width || 200;
  const h = metadata.height || 200;

  // 중앙 70% 영역만 (테두리/배경 제외)
  const cropW = Math.floor(w * 0.7);
  const cropH = Math.floor(h * 0.7);
  const left = Math.floor((w - cropW) / 2);
  const top = Math.floor((h - cropH) / 2);

  const { data, info } = await sharp(buffer)
    .extract({ left, top, width: cropW, height: cropH })
    .resize(50, 50, { fit: "cover" }) // 작게 리사이즈
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 픽셀별 RGB 평균
  let totalR = 0, totalG = 0, totalB = 0;
  const pixels = info.width * info.height;
  const channels = info.channels;

  for (let i = 0; i < data.length; i += channels) {
    totalR += data[i];
    totalG += data[i + 1];
    totalB += data[i + 2];
  }

  return {
    r: Math.round(totalR / pixels),
    g: Math.round(totalG / pixels),
    b: Math.round(totalB / pixels),
  };
}

// ─── 메인 ───
async function main() {
  console.log("=== 원단 이미지 평균 RGB 추출 ===\n");
  const startTime = Date.now();

  // RGB 없는 원단 로드 (notes에 |rgb: 가 없는 것)
  let allFabrics = [];
  let page = 0;
  while (true) {
    const from = page * 1000;
    const { data, error } = await supabase
      .from("fabrics")
      .select("id, name, image_url, notes")
      .not("image_url", "is", null)
      .range(from, from + 999);
    if (error) { console.error("DB 에러:", error.message); break; }
    if (!data || data.length === 0) break;
    allFabrics = allFabrics.concat(data);
    if (data.length < 1000) break;
    page++;
  }

  // 이미 RGB 있는 것 필터링
  const needRGB = allFabrics.filter((f) => {
    const notes = f.notes || "";
    return !notes.includes("|rgb:");
  });

  console.log(`전체: ${allFabrics.length}개`);
  console.log(`RGB 필요: ${needRGB.length}개\n`);

  if (needRGB.length === 0) {
    console.log("모든 원단에 RGB가 이미 있습니다!");
    return;
  }

  let success = 0;
  let errors = 0;
  const errorList = [];

  for (let i = 0; i < needRGB.length; i += CONCURRENCY) {
    const batch = needRGB.slice(i, i + CONCURRENCY);

    await Promise.allSettled(
      batch.map(async (fabric) => {
        try {
          const rgb = await extractAvgRGB(fabric.image_url);
          const rgbStr = `|rgb:${rgb.r},${rgb.g},${rgb.b}`;
          const newNotes = (fabric.notes || "") + rgbStr;

          const { error } = await supabase
            .from("fabrics")
            .update({ notes: newNotes })
            .eq("id", fabric.id);

          if (error) throw error;
          success++;
        } catch (err) {
          errors++;
          if (errorList.length < 10) {
            errorList.push(`${fabric.name}: ${err.message?.slice(0, 60)}`);
          }
        }
      })
    );

    const done = i + batch.length;
    if (done % 200 < CONCURRENCY || done <= CONCURRENCY) {
      const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
      const perSec = done / ((Date.now() - startTime) / 1000);
      const remainMin = Math.ceil((needRGB.length - done) / (perSec || 1) / 60);
      console.log(`  [${done}/${needRGB.length}] ✓${success} ✗${errors} | ${elapsed}분 경과, ~${remainMin}분 남음`);
    }
  }

  if (errorList.length > 0) {
    console.log("\n에러 샘플:");
    errorList.forEach((e) => console.log(`  ${e}`));
  }

  const totalMin = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log(`\n=== RGB 추출 완료 ===`);
  console.log(`  성공: ${success}개`);
  console.log(`  실패: ${errors}개`);
  console.log(`  소요시간: ${totalMin}분`);
}

main().catch(console.error);
