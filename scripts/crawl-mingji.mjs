/**
 * Mingji Textile 전체 제품 크롤링 (전 카테고리 + 상세페이지 — 완전판)
 * 1) 모든 카테고리 루트 + /product/ 페이지네이션에서 상세링크 전부 수집
 * 2) 각 상세페이지에서 제품코드 + 이미지URL 추출
 * 결과: scripts/mingji-products.json  [{code, url, images:[...]}]
 */
import fs from "fs";

const BASE = "https://www.mingji-textiles.com";
const CODE_RE = /(DH|ZC|MJG|DF)\s?[0-9]+[A-Z]?/g;
const LINK_RE = /\/[a-z0-9-]+-[0-9]+\.html/g;
const IMG_RE = /\/uploads\/[a-zA-Z0-9_\/.-]+\.(?:webp|jpg|jpeg|png)/g;

const CATEGORIES = [
  "product", "interior-fabrics", "outdoor-fabrics", "chenille", "boucle-fabric",
  "jacquard", "linen", "velvet", "chenille2", "chenille3", "boucle-fabric2",
  "melange-yarn", "acrylic-plain-fabric", "polyester-plain-fabric", "plain-fabric",
  "solution-dyed-jacquard", "wool", "blended-fabric", "color-blocking", "zhencai",
];

const norm = (c) => c.replace(/\s+/g, "").toUpperCase();

async function getText(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    return res.text();
  } catch { return null; }
}

async function main() {
  // ── 1단계: 전 카테고리 페이지네이션 → 상세링크 수집 ──
  const links = new Set();
  for (const cat of CATEGORIES) {
    let empty = 0;
    for (let n = 1; n <= 30; n++) {
      const html = await getText(`${BASE}/${cat}/page/${n}`);
      if (!html) break;
      const found = html.match(LINK_RE) || [];
      const before = links.size;
      found.forEach((l) => links.add(l));
      if (links.size === before) { empty++; if (empty >= 2) break; } else empty = 0;
    }
    process.stdout.write(`\r카테고리 ${cat}: 링크 누적 ${links.size}        `);
  }
  const linkArr = [...links];
  console.log(`\n상세페이지 ${linkArr.length}개 발견. 코드/이미지 추출...`);

  // ── 2단계: 상세페이지 병렬 크롤 ──
  const products = [];
  const CONC = 8;
  for (let i = 0; i < linkArr.length; i += CONC) {
    const batch = linkArr.slice(i, i + CONC);
    const results = await Promise.all(batch.map(async (link) => {
      const html = await getText(BASE + link);
      if (!html) return { url: BASE + link, code: null, images: [] };
      const titleMatch = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || "").match(CODE_RE);
      const h1Match = (html.match(/<h1[^>]*>([^<]*)<\/h1>/i)?.[1] || "").match(CODE_RE);
      const bodyMatch = html.match(CODE_RE);
      const code = norm((titleMatch || h1Match || bodyMatch || [null])[0] || "") || null;
      const images = [...new Set(html.match(IMG_RE) || [])].map((u) => BASE + u);
      return { url: BASE + link, code, images };
    }));
    products.push(...results);
    process.stdout.write(`\r상세 크롤 ${Math.min(i + CONC, linkArr.length)}/${linkArr.length}     `);
  }
  console.log();

  const byCode = new Map();
  let noCode = 0;
  for (const p of products) {
    if (!p.code) { noCode++; continue; }
    if (!byCode.has(p.code)) byCode.set(p.code, p);
  }
  const out = [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
  fs.writeFileSync("scripts/mingji-products.json", JSON.stringify(out, null, 2));

  const pref = {};
  out.forEach((o) => { const p = o.code.match(/^[A-Z]+/)[0]; pref[p] = (pref[p] || 0) + 1; });
  console.log(`\n=== 총 ${out.length}개 코드 (코드없음 ${noCode}개) ===`);
  Object.entries(pref).sort().forEach(([p, c]) => console.log(`  ${p}: ${c}개`));
  const totalImgs = out.reduce((s, o) => s + o.images.length, 0);
  console.log(`이미지 URL 합계: ${totalImgs}장`);
  console.log(`저장: scripts/mingji-products.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
