/**
 * Production /api/search-dino 실제 호출 시뮬레이션
 * 기하학 + 베이지 시나리오 재현
 */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
fs.readFileSync(".env.local", "utf-8").split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) env[k.trim()] = v.join("=").trim();
});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

const PROD_URL = "https://dian-fabric-app.vercel.app/api/search-dino";

async function main() {
  // 1. 기하학 + 베이지 원단 하나 가져오기
  const { data } = await sb.from("fabrics")
    .select("id, name, color_code, embedding_dino, notes")
    .ilike("pattern_detail", "%기하학%")
    .ilike("notes", "%베이지%")
    .not("embedding_dino", "is", null)
    .limit(1);

  if (!data || data.length === 0) {
    console.log("❌ 테스트할 원단 없음");
    return;
  }

  const fab = data[0];
  console.log(`테스트 쿼리: ${fab.name}-${fab.color_code}`);
  console.log(`  notes: ${fab.notes}\n`);

  const embedding = typeof fab.embedding_dino === "string"
    ? JSON.parse(fab.embedding_dino)
    : fab.embedding_dino;
  console.log(`임베딩 차원: ${embedding.length}`);

  // 2. 사이트가 보낼 법한 페이로드 시뮬레이션
  // Gemini가 베이지 100% 감지한 케이스 (가장 흔한 경우)
  const payload = {
    embedding,
    matchThreshold: 1.5,
    matchCount: 100,
    fabricType: undefined,
    patternDetail: "기하학",
    rgb: [{ rgb: [200, 180, 150], pct: 100 }],
    colorNames: [{ name: "베이지", pct: 95 }],
  };

  console.log(`\n=== Production API 호출 ===`);
  console.log(`patternDetail: ${payload.patternDetail}`);
  console.log(`colorNames: ${JSON.stringify(payload.colorNames)}\n`);

  const res = await fetch(PROD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await res.json();
  console.log(`Status: ${res.status}`);
  console.log(`결과 개수: ${result.results?.length || 0}`);
  console.log(`detectedCategory: ${result.detectedCategory}`);
  console.log(`filteredCount: ${result.filteredCount}`);
  if (result.error) console.log(`에러: ${result.error}`);

  if (result.results && result.results.length > 0) {
    console.log(`\nTop 3:`);
    result.results.slice(0, 3).forEach((r, i) => {
      console.log(`  ${i+1}. ${r.name}-${r.color_code} (${(r.similarity*100).toFixed(0)}%)`);
    });
  }

  // 3. 다른 시나리오: 색상 필터 없이
  console.log(`\n=== 색상 필터 제거 테스트 ===`);
  const payload2 = { ...payload, colorNames: undefined, rgb: undefined };
  const res2 = await fetch(PROD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload2),
  });
  const result2 = await res2.json();
  console.log(`결과 개수: ${result2.results?.length || 0}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
