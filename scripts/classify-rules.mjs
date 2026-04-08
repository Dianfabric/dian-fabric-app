/**
 * 규칙 기반 원단 분류 스크립트
 *
 * CLIP 벡터가 아닌 DB 데이터(성분, 폭)로 분류:
 * 1. 폭 2600mm+ → 커튼 원단 (is_curtain_eligible = true)
 * 2. composition_note에 linen/LI 포함 → 린넨 원단
 * 3. composition_note에 cotton/CO 포함 → 면 원단
 * 4. composition_note에 wool/W 포함 → 울 원단
 *
 * ※ 기존 CLIP 패턴/색상 분류는 유지하고, 성분/폭 규칙을 덮어씀
 *
 * 실행: node scripts/classify-rules.mjs
 */

import { createClient } from "@supabase/supabase-js";
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

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_KEY
);

/**
 * 폭 값을 mm로 정규화
 * 1000 이상 → mm 단위 그대로
 * 1000 미만 → cm 단위 → ×10
 */
function normalizeWidthMm(value) {
  if (!value) return null;
  return value >= 1000 ? value : value * 10;
}

async function main() {
  console.log("=== 규칙 기반 원단 분류 ===\n");

  // 전체 원단 로드
  let allFabrics = [];
  let page = 0;
  while (true) {
    const from = page * 1000;
    const { data, error } = await supabase
      .from("fabrics")
      .select("id, name, width_mm, composition_note, li_percent, co_percent, is_curtain_eligible, fabric_type")
      .range(from, from + 999);
    if (error) { console.error("DB 오류:", error.message); break; }
    if (!data || data.length === 0) break;
    allFabrics = allFabrics.concat(data);
    if (data.length < 1000) break;
    page++;
  }
  console.log(`총 ${allFabrics.length}개 원단 로드\n`);

  let curtainCount = 0;
  let linenCount = 0;
  let cottonCount = 0;
  let woolCount = 0;
  let errors = 0;

  for (let i = 0; i < allFabrics.length; i++) {
    const fab = allFabrics[i];
    const updateData = {};
    const tags = [];

    // ─── 1. 폭 기반 커튼 분류 ───
    const widthMm = normalizeWidthMm(fab.width_mm);
    if (widthMm && widthMm >= 2600) {
      updateData.is_curtain_eligible = true;
      tags.push("커튼(대폭)");
      curtainCount++;
    }

    // ─── 2. 성분 기반 분류 ───
    const note = (fab.composition_note || "").toLowerCase();

    const hasLinen = note.includes("linen") || note.includes("%li") || note.match(/\dli\b/) || (fab.li_percent && fab.li_percent > 0);
    const hasCotton = note.includes("cotton") || note.includes("%co") || note.match(/\dco\b/) || (fab.co_percent && fab.co_percent > 0);
    const hasWool = note.includes("wool") || note.match(/(\d+%?\s*w\b)/) || note.match(/\bw\d/);

    // 성분 개수에 따라 fabric_type 결정
    const materials = [];
    if (hasLinen) materials.push("린넨");
    if (hasCotton) materials.push("면");
    if (hasWool) materials.push("울");

    if (materials.length > 0) {
      // 우선순위: 린넨 > 울 > 면 (여러 개면 첫 번째)
      // 나중에 CHECK 제약에 '혼방' 추가하면 혼방도 가능
      if (hasLinen) { updateData.fabric_type = "린넨"; linenCount++; tags.push("린넨"); }
      else if (hasWool) { updateData.fabric_type = "울"; woolCount++; tags.push("울"); }
      else if (hasCotton) { updateData.fabric_type = "면"; cottonCount++; tags.push("면"); }
    }

    // 업데이트할 게 없으면 스킵
    if (Object.keys(updateData).length === 0) continue;

    const { error } = await supabase
      .from("fabrics")
      .update(updateData)
      .eq("id", fab.id);

    if (error) {
      // CHECK 제약 오류면 기록
      if (i < 5 || error.message.includes("check")) {
        console.log(`  ✗ ${fab.name}: ${error.message}`);
      }
      errors++;
    } else {
      if ((i + 1) % 200 === 0 || i < 20) {
        console.log(`  [${i + 1}/${allFabrics.length}] ${fab.name} → ${tags.join(", ")}`);
      }
    }
  }

  console.log(`\n=== 규칙 분류 완료 ===`);
  console.log(`  커튼(대폭): ${curtainCount}개`);
  console.log(`  린넨: ${linenCount}개`);
  console.log(`  면: ${cottonCount}개`);
  console.log(`  울: ${woolCount}개`);
  console.log(`  오류: ${errors}개`);
  if (errors > 0) {
    console.log(`\n⚠️ 오류가 있다면 Supabase에서 CHECK 제약조건을 수정해주세요:`);
    console.log(`  ALTER TABLE fabrics DROP CONSTRAINT fabrics_fabric_type_check;`);
    console.log(`  ALTER TABLE fabrics ADD CONSTRAINT fabrics_fabric_type_check`);
    console.log(`  CHECK (fabric_type IN ('무지','벨벳','패턴','스웨이드','인조가죽','린넨','면','울','자카드','시어','혼방'));`);
  }
}

main().catch(console.error);
