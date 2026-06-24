/**
 * Mingji 제품 색상 이미지 전체 다운로드
 * 매칭표(mingji-match-report.json)의 제품 중 이미 DB에 있는 3종 제외 → 39종
 * 색상 스와치 그룹(같은 날짜폴더 최대 그룹)을 사이트 순서대로 받아
 * D:/DIAN FABRIC/mingji-images/{코드}/{코드}-NN.jpg 로 저장 (webp→jpg)
 * 매니페스트: scripts/mingji-download-manifest.json
 *
 * 사용: node scripts/download-mingji.mjs            (전체 39종)
 *       node scripts/download-mingji.mjs MJG82307   (특정 코드만)
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const sharp = require("sharp");

const BASE = "https://www.mingji-textiles.com";
const OUT = "D:/DIAN FABRIC/mingji-images";
const FULL_IMG_RE = /\/uploads\/image\/[0-9]+\/[0-9]+\.(?:webp|jpg|jpeg|png)/g;
const SHARED_DATES = new Set(["20260108", "20260304"]); // 공통 배너/커버 제외
const IN_DB = new Set(["MJG82313", "MJG82315", "MJG82316"]); // 이미 DB에 있음
const CONC = 8;

const report = JSON.parse(fs.readFileSync("scripts/mingji-match-report.json", "utf-8"));
const argCodes = process.argv.slice(2);
const targets = report.matched.filter((m) =>
  argCodes.length ? argCodes.includes(m.code) : !IN_DB.has(m.code)
);

async function getText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  return res.text();
}
async function getBuf(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function colorImages(html) {
  const seen = new Set(), ord = [];
  for (const m of html.match(FULL_IMG_RE) || []) if (!seen.has(m)) { seen.add(m); ord.push(m); }
  const groups = {};
  for (const u of ord) { const d = u.split("/")[3]; if (SHARED_DATES.has(d)) continue; (groups[d] = groups[d] || []).push(u); }
  return Object.values(groups).sort((a, b) => b.length - a.length)[0] || [];
}

async function main() {
  console.log(`=== Mingji 이미지 다운로드: ${targets.length}종 ===\n`);
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = [];
  let totalImg = 0, totalErr = 0;

  for (const t of targets) {
    const html = await getText(t.url);
    const imgs = colorImages(html);
    const dir = path.join(OUT, t.code);
    fs.mkdirSync(dir, { recursive: true });

    const files = [];
    for (let i = 0; i < imgs.length; i += CONC) {
      const batch = imgs.slice(i, i + CONC);
      await Promise.all(batch.map(async (u, j) => {
        const idx = i + j;
        const cc = String(idx + 1).padStart(2, "0");
        try {
          const buf = await getBuf(BASE + u);
          const meta = await sharp(buf).metadata();
          const jpg = await sharp(buf).jpeg({ quality: 90 }).toBuffer();
          const file = `${t.code}-${cc}.jpg`;
          fs.writeFileSync(path.join(dir, file), jpg);
          files[idx] = { file, w: meta.width, h: meta.height };
        } catch (e) { totalErr++; files[idx] = { file: `${t.code}-${cc}`, error: e.message }; }
      }));
    }
    const ok = files.filter((f) => f && !f.error).length;
    totalImg += ok;
    const minDim = Math.min(...files.filter((f) => f && f.w).map((f) => Math.min(f.w, f.h)));
    manifest.push({ code: t.code, url: t.url, colors: ok, minDim, files });
    console.log(`  ✓ ${t.code}: ${ok}색 (최소 ${isFinite(minDim) ? minDim : "?"}px)`);
  }

  fs.writeFileSync("scripts/mingji-download-manifest.json", JSON.stringify(manifest, null, 2));
  console.log(`\n=== 완료: ${manifest.length}종 / ${totalImg}색 다운로드 (에러 ${totalErr}) ===`);
  console.log(`저장: ${OUT}`);
  console.log(`매니페스트: scripts/mingji-download-manifest.json`);
  const lowres = manifest.filter((m) => m.minDim < 600);
  if (lowres.length) console.log(`\n⚠️ 저해상도(<600px) 제품 ${lowres.length}종: ${lowres.map((m) => m.code).join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
