/**
 * 폭(width_mm) 단위 정규화
 * 입력 단위가 제각각(14 / 140 / 1400, 28 / 280 / 2800)이라 표준 mm로 통일한다.
 *
 * 규칙: 어떤 값이든 표준 cm(100~999)로 맞춘 뒤 ×10 = mm
 *   14·140·1400 → 1400mm(140cm)   /   28·280·2800 → 2800mm(280cm)   /   145 → 1450mm
 * 대폭 = 정규화 cm >= 200 (앞 2자리 14=소폭, 28·29·30=대폭과 동일)
 *
 * 사용:
 *   node scripts/normalize-width.mjs --dry   (미리보기)
 *   node scripts/normalize-width.mjs         (실제 적용)
 */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
fs.readFileSync(".env.local", "utf-8").split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) env[k.trim()] = v.join("=").trim();
});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

const DRY = process.argv.includes("--dry");

// 표준 mm로 정규화 (어떤 단위든 → 100~999cm → ×10 mm)
export function normalizeWidthMm(v) {
  if (v == null) return null;
  let cm = v;
  let i = 0;
  while (cm < 100 && i++ < 6) cm *= 10;   // 14→140, 28→280, 30→300
  i = 0;
  while (cm > 1000 && i++ < 6) cm /= 10;  // 1400→140, 2800→280
  return Math.round(cm) * 10;             // 표준 mm
}

async function main() {
  console.log(`=== 폭 정규화 ${DRY ? "(DRY RUN)" : ""} ===\n`);

  let rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb.from("fabrics").select("id, width_mm").range(from, from + 999);
    if (error) { console.error("ERR", error.message); return; }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`전체 행: ${rows.length}\n`);

  const changes = [];
  const outliers = [];
  for (const r of rows) {
    if (r.width_mm == null) continue;
    const norm = normalizeWidthMm(r.width_mm);
    const cm = norm / 10;
    // 현실 범위(100~330cm) 벗어나면 자동 교정하지 않고 리포트만 (잘못 교정 방지)
    if (cm < 100 || cm > 330) { outliers.push({ id: r.id, from: r.width_mm, cm }); continue; }
    if (norm !== r.width_mm) changes.push({ id: r.id, from: r.width_mm, to: norm });
  }

  // 변경 요약 (from→to 별 집계)
  const summary = {};
  for (const c of changes) {
    const key = `${c.from} → ${c.to}`;
    summary[key] = (summary[key] || 0) + 1;
  }
  console.log(`변경 대상: ${changes.length}개\n=== 변경 내역 (원본 → 표준mm) ===`);
  Object.entries(summary).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${k}  : ${n}개`));

  if (outliers.length) {
    console.log(`\n⚠️  이상치(100cm 미만 또는 330cm 초과) ${outliers.length}개 — 수동 확인 권장:`);
    const os = {};
    outliers.forEach((o) => { const k = `width_mm=${o.from} (정규화시 ${o.cm}cm) — 그대로 둠`; os[k] = (os[k] || 0) + 1; });
    Object.entries(os).forEach(([k, n]) => console.log(`  ${k} : ${n}개`));
  }

  if (DRY) { console.log("\n(DRY RUN — 변경 안 함)"); return; }

  // 실제 적용 (id 청크 업데이트)
  let ok = 0;
  for (let i = 0; i < changes.length; i += 20) {
    const chunk = changes.slice(i, i + 20);
    await Promise.all(chunk.map((c) => sb.from("fabrics").update({ width_mm: c.to }).eq("id", c.id)));
    ok += chunk.length;
    if (ok % 500 < 20) console.log(`  적용 ${ok}/${changes.length}...`);
  }
  console.log(`\n✅ 완료: ${ok}개 정규화`);
}

main().catch((e) => { console.error(e); process.exit(1); });
