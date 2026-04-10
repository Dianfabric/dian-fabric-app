/**
 * 전체 원단 이미지에서 주요 색상(최대 3개) + 비율 추출
 * → notes 컬럼에 |rgb:R,G,B:PCT;R,G,B:PCT;R,G,B:PCT 형태로 저장
 * → 검색 시 색상 분포 비교에 사용
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

// ─── K-means 클러스터링 (주요 색상 추출) ───
function kMeansClusters(pixels, k = 3, maxIter = 15) {
  const n = pixels.length;
  if (n === 0) return [];

  // 초기 중심: 균등 간격으로 선택
  const centers = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.floor((i / k) * n);
    centers.push([...pixels[idx]]);
  }

  let assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // 각 픽셀을 가장 가까운 센터에 할당
    let changed = false;
    for (let i = 0; i < n; i++) {
      let minDist = Infinity;
      let best = 0;
      for (let c = 0; c < k; c++) {
        const dr = pixels[i][0] - centers[c][0];
        const dg = pixels[i][1] - centers[c][1];
        const db = pixels[i][2] - centers[c][2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < minDist) { minDist = dist; best = c; }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true; }
    }
    if (!changed) break;

    // 센터 재계산
    for (let c = 0; c < k; c++) {
      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let i = 0; i < n; i++) {
        if (assignments[i] === c) {
          sumR += pixels[i][0]; sumG += pixels[i][1]; sumB += pixels[i][2];
          count++;
        }
      }
      if (count > 0) {
        centers[c] = [Math.round(sumR / count), Math.round(sumG / count), Math.round(sumB / count)];
      }
    }
  }

  // 각 클러스터의 비율 계산
  const counts = new Array(k).fill(0);
  for (let i = 0; i < n; i++) counts[assignments[i]]++;

  const results = [];
  for (let c = 0; c < k; c++) {
    const pct = Math.round((counts[c] / n) * 100);
    if (pct >= 5) { // 5% 미만은 무시
      results.push({ rgb: centers[c], pct });
    }
  }

  // 비율 높은 순 정렬
  results.sort((a, b) => b.pct - a.pct);

  // 비율 합계 100으로 보정
  const total = results.reduce((s, r) => s + r.pct, 0);
  if (total > 0 && total !== 100) {
    results[0].pct += (100 - total);
  }

  return results;
}

// ─── 유사한 색상 병합 ───
function mergeSimiColors(clusters, threshold = 40) {
  const merged = [...clusters];
  for (let i = 0; i < merged.length; i++) {
    for (let j = i + 1; j < merged.length; j++) {
      const dr = merged[i].rgb[0] - merged[j].rgb[0];
      const dg = merged[i].rgb[1] - merged[j].rgb[1];
      const db = merged[i].rgb[2] - merged[j].rgb[2];
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist < threshold) {
        // 가중 평균으로 병합
        const totalPct = merged[i].pct + merged[j].pct;
        const w1 = merged[i].pct / totalPct;
        const w2 = merged[j].pct / totalPct;
        merged[i].rgb = [
          Math.round(merged[i].rgb[0] * w1 + merged[j].rgb[0] * w2),
          Math.round(merged[i].rgb[1] * w1 + merged[j].rgb[1] * w2),
          Math.round(merged[i].rgb[2] * w1 + merged[j].rgb[2] * w2),
        ];
        merged[i].pct = totalPct;
        merged.splice(j, 1);
        j--;
      }
    }
  }
  return merged;
}

// ─── 이미지에서 주요 색상 추출 ───
async function extractDominantColors(imageUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const res = await fetch(imageUrl, { signal: controller.signal });
  clearTimeout(timeout);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const metadata = await sharp(buffer).metadata();
  const w = metadata.width || 200;
  const h = metadata.height || 200;

  // 중앙 70% 크롭
  const cropW = Math.floor(w * 0.7);
  const cropH = Math.floor(h * 0.7);
  const left = Math.floor((w - cropW) / 2);
  const top = Math.floor((h - cropH) / 2);

  const { data, info } = await sharp(buffer)
    .extract({ left, top, width: cropW, height: cropH })
    .resize(50, 50, { fit: "cover" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 픽셀 배열 생성
  const pixels = [];
  const channels = info.channels;
  for (let i = 0; i < data.length; i += channels) {
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }

  // K-means → 병합 → 결과
  let clusters = kMeansClusters(pixels, 4, 20);
  clusters = mergeSimiColors(clusters, 40);

  // 최대 3개까지만
  return clusters.slice(0, 3);
}

// 결과를 문자열로: "R,G,B:PCT;R,G,B:PCT"
function clustersToString(clusters) {
  return clusters.map(c => `${c.rgb[0]},${c.rgb[1]},${c.rgb[2]}:${c.pct}`).join(";");
}

// ─── 메인 ───
async function main() {
  console.log("=== 원단 이미지 주요 색상 추출 (K-means) ===\n");
  const startTime = Date.now();

  // 전체 원단 로드
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

  console.log(`전체: ${allFabrics.length}개\n`);

  let success = 0;
  let errors = 0;
  const errorList = [];

  for (let i = 0; i < allFabrics.length; i += CONCURRENCY) {
    const batch = allFabrics.slice(i, i + CONCURRENCY);

    await Promise.allSettled(
      batch.map(async (fabric) => {
        try {
          const clusters = await extractDominantColors(fabric.image_url);
          const rgbStr = `|rgb:${clustersToString(clusters)}`;

          // 기존 notes에서 이전 rgb 제거 후 새로 추가
          const baseNotes = (fabric.notes || "").replace(/\|rgb:[^\|]*/g, "").trim();
          const newNotes = baseNotes + rgbStr;

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
      const remainMin = Math.ceil((allFabrics.length - done) / (perSec || 1) / 60);
      console.log(`  [${done}/${allFabrics.length}] ✓${success} ✗${errors} | ${elapsed}분 경과, ~${remainMin}분 남음`);
    }
  }

  if (errorList.length > 0) {
    console.log("\n에러 샘플:");
    errorList.forEach((e) => console.log(`  ${e}`));
  }

  const totalMin = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log(`\n=== 색상 추출 완료 ===`);
  console.log(`  성공: ${success}개`);
  console.log(`  실패: ${errors}개`);
  console.log(`  소요시간: ${totalMin}분`);
}

main().catch(console.error);
