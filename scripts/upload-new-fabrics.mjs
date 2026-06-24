/**
 * 신규 원단 업로드 스크립트
 * 로컬 이미지 폴더 → Supabase Storage 업로드 → fabrics 행 INSERT
 *
 * 파일명 규칙: {원단명}-{컬러코드}.{jpg|png|webp}
 *   예) PS3004-2.jpg  →  name=PS3004, color_code=2
 *       COLUMBIA-39.png → name=COLUMBIA, color_code=39
 *   (원단명에 하이픈이 있으면 "마지막 하이픈" 뒤를 컬러코드로 인식)
 *
 * 단가/조성 자동 매칭 (우선순위):
 *   1) meta.csv  (같은 폴더, name+color_code 단위 정밀 매칭)
 *      헤더: name,color_code,price_per_yard,width_mm,pl_percent,co_percent,li_percent,composition_note
 *   2) 구글 스프레드시트 '쇼룸단가표' (원단명 단위 매칭, .env.local에 GOOGLE_API_KEY + SHEET_ID 필요)
 *      시트 컬럼: A(제품명영문) B(야드단가) C(소재) D(폭) ...
 *   3) 기본값 (단가 null, 폭 1400mm)
 *
 * 실행:
 *   node scripts/upload-new-fabrics.mjs "<이미지폴더경로>"
 *   node scripts/upload-new-fabrics.mjs "<이미지폴더경로>" --dry            (미리보기, 업로드 안 함)
 *   node scripts/upload-new-fabrics.mjs "<이미지폴더경로>" --sheet "시트명"  (시트명 지정)
 *   node scripts/upload-new-fabrics.mjs "<이미지폴더경로>" --no-sheet       (시트 조회 끄기)
 *
 * 업로드된 행은 auto_classified=false → 이후 classify-new-fabrics.mjs 가 분류함
 */

import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

// ─── 설정 ───
const BUCKET = "Fabric-images";
const DEFAULT_WIDTH_MM = 1400; // 폭 메타 없을 때 기본값(기존 데이터 다수가 1400)
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const DEFAULT_SHEET_NAME = "쇼룸단가표"; // 구글 시트 탭 이름

// ─── 인자 파싱 ───
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const NO_SHEET = args.includes("--no-sheet");
const sheetArgIdx = args.indexOf("--sheet");
const SHEET_NAME = sheetArgIdx !== -1 ? args[sheetArgIdx + 1] : DEFAULT_SHEET_NAME;
const folder = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--sheet");

if (!folder) {
  console.error('❌ 사용법: node scripts/upload-new-fabrics.mjs "<이미지폴더경로>" [--dry]');
  process.exit(1);
}
if (!fs.existsSync(folder)) {
  console.error(`❌ 폴더를 찾을 수 없습니다: ${folder}`);
  process.exit(1);
}

// ─── .env.local 로드 ───
const envContent = fs.readFileSync(".env.local", "utf-8");
const env = {};
envContent.split("\n").forEach((line) => {
  const [key, ...vals] = line.split("=");
  if (key && vals.length) env[key.trim()] = vals.join("=").trim();
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ .env.local에서 Supabase 키를 찾을 수 없습니다");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── CSV 파서 (따옴표 안 쉼표/줄바꿈 처리) ───
function parseCsv(t) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else { if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else if (c === "\r") {} else f += c; }
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  return rows;
}

// ─── meta.csv 로드 (선택) ───
function loadMeta() {
  const metaPath = path.join(folder, "meta.csv");
  if (!fs.existsSync(metaPath)) return {};
  const text = fs.readFileSync(metaPath, "utf-8").replace(/^﻿/, "");
  const rows = parseCsv(text); // 따옴표 안 쉼표 처리
  const header = rows[0].map((h) => h.trim());
  const map = {};
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    const row = {};
    header.forEach((h, idx) => { row[h] = (cols[idx] || "").trim(); });
    const key = `${row.name}__${row.color_code}`;
    map[key] = row;
  }
  console.log(`  ✓ meta.csv 로드: ${Object.keys(map).length}개 행`);
  return map;
}

// ─── 구글 스프레드시트 단가표 로드 (선택) ───
// 시트 컬럼: A(제품명영문) B(야드단가) C(소재) D(폭)
async function loadSheetMeta() {
  if (NO_SHEET) return {};
  const apiKey = env.GOOGLE_API_KEY;
  const sheetId = env.SHEET_ID;
  if (!apiKey || !sheetId) {
    console.log("  ℹ️  구글 시트 키 없음(GOOGLE_API_KEY/SHEET_ID) → 시트 조회 건너뜀");
    return {};
  }
  try {
    const range = encodeURIComponent(`${SHEET_NAME}!A:H`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      console.log(`  ⚠️  시트 조회 실패: ${data.error.message} → 건너뜀`);
      return {};
    }
    const rows = (data.values || []).slice(1); // 헤더 제외
    const map = {};
    for (const r of rows) {
      const name = (r[0] || "").trim();
      if (!name) continue;
      const priceRaw = (r[1] || "").replace(/[^0-9]/g, "");
      const width = Number((r[3] || "").replace(/[^0-9]/g, ""));
      map[name.toUpperCase()] = {
        price_per_yard: priceRaw ? Number(priceRaw) : null,
        width_mm: normalizeWidthMm(width),
        composition_note: (r[2] || "").trim() || null,
      };
    }
    console.log(`  ✓ 구글 시트 '${SHEET_NAME}' 로드: ${Object.keys(map).length}개 원단`);
    return map;
  } catch (e) {
    console.log(`  ⚠️  시트 조회 오류: ${e.message} → 건너뜀`);
    return {};
  }
}

