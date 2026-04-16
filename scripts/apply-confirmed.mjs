/**
 * confirmed-1629.json 기준으로 전체 DB 통일
 * 같은 원단명 → 같은 type/pattern/usage 적용
 * Supabase rate limit 방지: 요청 간 딜레이
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// ─── 설정 ───
const envContent = fs.readFileSync(".env.local", "utf-8");
const env = {};
envContent.split("\n").forEach((line) => {
  const [key, ...vals] = line.split("=");
  if (key && vals.length) env[key.trim()] = vals.join("=").trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// ─── confirmed 데이터 로드 ───
const confirmed = JSON.parse(fs.readFileSync("D:/DIAN FABRIC/confirmed-1629.json", "utf-8"));
console.log(`confirmed: ${confirmed.length}개 원단명\n`);

// 원단명 → 분류 기준 매핑
const nameMap = {};
for (const c of confirmed) {
  nameMap[c.name] = {
    type: c.type,
    pattern: c.pattern,
    usage: c.usage || [],
    colors: c.colors || [],
  };
}

// ─── 진행 파일 ───
const progressFile = "scripts/.apply-progress.json";
let doneIds = new Set();
try {
  const saved = JSON.parse(fs.readFileSync(progressFile, "utf-8"));
  doneIds = new Set(saved);
  console.log(`이전 진행: ${doneIds.size}개 완료\n`);
} catch {}

// ─── 메인 ───
async function main() {
  // DB에서 전체 원단 로드
  let allFabrics = [];
  let page = 0;
  while (true) {
    const from = page * 1000;
    const { data, error } = await supabase
      .from("fabrics")
      .select("id, name, fabric_type, pattern_detail, usage_types")
      .range(from, from + 999);
    if (error) { console.error("DB 에러:", error.message); break; }
    if (!data || data.length === 0) break;
    allFabrics = allFabrics.concat(data);
    if (data.length < 1000) break;
    page++;
  }
  console.log(`DB 전체: ${allFabrics.length}개\n`);

  // confirmed에 있는 원단명과 매칭
  const toUpdate = allFabrics.filter(f => nameMap[f.name] && !doneIds.has(f.id));
  const noMatch = allFabrics.filter(f => !nameMap[f.name]);

  console.log(`업데이트 대상: ${toUpdate.length}개`);
  console.log(`기준 없음 (confirmed에 없는 원단명): ${noMatch.length}개`);
  console.log(`이미 완료: ${doneIds.size}개\n`);

  let success = 0;
  let errors = 0;
  let skipped = 0;
  const startTime = Date.now();
  const errorList = [];

  for (let i = 0; i < toUpdate.length; i++) {
    const fabric = toUpdate[i];
    const ref = nameMap[fabric.name];

    // 현재 DB값과 비교 — 이미 같으면 건너뛰기
    const newType = ref.type;
    const newPattern = ref.pattern.join(",") || "무지";
    const currentPattern = fabric.pattern_detail || "무지";

    if (fabric.fabric_type === newType && currentPattern === newPattern) {
      skipped++;
      doneIds.add(fabric.id);
      continue;
    }

    // 업데이트
    const updateData = {
      fabric_type: newType,
      pattern_detail: newPattern,
    };

    // usage가 있으면 업데이트
    if (ref.usage && ref.usage.length > 0) {
      updateData.usage_types = ref.usage;
    }

    try {
      const { error } = await supabase
        .from("fabrics")
        .update(updateData)
        .eq("id", fabric.id);

      if (error) {
        errors++;
        errorList.push({ name: fabric.name, id: fabric.id, error: error.message });
        // Rate limit이면 대기
        if (error.message.includes("rate") || error.message.includes("too many")) {
          console.log(`    rate limit — 30초 대기...`);
          await new Promise(r => setTimeout(r, 30000));
        }
      } else {
        success++;
      }
    } catch (e) {
      errors++;
      errorList.push({ name: fabric.name, id: fabric.id, error: e.message });
    }

    doneIds.add(fabric.id);

    // 50개마다 진행 저장 + 로그
    if ((success + errors + skipped) % 50 === 0) {
      fs.writeFileSync(progressFile, JSON.stringify([...doneIds]));
      const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
      console.log(`  [${success + errors + skipped}/${toUpdate.length}] ${elapsed}분 | 성공:${success} 스킵:${skipped} 에러:${errors}`);
    }

    // Rate limit 방지: 10개마다 0.5초 대기
    if ((i + 1) % 10 === 0) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // 진행 파일 삭제
  try { fs.unlinkSync(progressFile); } catch {}

  // 결과
  const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log(`\n=== 통일 완료 ===`);
  console.log(`  성공: ${success}개`);
  console.log(`  스킵 (이미 동일): ${skipped}개`);
  console.log(`  에러: ${errors}개`);
  console.log(`  소요: ${elapsed}분`);

  if (noMatch.length > 0) {
    const noMatchNames = [...new Set(noMatch.map(f => f.name))];
    console.log(`\n=== 기준 없는 원단명 (${noMatchNames.length}개) ===`);
    noMatchNames.slice(0, 20).forEach(n => console.log(`  ${n}`));
    if (noMatchNames.length > 20) console.log(`  ... 외 ${noMatchNames.length - 20}개`);
  }

  if (errorList.length > 0) {
    console.log(`\n=== 에러 목록 (${errorList.length}개) ===`);
    errorList.slice(0, 10).forEach(e => console.log(`  ${e.name}: ${e.error}`));
  }
}

main().catch(console.error);
