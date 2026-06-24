/**
 * Mingji 업로드 준비
 * 1) mingji-images/{코드}/*.jpg 를 한 폴더(mingji-upload)로 펼침 (파일명은 이미 {코드}-NN.jpg)
 * 2) TMS 단가표에서 단가/소재/폭을 끌어와 meta.csv 생성 (supplier=MINGJI)
 * 결과: D:/DIAN FABRIC/mingji-upload/ (이미지 + meta.csv)
 */
import fs from "fs";
import path from "path";

const SRC = "D:/DIAN FABRIC/mingji-images";
const OUT = "D:/DIAN FABRIC/mingji-upload";
const SHEET = "https://docs.google.com/spreadsheets/d/1PKx-ycLsyS1wYrvRSCJ2IceMKMoeczb2Fr2VcfNzJWc/export?format=csv&gid=88683325";

function parseCSV(t) {
  const r = []; let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"' && t[i+1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else { if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\n") { row.push(f); r.push(row); row = []; f = ""; } else if (c === "\r") {} else f += c; }
  }
  if (f.length || row.length) { row.push(f); r.push(row); }
  return r;
}
const up = (s) => (s || "").trim().toUpperCase();
const base = (s) => up(s).replace(/-\d+$/, "").replace(/(\d)[A-Z]$/, "$1");

function normalizeWidthMm(v) {
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  let cm = n; let i = 0;
  while (cm < 100 && i++ < 6) cm *= 10;
  i = 0; while (cm > 1000 && i++ < 6) cm /= 10;
  const mm = Math.round(cm) * 10; const c = mm / 10;
  return c >= 100 && c <= 330 ? mm : Math.round(n);
}

// 소재 문자열 → pl/co/li/other 퍼센트
function parseComp(raw) {
  const pct = { pl: 0, co: 0, li: 0, other: 0 };
  if (!raw) return pct;
  // "30%V 70%P", "69%P 13%C 18%L" 등 모든 (숫자+소재) 쌍 추출
  const re = /(\d+(?:\.\d+)?)\s*%?\s*([A-Za-z가-힣]+)/g;
  let m;
  while ((m = re.exec(raw))) {
    const n = Math.round(parseFloat(m[1]));
    const mat = m[2].toUpperCase();
    if (mat === "P" || mat.startsWith("PL") || mat.startsWith("POLY") || mat.startsWith("폴리")) pct.pl += n;
    else if (mat === "C" || mat.startsWith("CO") || mat.startsWith("COTTON") || mat.startsWith("면")) pct.co += n;
    else if (mat === "L" || mat.startsWith("LI") || mat.startsWith("LINEN") || mat.startsWith("린넨")) pct.li += n;
    else pct.other += n; // V(비스코스), Ac(아크릴), Jute, Wool 등
  }
  return pct;
}

function csvCell(s) {
  s = String(s ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function main() {
  // TMS 단가 로드
  const rows = parseCSV(await (await fetch(SHEET)).text()).slice(1).filter((r) => up(r[1]) === "MINGJI");
  const meta = {};
  rows.forEach((r) => { const b = base(r[2]); if (!meta[b]) meta[b] = { price: (r[3] || "").replace(/[^0-9]/g, ""), mat: (r[4] || "").trim(), width: normalizeWidthMm(r[5]) }; });

  // 펼치기 + meta.csv
  fs.mkdirSync(OUT, { recursive: true });
  const codes = fs.readdirSync(SRC).filter((d) => fs.statSync(path.join(SRC, d)).isDirectory());
  const lines = ["name,color_code,price_per_yard,width_mm,pl_percent,co_percent,li_percent,other_percent,composition_note,supplier"];
  let copied = 0;
  for (const code of codes) {
    const m = meta[code] || { price: "", mat: "", width: "" };
    const comp = parseComp(m.mat);
    const files = fs.readdirSync(path.join(SRC, code)).filter((f) => f.toLowerCase().endsWith(".jpg"));
    for (const f of files) {
      fs.copyFileSync(path.join(SRC, code, f), path.join(OUT, f));
      copied++;
      const cc = f.replace(/\.jpg$/i, "").slice(code.length + 1); // {code}-NN → NN
      lines.push([code, cc, m.price, m.width, comp.pl, comp.co, comp.li, comp.other, m.mat, "MINGJI"].map(csvCell).join(","));
    }
  }
  fs.writeFileSync(path.join(OUT, "meta.csv"), "﻿" + lines.join("\n"));
  console.log(`이미지 ${copied}장 펼침 → ${OUT}`);
  console.log(`meta.csv ${lines.length - 1}행 생성 (supplier=MINGJI)`);
  // 단가 누락 체크
  const noPrice = codes.filter((c) => !(meta[c] && meta[c].price));
  if (noPrice.length) console.log(`⚠️ 단가 없음: ${noPrice.join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
