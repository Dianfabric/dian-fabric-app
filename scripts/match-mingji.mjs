/**
 * 단가표(2025 TMS) 브랜드=MINGJI 행 ↔ Mingji 사이트 코드(scripts/mingji-products.json) 대조
 * 시트 코드의 컬러 접미사(-14 등)는 떼고 base 코드로 매칭.
 * 결과: scripts/mingji-match-report.json + 콘솔 요약
 */
import fs from "fs";

const SHEET_CSV = "https://docs.google.com/spreadsheets/d/1PKx-ycLsyS1wYrvRSCJ2IceMKMoeczb2Fr2VcfNzJWc/export?format=csv&gid=88683325";

// ── 간단 CSV 파서 (따옴표 안 콤마 처리) ──
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const norm = (s) => (s || "").trim().toUpperCase();
// 컬러 접미사(-14) 제거 + 사이트 변형 접미사(숫자 뒤 단일 영문 A/B/C) 제거 → loose base
const baseCode = (s) => norm(s).replace(/-\d+$/, "").replace(/(\d)[A-Z]$/, "$1");

async function main() {
  // ── 단가표 로드 ──
  const csv = await (await fetch(SHEET_CSV, { headers: { "User-Agent": "Mozilla/5.0" } })).text();
  const rows = parseCSV(csv);
  const header = rows[0];
  console.log("헤더:", header.slice(0, 7).join(" | "));

  // 컬럼 인덱스: B=브랜드(1), C=제품명(2), D=단가(3), E=소재(4), F=폭(5)
  const mingjiRows = rows.slice(1).filter((r) => norm(r[1]) === "MINGJI");
  console.log(`\n단가표 브랜드=MINGJI 행: ${mingjiRows.length}개`);

  const sheetItems = mingjiRows.map((r) => ({
    raw: (r[2] || "").trim(),
    base: baseCode(r[2]),
    price: (r[3] || "").trim(),
    width: (r[5] || "").trim(),
  })).filter((x) => x.base);

  // ── 사이트 코드 로드 (loose base 기준으로 그룹핑) ──
  const site = JSON.parse(fs.readFileSync("scripts/mingji-products.json", "utf-8"));
  const siteByCode = new Map(); // base -> {codes:[], url, images}
  for (const s of site) {
    const b = baseCode(s.code);
    if (!siteByCode.has(b)) siteByCode.set(b, { codes: [], url: s.url, images: [] });
    const g = siteByCode.get(b);
    g.codes.push(norm(s.code));
    g.images.push(...(s.images || []));
  }
  const siteSet = new Set(siteByCode.keys());

  // ── 매칭 (base 코드 기준) ──
  const sheetBaseSet = new Set(sheetItems.map((x) => x.base));
  const matched = [], missing = [];
  for (const base of sheetBaseSet) {
    if (siteSet.has(base)) matched.push(base);
    else missing.push(base);
  }
  const siteOnly = [...siteSet].filter((c) => !sheetBaseSet.has(c));

  // 컬러 단위 집계
  const matchedColorRows = sheetItems.filter((x) => siteSet.has(x.base)).length;

  console.log(`\n=== 결과 (base 코드 기준) ===`);
  console.log(`단가표 고유 제품(base): ${sheetBaseSet.size}개  (컬러포함 ${sheetItems.length}행)`);
  console.log(`  ✅ 사이트에 있음: ${matched.length}개 제품  (컬러 ${matchedColorRows}행)`);
  console.log(`  ❌ 사이트에 없음: ${missing.length}개 제품`);
  console.log(`  ➕ 사이트엔 있는데 단가표 MINGJI엔 없음: ${siteOnly.length}개`);

  console.log(`\n--- ❌ 사이트에 없는 단가표 코드 (${missing.length}) ---`);
  console.log(missing.sort().join(", "));

  console.log(`\n--- ➕ 사이트에만 있는 코드 (${siteOnly.length}) ---`);
  console.log(siteOnly.sort().join(", "));

  // 리포트 저장
  const report = {
    summary: {
      sheet_mingji_rows: mingjiRows.length,
      sheet_unique_products: sheetBaseSet.size,
      site_total: siteSet.size,
      matched_products: matched.length,
      missing_products: missing.length,
      site_only: siteOnly.length,
    },
    matched: matched.sort().map((base) => ({
      code: base,
      site_codes: siteByCode.get(base)?.codes || [],
      url: siteByCode.get(base)?.url || null,
      images: siteByCode.get(base)?.images?.length || 0,
    })),
    missing_from_site: missing.sort(),
    site_only: siteOnly.sort(),
  };
  fs.writeFileSync("scripts/mingji-match-report.json", JSON.stringify(report, null, 2));
  console.log(`\n저장: scripts/mingji-match-report.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
