/**
 * 전체 원단 Gemini 2.5 Flash 분류 (pattern_detail 중심)
 *
 * 모든 원단을 대상으로 pattern_detail을 정확하게 재분류
 * - fabric_type: 무지/벨벳/스웨이드/인조가죽/자카드/시어 (린넨/면/울은 시트 데이터 유지)
 * - pattern_detail: 부클/하운드투스/스트라이프/체크/헤링본/추상/자연/동물/식물/큰패턴
 * - notes: 색상 비율
 */

import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const sharp = require("sharp");
import fs from "fs";

// ─── 설정 ───
const envContent = fs.readFileSync(".env.local", "utf-8");
const env = {};
envContent.split("\n").forEach((line) => {
  const [key, ...vals] = line.split("=");
  if (key && vals.length) env[key.trim()] = vals.join("=").trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const GEMINI_API_KEY = env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";
const CONCURRENCY = 2;

// ─── 프롬프트 ───
const PROMPT = `You are a world-class fabric/textile classification expert with decades of experience.
Your job is to classify this fabric image with HIGH ACCURACY. Trust your own visual analysis above all else.
Do NOT guess — look carefully at the image and make a confident, precise classification.

## STEP 1: BASE TYPE (원단 종류) — Choose exactly ONE:
- 무지: Plain/solid color fabric with uniform color and no visible pattern. Texture is fine (linen weave, canvas, etc.) but there must be NO distinct repeating pattern. This is the most common type — when in doubt between 무지 and a pattern, look again carefully.
- 벨벳: Clearly soft, plush surface with visible SHEEN and pile depth. Must look luxuriously soft.
- 스웨이드: Matte, napped/brushed surface resembling suede leather. Distinctly different from velvet.
- 인조가죽: Smooth or pebbled LEATHER-LIKE surface. Clearly synthetic leather appearance.
- 자카드: Woven-in pattern where the pattern is created BY the weave itself (not printed). You can see texture variation.
- 시어: Sheer, semi-transparent, see-through lightweight fabric.

## STEP 2: PATTERN DETAIL (패턴 상세) — Choose ONE, or null if no pattern:
IMPORTANT: Only select a pattern if you can CLEARLY see it. Plain textured fabric is NOT a pattern.

- 부클 (boucle): You MUST see clearly visible CURLY, LOOPED YARN creating a distinctly bumpy 3D surface. Regular woven texture, tweed, or slightly rough surface is absolutely NOT boucle. Be very strict.
- 하운드투스 (houndstooth): Classic broken check with pointed TOOTH/STAR shapes. Two-tone jagged check pattern. NOT herringbone. The "teeth" are the key identifier.
- 스트라이프 (stripe): Clear, distinct parallel lines running in one direction.
- 체크 (check/plaid): Lines crossing BOTH horizontally and vertically forming a clear grid of squares or rectangles. Must have obvious grid structure.
- 헤링본 (herringbone): V-shaped ZIGZAG pattern forming continuous columns of chevrons. NOT houndstooth. The "V" or arrow shapes are the key identifier.
- 추상 (abstract): Irregular artistic, geometric, or abstract designs that don't fit other categories.
- 자연 (nature): Landscapes, water, stone, marble, sky, or natural terrain patterns.
- 동물 (animal): Animal prints — leopard spots, zebra stripes, snake skin, cow print, etc.
- 식물 (floral): Flowers, leaves, vines, botanical, or any plant-based pattern.
- 큰패턴 (large pattern): Large-scale decorative motifs, damask, medallions, or oversized repeating designs.

If the fabric is plain/solid with NO visible pattern → set pattern to null.

## STEP 3: COLOR COMPOSITION
Estimate the visible color percentages (must sum to 100).
Use ONLY these color names: 아이보리, 베이지, 브라운, 그레이, 차콜, 블랙, 네이비, 블루, 그린, 레드, 핑크, 옐로우, 오렌지, 퍼플, 민트

Reply ONLY with valid JSON (no markdown, no explanation, no extra text):
{"type":"원단종류","pattern":"패턴상세 or null","colors":[{"color":"아이보리","pct":70},{"color":"베이지","pct":30}]}`;

// ─── DB 필드 매핑 ───
const PATTERN_DETAILS = new Set([
  "부클", "하운드투스", "스트라이프", "체크", "헤링본",
  "추상", "자연", "동물", "식물", "큰패턴",
]);

const VALID_TYPES = new Set([
  "무지", "벨벳", "스웨이드", "인조가죽", "자카드", "시어",
]);

// 린넨/면/울은 Google Sheets 조성 데이터에서 이미 설정됨 → 유지
const SHEET_TYPES = new Set(["린넨", "면", "울"]);

function mapResult(geminiResult, currentFabricType) {
  const { type, pattern } = geminiResult;

  // pattern_detail 결정
  let pattern_detail = null;
  if (pattern && PATTERN_DETAILS.has(pattern)) {
    pattern_detail = pattern;
  }

  // fabric_type 결정
  let fabric_type = currentFabricType; // 기본: 기존 값 유지

  if (SHEET_TYPES.has(currentFabricType)) {
    // 린넨/면/울은 시트 데이터 유지
    fabric_type = currentFabricType;
  } else if (pattern_detail) {
    // 패턴이 있으면 fabric_type = "패턴"
    fabric_type = "패턴";
  } else if (VALID_TYPES.has(type)) {
    fabric_type = type;
  } else {
    fabric_type = "무지"; // 기본값
  }

  return { fabric_type, pattern_detail };
}

// ─── Gemini API 호출 ───
async function classifyWithGemini(imageUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const imgRes = await fetch(imageUrl, { signal: controller.signal });
  clearTimeout(timeout);
  if (!imgRes.ok) throw new Error(`Image fetch ${imgRes.status}`);
  let buffer = Buffer.from(await imgRes.arrayBuffer());

  if (buffer.byteLength > 3 * 1024 * 1024) {
    buffer = await sharp(buffer)
      .resize(800, 800, { fit: "inside" })
      .jpeg({ quality: 80 })
      .toBuffer();
  }

  const base64 = buffer.toString("base64");
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: "image/jpeg", data: base64 } },
          { text: PROMPT },
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 512,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (response.status === 429) throw new Error("RATE_LIMITED");
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Empty response");

  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const result = JSON.parse(cleaned);
  return { result, usage: data.usageMetadata || {} };
}

