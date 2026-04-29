/**
 * 다중 패턴 검색 버그 진단
 * Gemini가 "헤링본,스트라이프" 반환 → DB ILIKE 매칭 0개?
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
  // 1. "헤링본,스트라이프" 정확히 매칭
  const { count: c1 } = await sb.from("fabrics").select("*", { count: "exact", head: true })
    .ilike("pattern_detail", "%헤링본,스트라이프%");

  // 2. "헤링본" 단독
  const { count: c2 } = await sb.from("fabrics").select("*", { count: "exact", head: true })
    .ilike("pattern_detail", "%헤링본%");

  // 3. "스트라이프" 단독
  const { count: c3 } = await sb.from("fabrics").select("*", { count: "exact", head: true })
    .ilike("pattern_detail", "%스트라이프%");

  // 4. "헤링본" OR "스트라이프"
  const { data: orData } = await sb.from("fabrics")
    .select("id", { count: "exact", head: false })
    .or("pattern_detail.ilike.%헤링본%,pattern_detail.ilike.%스트라이프%")
    .limit(1);
  const { count: c4 } = await sb.from("fabrics").select("*", { count: "exact", head: true })
    .or("pattern_detail.ilike.%헤링본%,pattern_detail.ilike.%스트라이프%");

  // 5. "헤링본,스트라이프"+베이지+embedding_dino 있는 것 (실제 검색 조건)
  const { count: c5 } = await sb.from("fabrics").select("*", { count: "exact", head: true })
    .ilike("pattern_detail", "%헤링본,스트라이프%")
    .ilike("notes", "%베이지%")
    .not("embedding_dino", "is", null);

  // 6. OR 방식으로 베이지 매칭
  const { count: c6 } = await sb.from("fabrics").select("*", { count: "exact", head: true })
    .or("pattern_detail.ilike.%헤링본%,pattern_detail.ilike.%스트라이프%")
    .ilike("notes", "%베이지%")
    .not("embedding_dino", "is", null);

  console.log("=== 다중 패턴 검색 진단 ===\n");
  console.log(`1. "헤링본,스트라이프" 정확 매칭:    ${c1}개  ← 현재 검색 방식`);
  console.log(`2. "헤링본" 매칭:                   ${c2}개`);
  console.log(`3. "스트라이프" 매칭:                ${c3}개`);
  console.log(`4. "헤링본" OR "스트라이프":         ${c4}개  ← 수정 후 예상`);
  console.log(`5. 정확매칭 + 베이지 + DINOv2:       ${c5}개  ← 0이어서 결과 없음`);
  console.log(`6. OR + 베이지 + DINOv2 (수정):       ${c6}개`);
}

main().catch((e) => { console.error(e); process.exit(1); });
