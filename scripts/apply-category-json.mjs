/**
 * 카테고리 라벨 JSON → DB 반영
 * category-tool.html 에서 내보낸 JSON({ "DH1539": {fabric_type, pattern_detail}, ... })을 읽어
 * 각 디자인(name)의 모든 색상(MINGJI/EASTEN)에 fabric_type/pattern_detail UPDATE.
 *
 * 사용: node scripts/apply-category-json.mjs "<json경로>"
 *       node scripts/apply-category-json.mjs "<json경로>" --dry
 *   기본 경로: D:/DIAN FABRIC/category-labels.json
 */
import fs from "fs";
const env = {};
fs.readFileSync(".env.local", "utf-8").split("\n").forEach((l) => { const [k, ...v] = l.split("="); if (k && v.length) env[k.trim()] = v.join("=").trim(); });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const jsonPath = args.find((a) => !a.startsWith("--")) || "D:/DIAN FABRIC/category-labels.json";

async function main() {
  if (!fs.existsSync(jsonPath)) { console.error("❌ JSON 없음:", jsonPath); process.exit(1); }
  const labels = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  const codes = Object.keys(labels);
  console.log(`=== 카테고리 적용 ${DRY ? "(DRY)" : ""} ===\n라벨 디자인: ${codes.length}개`);

  // 현재값 로드 (변경된 것만 적용)
  let cur = [], from = 0;
  while (true) {
    const { data } = await sb.from("fabrics").select("id, name, fabric_type, pattern_detail").in("supplier", ["MINGJI", "EASTEN"]).range(from, from + 999);
    if (!data || !data.length) break; cur = cur.concat(data); if (data.length < 1000) break; from += 1000;
  }
  const byName = {};
  cur.forEach((r) => { (byName[r.name] = byName[r.name] || []).push(r); });

  let changedRows = 0, changedDesigns = 0, skipped = 0;
  const toUpdate = []; // {id, fabric_type, pattern_detail}
  for (const code of codes) {
    const rows = byName[code];
    if (!rows) { skipped++; continue; }
    const ft = labels[code].fabric_type || null;
    const pd = labels[code].pattern_detail || null;
    let designChanged = false;
    for (const r of rows) {
      if (r.fabric_type !== ft || r.pattern_detail !== pd) { toUpdate.push({ id: r.id, fabric_type: ft, pattern_detail: pd }); changedRows++; designChanged = true; }
    }
    if (designChanged) changedDesigns++;
  }
  console.log(`변경 대상: 디자인 ${changedDesigns}개 / 색상행 ${changedRows}개 (매칭 안된 코드 ${skipped}개)`);

  if (DRY) { console.log("\n(DRY — 변경 안 함). 예시:"); toUpdate.slice(0, 5).forEach((u) => console.log("  ", u)); return; }

  let ok = 0;
  for (let i = 0; i < toUpdate.length; i += 25) {
    await Promise.all(toUpdate.slice(i, i + 25).map((u) => sb.from("fabrics").update({ fabric_type: u.fabric_type, pattern_detail: u.pattern_detail }).eq("id", u.id)));
    ok += Math.min(25, toUpdate.length - i);
    if (ok % 200 < 25) process.stdout.write(`\r  적용 ${ok}/${toUpdate.length}   `);
  }
  console.log(`\n✅ 완료: ${ok}개 색상행 업데이트 (${changedDesigns}개 디자인)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
