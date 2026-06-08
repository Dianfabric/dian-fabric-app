/**
 * 원단 숨김/재개시 토글
 * is_active=false → 목록·검색·컬러웨이에서 제외 (삭제 아님, 언제든 복구 가능)
 *
 * 사용:
 *   node scripts/toggle-fabric-visibility.mjs --hide PS3113 PS3114
 *   node scripts/toggle-fabric-visibility.mjs --show PS3113 PS3114
 *   node scripts/toggle-fabric-visibility.mjs --list                 (현재 숨김 목록)
 *
 * 같은 원단명의 모든 컬러가 한 번에 처리됨.
 */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
fs.readFileSync(".env.local", "utf-8").split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) env[k.trim()] = v.join("=").trim();
});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

const args = process.argv.slice(2);
const mode = args.find((a) => ["--hide", "--show", "--list"].includes(a));
const names = args.filter((a) => !a.startsWith("--"));

async function listHidden() {
  const { data } = await sb.from("fabrics").select("name").eq("is_active", false);
  const uniq = [...new Set((data || []).map((r) => r.name))].sort();
  console.log(`현재 숨김 원단(${uniq.length}종): ${uniq.join(", ") || "(없음)"}`);
}

async function main() {
  if (mode === "--list") return listHidden();
  if (!mode || names.length === 0) {
    console.error("사용법: node scripts/toggle-fabric-visibility.mjs --hide|--show 원단명 [원단명...]");
    process.exit(1);
  }
  const active = mode === "--show";

  // name → id (PK 기준 업데이트로 타임아웃 회피)
  const { data: rows, error } = await sb.from("fabrics").select("id").in("name", names);
  if (error) { console.error("조회 실패:", error.message); process.exit(1); }
  const ids = rows.map((r) => r.id);
  console.log(`${active ? "재개시" : "숨김"} 대상: ${ids.length}개 행 (${names.join(", ")})`);

  let ok = 0;
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const { error: e } = await sb.from("fabrics").update({ is_active: active }).in("id", chunk);
    if (e) { console.error("업데이트 실패:", e.message); process.exit(1); }
    ok += chunk.length;
  }
  console.log(`✅ 완료: ${ok}개 행 → is_active=${active}`);
  await listHidden();
}

main().catch((e) => { console.error(e); process.exit(1); });
