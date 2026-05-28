/**
 * RGB 클러스터 → LAB 색공간 변환 + DB 저장
 *
 * notes 필드의 RGB 클러스터를 LAB로 변환해서 lab_clusters 컬럼에 저장
 * Sharp 등 이미지 처리 불필요 (notes에 이미 RGB 클러스터 있음)
 *
 * 사용: node scripts/convert-to-lab.mjs
 * 예상 시간: 5-10분 (14,625개)
 */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
fs.readFileSync(".env.local", "utf-8").split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) env[k.trim()] = v.join("=").trim();
});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// ─── RGB → XYZ → LAB (D65 illuminant, sRGB) ───
function rgbToLab(r, g, b) {
  let R = r / 255, G = g / 255, B = b / 255;
  // 감마 보정
  R = R > 0.04045 ? Math.pow((R + 0.055) / 1.055, 2.4) : R / 12.92;
  G = G > 0.04045 ? Math.pow((G + 0.055) / 1.055, 2.4) : G / 12.92;
  B = B > 0.04045 ? Math.pow((B + 0.055) / 1.055, 2.4) : B / 12.92;
  // RGB → XYZ (sRGB D65)
  const X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) * 100;
  const Y = (R * 0.2126729 + G * 0.7151522 + B * 0.0721750) * 100;
  const Z = (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) * 100;
  // 기준 백색 (D65)
  const Xn = 95.047, Yn = 100, Zn = 108.883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fX = f(X / Xn), fY = f(Y / Yn), fZ = f(Z / Zn);
  return [116 * fY - 16, 500 * (fX - fY), 200 * (fY - fZ)];
}

// notes에서 RGB 클러스터 파싱
function parseRGBClusters(notes) {
  if (!notes) return [];
  const rgbPart = notes.match(/\|rgb:([^|]*)/)?.[1];
  if (!rgbPart) return [];
  const clusters = [];
  for (const seg of rgbPart.split(";")) {
    const m = seg.match(/(\d+),(\d+),(\d+):(\d+)/);
    if (m) {
      clusters.push({
        rgb: [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])],
        pct: parseInt(m[4]),
      });
    }
  }
  // 구 형식 호환 (단일 RGB)
  if (clusters.length === 0) {
    const m = rgbPart.match(/(\d+),(\d+),(\d+)/);
    if (m) clusters.push({ rgb: [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])], pct: 100 });
  }
  return clusters;
}

// LAB 벡터 (5개 클러스터 × L,a,b = 15d), 비율을 LAB 값에 가중
function toLabVector(rgbClusters) {
  const sorted = rgbClusters
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);

  const labs = sorted.map((c) => {
    const lab = rgbToLab(c.rgb[0], c.rgb[1], c.rgb[2]);
    // 비율을 4번째 차원으로 인코딩 (정규화 0-100 → 0-1)
    return [...lab, c.pct / 100];
  });

  // 5개 미만이면 0 패딩
  while (labs.length < 5) labs.push([0, 0, 0, 0]);

  // 15차원 (5 × 3, 비율은 별도)
  // 가중 LAB: L * pct, a * pct, b * pct
  return labs.slice(0, 5).flatMap((l) => [l[0], l[1], l[2]]);
}

async function main() {
  console.log("=== RGB → LAB 변환 ===\n");

  // 페이지네이션으로 전체 조회
  let allFabrics = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("fabrics")
      .select("id, notes")
      .not("notes", "is", null)
      .is("lab_clusters", null)
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
    console.log("✅ 모두 처리됨 (또는 lab_clusters 컬럼 없음)");
    return;
  }

  let success = 0, errors = 0, noRgb = 0;
  const start = Date.now();

  // 병렬 처리 (10개씩)
  const BATCH = 10;
  for (let i = 0; i < allFabrics.length; i += BATCH) {
    const batch = allFabrics.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (fab) => {
        const clusters = parseRGBClusters(fab.notes);
        if (clusters.length === 0) return { fab, status: "no_rgb" };

        const labVec = toLabVector(clusters);
        const vecStr = `[${labVec.join(",")}]`;

        const { error } = await sb.from("fabrics")
          .update({ lab_clusters: vecStr })
          .eq("id", fab.id);
        return { fab, status: error ? "error" : "ok", error };
      })
    );

    for (const r of results) {
      if (r.status !== "fulfilled") { errors++; continue; }
      const v = r.value;
      if (v.status === "ok") success++;
      else if (v.status === "no_rgb") noRgb++;
      else errors++;
    }

    if ((i + BATCH) % 500 === 0 || i + BATCH >= allFabrics.length) {
      const done = i + BATCH;
      const elapsed = ((Date.now() - start) / 60000).toFixed(1);
      const rate = done / parseFloat(elapsed || 1);
      const remaining = ((allFabrics.length - done) / rate).toFixed(0);
      console.log(`  ${done}/${allFabrics.length} | ${elapsed}분 | 성공:${success} RGB없음:${noRgb} 에러:${errors} | ~${remaining}분 남음`);
    }
  }

  const totalTime = ((Date.now() - start) / 60000).toFixed(1);
  console.log(`\n=== 완료 ===`);
  console.log(`✅ 성공: ${success}개`);
  console.log(`⚠️  RGB 없음: ${noRgb}개`);
  console.log(`❌ 에러: ${errors}개`);
  console.log(`⏱️  시간: ${totalTime}분`);
}

main().catch((e) => { console.error(e); process.exit(1); });
