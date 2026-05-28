/**
 * 누락된 LAB 클러스터를 이미지에서 직접 추출
 *
 * notes에 RGB 없는 원단들을 이미지에서 K-means로 추출 → LAB 변환
 * Sharp으로 이미지 다운샘플 + 픽셀 분석
 *
 * 사용: node scripts/fill-missing-lab.mjs
 * 예상 시간: ~10분 (2,569개, 16 병렬)
 */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const env = {};
fs.readFileSync(".env.local", "utf-8").split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) env[k.trim()] = v.join("=").trim();
});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// ─── RGB → LAB (D65 illuminant, sRGB) ───
function rgbToLab(r, g, b) {
  let R = r / 255, G = g / 255, B = b / 255;
  R = R > 0.04045 ? Math.pow((R + 0.055) / 1.055, 2.4) : R / 12.92;
  G = G > 0.04045 ? Math.pow((G + 0.055) / 1.055, 2.4) : G / 12.92;
  B = B > 0.04045 ? Math.pow((B + 0.055) / 1.055, 2.4) : B / 12.92;
  const X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) * 100;
  const Y = (R * 0.2126729 + G * 0.7151522 + B * 0.0721750) * 100;
  const Z = (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) * 100;
  const Xn = 95.047, Yn = 100, Zn = 108.883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fX = f(X / Xn), fY = f(Y / Yn), fZ = f(Z / Zn);
  return [116 * fY - 16, 500 * (fX - fY), 200 * (fY - fZ)];
}

// ─── K-means RGB 클러스터링 (가벼운 버전) ───
function kmeans(pixels, k = 5, maxIter = 15) {
  if (pixels.length === 0) return [];
  const n = pixels.length;
  const centroids = [];
  for (let i = 0; i < k; i++) {
    centroids.push([...pixels[Math.floor(Math.random() * n)]]);
  }
  const assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let minDist = Infinity, best = 0;
      for (let j = 0; j < k; j++) {
        const dr = pixels[i][0] - centroids[j][0];
        const dg = pixels[i][1] - centroids[j][1];
        const db = pixels[i][2] - centroids[j][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < minDist) { minDist = d; best = j; }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true; }
    }
    if (!changed) break;

    const sums = Array.from({ length: k }, () => [0, 0, 0]);
    const counts = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      sums[c][0] += pixels[i][0];
      sums[c][1] += pixels[i][1];
      sums[c][2] += pixels[i][2];
      counts[c]++;
    }
    for (let j = 0; j < k; j++) {
      if (counts[j] > 0) {
        centroids[j] = [sums[j][0] / counts[j], sums[j][1] / counts[j], sums[j][2] / counts[j]];
      }
    }
  }

  const counts = new Array(k).fill(0);
  for (const a of assignments) counts[a]++;
  return centroids.map((c, i) => ({ centroid: c, count: counts[i] }));
}

// ─── 이미지에서 LAB 벡터 추출 ───
async function extractLabFromUrl(url) {
  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());

    // 100x100으로 다운샘플 + 픽셀 raw 추출
    const { data, info } = await sharp(buf)
      .resize(100, 100, { fit: "cover" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = [];
    const channels = info.channels;
    for (let i = 0; i < data.length; i += channels) {
      pixels.push([data[i], data[i + 1], data[i + 2]]);
    }
    if (pixels.length === 0) return null;

    // K-means 5개 클러스터
    const clusters = kmeans(pixels, 5);
    clusters.sort((a, b) => b.count - a.count);

    // LAB 15차원 벡터 (5 × L,a,b)
    const labVector = [];
    for (let i = 0; i < 5; i++) {
      if (i < clusters.length && clusters[i].count > 0) {
        const [r, g, b] = clusters[i].centroid;
        labVector.push(...rgbToLab(r, g, b));
      } else {
        labVector.push(0, 0, 0);
      }
    }
    return labVector;
  } catch {
    return null;
  }
}

async function main() {
  console.log("=== 누락 LAB 이미지에서 직접 추출 ===\n");

  // lab_clusters가 NULL인 원단 조회
  let allFabrics = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("fabrics")
      .select("id, image_url")
      .is("lab_clusters", null)
      .not("image_url", "is", null)
      .range(offset, offset + 999);
    if (error) {
      console.error("조회 에러:", error.message);
      break;
    }
    if (!data || data.length === 0) break;
    allFabrics = allFabrics.concat(data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  console.log(`처리 대상: ${allFabrics.length}개\n`);
  if (allFabrics.length === 0) {
    console.log("✅ 모두 처리됨");
    return;
  }

  const CONCURRENCY = 16;
  let success = 0, errors = 0;
  const start = Date.now();

  for (let i = 0; i < allFabrics.length; i += CONCURRENCY) {
    const batch = allFabrics.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (fab) => {
        const labVec = await extractLabFromUrl(fab.image_url);
        if (!labVec) return { ok: false };

        const { error } = await sb
          .from("fabrics")
          .update({ lab_clusters: `[${labVec.join(",")}]` })
          .eq("id", fab.id);

        return { ok: !error };
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value.ok) success++;
      else errors++;
    }

    if ((i + CONCURRENCY) % 200 === 0 || i + CONCURRENCY >= allFabrics.length) {
      const done = Math.min(i + CONCURRENCY, allFabrics.length);
      const elapsed = ((Date.now() - start) / 60000).toFixed(1);
      const rate = done / parseFloat(elapsed || 1);
      const remaining = ((allFabrics.length - done) / rate).toFixed(0);
      console.log(`  ${done}/${allFabrics.length} | ${elapsed}분 | 성공:${success} 에러:${errors} | ~${remaining}분 남음`);
    }
  }

  console.log(`\n=== 완료 ===`);
  console.log(`✅ 성공: ${success}개`);
  console.log(`❌ 에러: ${errors}개`);
  console.log(`⏱️  시간: ${((Date.now() - start) / 60000).toFixed(1)}분`);
}

main().catch((e) => { console.error(e); process.exit(1); });