// ─── 파일명 → name, color_code 파싱 ───
function parseFilename(filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext); // 확장자 제거
  const dash = base.lastIndexOf("-");
  if (dash === -1) {
    // 컬러코드 없는 단일 원단
    return { name: base.trim(), color_code: "1" };
  }
  return {
    name: base.slice(0, dash).trim(),
    color_code: base.slice(dash + 1).trim(),
  };
}

function num(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 폭 단위 정규화: 14/140/1400 → 1400mm, 28/280/2800 → 2800mm (normalize-width.mjs와 동일 규칙)
function normalizeWidthMm(v) {
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  let cm = v;
  let i = 0;
  while (cm < 100 && i++ < 6) cm *= 10;
  i = 0;
  while (cm > 1000 && i++ < 6) cm /= 10;
  const norm = Math.round(cm) * 10;
  const c = norm / 10;
  return c >= 100 && c <= 330 ? norm : v; // 현실 범위 밖이면 원값 유지
}

// ─── 메인 ───
async function main() {
  console.log(`=== 신규 원단 업로드 ${DRY ? "(DRY RUN — 업로드 안 함)" : ""} ===\n`);
  console.log(`  폴더: ${folder}`);

  const meta = loadMeta();
  const sheetMeta = await loadSheetMeta();

  const files = fs
    .readdirSync(folder)
    .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()));
  console.log(`  이미지 파일: ${files.length}개\n`);

  if (files.length === 0) {
    console.log("처리할 이미지가 없습니다.");
    return;
  }

  let uploaded = 0, skipped = 0, errors = 0;

  for (const file of files) {
    const { name, color_code } = parseFilename(file);
    if (!name) { console.log(`  ⚠️  파일명 파싱 실패, 건너뜀: ${file}`); errors++; continue; }

    const storagePath = `fabrics/${name}/${name}-${color_code}.jpg`;
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;

    // 중복 체크 (name + color_code)
    const { data: existing } = await supabase
      .from("fabrics")
      .select("id")
      .eq("name", name)
      .eq("color_code", color_code)
      .maybeSingle();

    if (existing) {
      console.log(`  ⏭️  이미 존재: ${name}-${color_code}`);
      skipped++;
      continue;
    }

    // 메타 매칭: meta.csv(정밀) > 구글시트(원단명) > 기본값
    const m = meta[`${name}__${color_code}`] || {};
    const s = sheetMeta[name.toUpperCase()] || {};
    const row = {
      name,
      color_code,
      image_url: publicUrl,
      image_path: storagePath,
      price_per_yard: num(m.price_per_yard) ?? s.price_per_yard ?? null,
      width_mm: normalizeWidthMm(num(m.width_mm)) ?? s.width_mm ?? DEFAULT_WIDTH_MM,
      pl_percent: num(m.pl_percent) ?? 0,
      co_percent: num(m.co_percent) ?? 0,
      li_percent: num(m.li_percent) ?? 0,
      other_percent: num(m.other_percent) ?? 0,
      composition_note: m.composition_note || s.composition_note || null,
      supplier: m.supplier || null,
      usage_types: [],
      features: [],
      is_curtain_eligible: false,
      is_flame_retardant: false,
      auto_classified: false, // ← 이후 classify-new-fabrics.mjs 가 분류
    };

    if (DRY) {
      console.log(`  📋 [미리보기] ${name}-${color_code}  단가:${row.price_per_yard ?? "-"} 폭:${row.width_mm} 조성:${row.composition_note ?? "-"}`);
      uploaded++;
      continue;
    }

    try {
      // 1) 이미지 → JPEG 변환 후 Storage 업로드
      const inputBuffer = fs.readFileSync(path.join(folder, file));
      const jpegBuffer = await sharp(inputBuffer)
        .rotate() // EXIF 회전 보정
        .jpeg({ quality: 88 })
        .toBuffer();

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, jpegBuffer, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (upErr) throw new Error(`Storage: ${upErr.message}`);

      // 2) 행 INSERT
      const { error: insErr } = await supabase.from("fabrics").insert(row);
      if (insErr) throw new Error(`Insert: ${insErr.message}`);

      console.log(`  ✅ ${name}-${color_code}`);
      uploaded++;
    } catch (err) {
      console.log(`  ❌ ${name}-${color_code}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n=== 완료 ===`);
  console.log(`  업로드: ${uploaded}개`);
  console.log(`  건너뜀(중복): ${skipped}개`);
  console.log(`  에러: ${errors}개`);
  if (!DRY && uploaded > 0) {
    console.log(`\n💡 다음 단계:`);
    console.log(`   1. node scripts/generate-embeddings.mjs      (CLIP 임베딩)`);
    console.log(`   2. Colab: dinov2_embeddings.ipynb 실행        (DINOv2 임베딩)`);
    console.log(`   3. node scripts/classify-new-fabrics.mjs      (패턴/색상 분류)`);
    console.log(`   4. node scripts/convert-to-lab.mjs            (LAB 색상)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
