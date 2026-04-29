/**
 * DINOv2 임베딩 + RPC 함수 동작 확인
 */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
fs.readFileSync(".env.local", "utf-8").split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) env[k.trim()] = v.join("=").trim();
});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function main() {
  // 1. 전체 카운트
  const { count: total } = await sb.from("fabrics").select("*", { count: "exact", head: true })
    .not("image_url", "is", null);

  // 2. embedding_dino 채워진 개수
  const { count: filled } = await sb.from("fabrics").select("*", { count: "exact", head: true })
    .not("embedding_dino", "is", null);

  // 3. 기하학 패턴 + 베이지 색상 (스크린샷에서 본 케이스)
  const { data: filtered, count: filteredCount } = await sb.from("fabrics")
    .select("id, name, color_code, pattern_detail, notes", { count: "exact" })
    .ilike("pattern_detail", "%기하학%")
    .ilike("notes", "%베이지%")
    .not("embedding_dino", "is", null)
    .limit(5);

  // 4. RPC 함수 동작 테스트 (랜덤 fabric의 embedding_dino로 검색)
  const { data: sampleFab } = await sb.from("fabrics").select("id, embedding_dino")
    .not("embedding_dino", "is", null).limit(1);

  let rpcOk = false;
  let rpcError = null;
  if (sampleFab && sampleFab.length > 0) {
    const vec = typeof sampleFab[0].embedding_dino === "string"
      ? sampleFab[0].embedding_dino
      : `[${sampleFab[0].embedding_dino.join(",")}]`;
    const { data, error } = await sb.rpc("search_fabrics_dino", {
      query_embedding: vec, match_threshold: 0.1, match_count: 5,
    });
    rpcOk = !error && data && data.length > 0;
    rpcError = error;
  }

  console.log("=== DB 상태 ===");
  console.log(`전체 원단:              ${total}개`);
  console.log(`embedding_dino 채워짐:  ${filled}개 (${(filled/total*100).toFixed(1)}%)`);
  console.log(`기하학+베이지 매칭:     ${filteredCount}개`);
  console.log(`search_fabrics_dino RPC: ${rpcOk ? "✅ 정상" : "❌ 실패"}`);
  if (rpcError) console.log(`  에러:`, rpcError.message);

  if (filtered && filtered.length > 0) {
    console.log(`\n기하학+베이지 샘플 (${filtered.length}개):`);
    filtered.forEach((f) => {
      console.log(`  - ${f.name}-${f.color_code} | ${f.pattern_detail}`);
    });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
