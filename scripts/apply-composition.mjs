/**
 * 성분 데이터 기반으로 fabric_type에 린넨/면/울 다중 추가
 * 기존 fabric_type에 쉼표로 추가 (예: 패브릭 → 패브릭,면,울)
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envContent = fs.readFileSync(".env.local", "utf-8");
const env = {};
envContent.split("\n").forEach((line) => {
  const [key, ...vals] = line.split("=");
  if (key && vals.length) env[key.trim()] = vals.join("=").trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function main() {
  console.log("=== 성분 기반 fabric_type 다중 분류 ===\n");

  // 전체 원단 로드
  let allFabrics = [];
  let page = 0;
  while (true) {
    const from = page * 1000;
    const { data, error } = await supabase
      .from("fabrics")
      .select("id, name, fabric_type, composition_note, co_percent, li_percent")
      .not("composition_note", "is", null)
      .range(from, from + 999);
    if (error) { console.error("DB 에러:", error.message); break; }
    if (!data || data.length === 0) break;
    allFabrics = allFabrics.concat(data);
    if (data.length < 1000) break;
    page++;
  }
  console.log("성분 데이터 있는 원단: " + allFabrics.length + "개\n");

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < allFabrics.length; i++) {
    const f = allFabrics[i];
    const currentType = f.fabric_type || "패브릭";
    const note = (f.composition_note || "").toLowerCase();

    // 기존 타입을 배열로
    const types = currentType.split(",").map(t => t.trim());

    // 린넨: li_percent > 1% 또는 composition_note에 linen/LI 포함
    const hasLinen = (f.li_percent && f.li_percent > 1) || note.includes("linen");
    if (hasLinen && !types.includes("린넨")) types.push("린넨");

    // 면: co_percent > 1% 또는 composition_note에 cotton/CO 포함
    const hasCotton = (f.co_percent && f.co_percent > 1) || note.includes("cotton");
    if (hasCotton && !types.includes("면")) types.push("면");

    // 울: composition_note에 wool/W 포함
    const hasWool = note.includes("wool") || /\bw\b/i.test(note) || /\d+%\s*w\b/i.test(note);
    if (hasWool && !types.includes("울")) types.push("울");

    const newType = types.join(",");

    if (newType === currentType) {
      skipped++;
      continue;
    }

    const { error } = await supabase
      .from("fabrics")
      .update({ fabric_type: newType })
      .eq("id", f.id);

    if (error) {
      errors++;
      if (errors <= 5) console.log("  에러: " + f.name + " → " + error.message);
    } else {
      updated++;
    }

    if ((updated + skipped + errors) % 500 === 0) {
      console.log("  [" + (updated + skipped + errors) + "/" + allFabrics.length + "] 업데이트:" + updated + " 스킵:" + skipped + " 에러:" + errors);
    }

    // Rate limit 방지
    if ((i + 1) % 10 === 0) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log("\n=== 완료 ===");
  console.log("  업데이트: " + updated + "개");
  console.log("  스킵 (변경 없음): " + skipped + "개");
  console.log("  에러: " + errors + "개");

  // 결과 확인
  const { data: sample } = await supabase
    .from("fabrics")
    .select("name, fabric_type")
    .ilike("fabric_type", "%,면%")
    .limit(5);
  if (sample) {
    console.log("\n=== 샘플 (면 포함) ===");
    sample.forEach(s => console.log("  " + s.name + " → " + s.fabric_type));
  }
}

main().catch(console.error);
