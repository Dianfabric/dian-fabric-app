/**
 * Production /api/search-v3 시뮬레이션 테스트
 * DB에서 실제 임베딩 가져와서 API에 보내보기
 */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
fs.readFileSync(".env.local", "utf-8").split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) env[k.trim()] = v.join("=").trim();
});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

const PROD_URL = "https://dian-fabric-app.vercel.app/api/search-v3";

async function main() {
  // 모든 컬럼이 채워진 fabric 1개 가져오기
  const { data } = await sb.from("fabrics")
    .select("id, name, color_code, pattern_detail, fabric_type, notes, embedding_dino, embedding_dino_crop, lab_clusters")
    .not("embedding_dino", "is", null)
    .not("embedding_dino_crop", "is", null)
    .not("lab_clusters", "is", null)
    .limit(1);

  if (!data || data.length === 0) {
    console.log("❌ 모든 데이터 갖춘 원단 없음");
    return;
  }

  const fab = data[0];
  console.log(`테스트 원단: ${fab.name}-${fab.color_code} (${fab.pattern_detail})`);

  // 벡터 파싱
  const parseVec = (v) => typeof v === "string" ? JSON.parse(v) : v;
  const embGlobal = parseVec(fab.embedding_dino);
  const embCrop = parseVec(fab.embedding_dino_crop);
  const lab = parseVec(fab.lab_clusters);

  console.log(`embedding_dino: ${embGlobal.length}차원`);
  console.log(`embedding_dino_crop: ${embCrop.length}차원`);
  console.log(`lab_clusters: ${lab.length}차원\n`);

  // API 호출
  const payload = {
    embedding_global: embGlobal,
    embedding_crop: embCrop,
    lab_clusters: lab,
    query_patterns: fab.pattern_detail || undefined,
    query_types: fab.fabric_type || undefined,
    query_colors: "베이지",
    matchCount: 10,
  };

  console.log(`Production API 호출: ${PROD_URL}`);
  console.log(`보너스 파라미터: patterns=${payload.query_patterns}, types=${payload.query_types}, colors=${payload.query_colors}\n`);

  const startT = Date.now();
  const res = await fetch(PROD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const elapsed = Date.now() - startT;

  console.log(`Status: ${res.status} (${elapsed}ms)`);
  const result = await res.json();

  if (!res.ok) {
    console.error(`❌ 에러: ${result.error}`);
    return;
  }

  console.log(`결과: ${result.results?.length || 0}개`);
  console.log(`적용된 보너스: ${JSON.stringify(result.applied_bonuses)}\n`);

  if (result.results && result.results.length > 0) {
    console.log(`Top 5:`);
    result.results.slice(0, 5).forEach((r, i) => {
      console.log(`  ${i+1}. ${r.name}-${r.color_code} | 종합: ${(r.similarity*100).toFixed(1)}% | 글로벌: ${(r.score_global*100).toFixed(0)} | 크롭: ${(r.score_crop*100).toFixed(0)} | 색: ${(r.score_color*100).toFixed(0)} | 보너스: ${(r.score_bonus*100).toFixed(0)}`);
    });
  } else {
    console.log("⚠️ 결과 0개 — RPC 함수 문제 또는 필터 너무 엄격");
  }
}

main().catch((e) => { console.error("전체 에러:", e); process.exit(1); });