// ─── 메인 ───
async function main() {
  console.log(`=== 전체 원단 Gemini ${MODEL} 분류 ===`);
  console.log(`  패턴 카테고리: ${[...PATTERN_DETAILS].join(", ")}`);
  console.log(`  원단종류: ${[...VALID_TYPES].join(", ")} (린넨/면/울 유지)\n`);

  // 미분류 원단만 로드 (auto_classified가 false 또는 null인 것)
  let allFabrics = [];
  let page = 0;
  while (true) {
    const from = page * 1000;
    const { data, error } = await supabase
      .from("fabrics")
      .select("id, name, image_url, fabric_type")
      .not("image_url", "is", null)
      .or("auto_classified.is.null,auto_classified.eq.false")
      .range(from, from + 999);
    if (error) { console.error("DB 에러:", error.message); break; }
    if (!data || data.length === 0) break;
    allFabrics = allFabrics.concat(data);
    if (data.length < 1000) break;
    page++;
  }

  console.log(`미분류 대상: ${allFabrics.length}개\n`);
  if (allFabrics.length === 0) { console.log("모든 원단이 이미 분류되었습니다!"); return; }

  // 진행 파일 (중단 시 이어서)
  const progressFile = "scripts/.gemini-all-progress.json";
  let processed = new Set();
  try {
    const saved = JSON.parse(fs.readFileSync(progressFile, "utf-8"));
    processed = new Set(saved);
    console.log(`이전 진행: ${processed.size}개 완료, 나머지 계속\n`);
  } catch { /* 처음부터 */ }

  let success = 0;
  let errors = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const patternStats = {};
  const typeStats = {};
  const startTime = Date.now();

  const remaining = allFabrics.filter((f) => !processed.has(f.id));
  console.log(`처리 대상: ${remaining.length}개 (${processed.size}개 스킵)\n`);

  for (let i = 0; i < remaining.length; i += CONCURRENCY) {
    const batch = remaining.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (fabric) => {
        let retries = 0;
        while (retries < 3) {
          try {
            const { result, usage } = await classifyWithGemini(fabric.image_url);
            return { fabric, result, usage, ok: true };
          } catch (err) {
            const msg = err.message || "";
            if (msg === "RATE_LIMITED" || msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")) {
              retries++;
              const wait = retries * 15;
              console.log(`  ⏳ Rate limited, ${wait}초 대기... (${fabric.name})`);
              await new Promise((r) => setTimeout(r, wait * 1000));
              continue;
            }
            return { fabric, error: msg, ok: false };
          }
        }
        return { fabric, error: "MAX_RETRIES", ok: false };
      })
    );

    for (const r of results) {
      const val = r.status === "fulfilled" ? r.value : { fabric: null, ok: false, error: "promise_rejected" };
      if (!val.fabric) continue;

      if (val.ok) {
        const { fabric, result, usage } = val;
        const { fabric_type, pattern_detail } = mapResult(result, fabric.fabric_type);

        const colorStr = Array.isArray(result.colors)
          ? result.colors.map((c) => typeof c === "object" ? `${c.color}:${c.pct}` : c).join(",")
          : "";

        // 기존 notes에서 RGB 데이터 보존
        const { data: current } = await supabase
          .from("fabrics")
          .select("notes")
          .eq("id", fabric.id)
          .single();
        const existingRgb = current?.notes?.match(/\|rgb:\d+,\d+,\d+/)?.[0] || "";
        const newNotes = colorStr + existingRgb;

        const updateData = {
          fabric_type,
          pattern_detail,
          notes: newNotes,
          auto_classified: true,
        };

        const { error: upErr } = await supabase
          .from("fabrics")
          .update(updateData)
          .eq("id", fabric.id);

        if (upErr) {
          errors++;
        } else {
          success++;
          // 통계
          const pKey = pattern_detail || "(없음)";
          patternStats[pKey] = (patternStats[pKey] || 0) + 1;
          typeStats[fabric_type] = (typeStats[fabric_type] || 0) + 1;
        }

        totalInputTokens += usage.promptTokenCount || 0;
        totalOutputTokens += usage.candidatesTokenCount || 0;
      } else {
        errors++;
        if (val.error !== "MAX_RETRIES") {
          console.log(`  ✗ ${val.fabric.name}: ${val.error}`);
        }
      }

      processed.add(val.fabric.id);
    }

    // 진행률 표시
    const total = success + errors;
    if (total % 50 < CONCURRENCY || total <= CONCURRENCY) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      const perSec = total / ((Date.now() - startTime) / 1000);
      const remainSec = (remaining.length - total) / (perSec || 1);
      const remainMin = Math.ceil(remainSec / 60);
      const cost = ((totalInputTokens / 1e6) * 0.15 + (totalOutputTokens / 1e6) * 0.60).toFixed(3);
      console.log(`  [${total}/${remaining.length}] ${elapsed}분 경과, ~${remainMin}분 남음 | 성공${success} 에러${errors} | $${cost}`);
    }

    // 500개마다 진행 저장 + 상세 통계
    if (total % 500 < CONCURRENCY && total >= 500) {
      fs.writeFileSync(progressFile, JSON.stringify([...processed]));
      console.log(`\n--- ${total}개 처리 ---`);
      console.log("  패턴분포:", JSON.stringify(patternStats));
      console.log("  종류분포:", JSON.stringify(typeStats));
      console.log();
    }

    // 100개마다 진행 저장
    if (total % 100 < CONCURRENCY) {
      fs.writeFileSync(progressFile, JSON.stringify([...processed]));
    }
  }

  // 진행 파일 정리
  try { fs.unlinkSync(progressFile); } catch {}

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const totalCost = ((totalInputTokens / 1e6) * 0.15 + (totalOutputTokens / 1e6) * 0.60).toFixed(2);

  console.log(`\n=============================`);
  console.log(`=== 전체 분류 완료 ===`);
  console.log(`=============================`);
  console.log(`  성공: ${success}개`);
  console.log(`  에러: ${errors}개`);
  console.log(`  소요시간: ${totalTime}분`);
  console.log(`  비용: ~$${totalCost}`);
  console.log(`\n=== 패턴 상세 분포 ===`);
  Object.entries(patternStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v}개`));
  console.log(`\n=== 원단 종류 분포 ===`);
  Object.entries(typeStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v}개`));
}

main().catch(console.error);
