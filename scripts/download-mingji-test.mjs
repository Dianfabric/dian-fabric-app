/**
 * Mingji 제품 색상 이미지 시험 다운로드
 * 상세페이지에서 색상 스와치 그룹(같은 날짜폴더의 최대 그룹)을 사이트 순서대로 받아
 * D:/DIAN FABRIC/_test/{코드}/{코드}-NN.jpg 로 저장 (webp→jpg 변환)
 *
 * 사용: node scripts/download-mingji-test.mjs MJG82307 DH1539
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const sharp = require("sharp");

const BASE = "https://www.mingji-textiles.com";
const OUT = "D:/DIAN FABRIC/_test";
const FULL_IMG_RE = /\/uploads\/image\/[0-9]+\/[0-9]+\.(?:webp|jpg|jpeg|png)/g;
// 모든 제품에 공통으로 붙는 배너/연관 그룹(제외용) — 관찰된 공통 날짜
const SHARED_DATES = new Set(["20260108", "20260304"]);

const codes = process.argv.slice(2);
if (!codes.length) { console.error("사용법: node scripts/download-mingji-test.mjs <코드...>"); process.exit(1); }

const site = JSON.parse(fs.readFileSync("scripts/mingji-products.json", "utf-8"));
const urlByCode = Object.fromEntries(site.map((s) => [s.code, s.url]));
// 매칭표의 base 코드(DH1539)→URL 도 병합 (사이트는 DH1539C로 저장돼 있어서)
try {
  const rep = JSON.parse(fs.readFileSync("scripts/mingji-match-report.json", "utf-8"));
  for (const m of rep.matched) if (m.url && !urlByCode[m.code]) urlByCode[m.code] = m.url;
} catch {}

async function fetchBuf(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  for (const code of codes) {
    const url = urlByCode[code];
    if (!url) { console.log(`${code}: URL 없음 (mingji-products.json에 없음)`); continue; }
    console.log(`\n=== ${code} (${url}) ===`);
    const html = await (await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })).text();

    // 문서 순서 유지하며 중복 제거
    const seen = new Set();
    const ordered = [];
    for (const m of html.match(FULL_IMG_RE) || []) {
      if (!seen.has(m)) { seen.add(m); ordered.push(m); }
    }
    // 날짜폴더별 그룹 (공통 배너 날짜 제외)
    const byDate = {};
    for (const u of ordered) {
      const d = u.split("/")[3];
      if (SHARED_DATES.has(d)) continue;
      (byDate[d] = byDate[d] || []).push(u);
    }
    // 색상 그룹 = 가장 큰 그룹
    const colorGroup = Object.values(byDate).sort((a, b) => b.length - a.length)[0] || [];
    console.log(`색상 이미지 ${colorGroup.length}장 추출 (그룹: ${JSON.stringify(Object.fromEntries(Object.entries(byDate).map(([k,v])=>[k,v.length])))})`);

    const dir = path.join(OUT, code);
    fs.mkdirSync(dir, { recursive: true });

    for (let i = 0; i < colorGroup.length; i++) {
      const cc = String(i + 1).padStart(2, "0");
      try {
        const buf = await fetchBuf(BASE + colorGroup[i]);
        const meta = await sharp(buf).metadata();
        const jpg = await sharp(buf).jpeg({ quality: 90 }).toBuffer();
        const file = path.join(dir, `${code}-${cc}.jpg`);
        fs.writeFileSync(file, jpg);
        console.log(`  ✓ ${code}-${cc}.jpg  (${meta.width}x${meta.height})`);
      } catch (e) {
        console.log(`  ✗ ${code}-${cc}: ${e.message}`);
      }
    }
  }
  console.log(`\n저장 위치: ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
