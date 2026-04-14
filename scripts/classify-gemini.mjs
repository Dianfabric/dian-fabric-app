/**
 * Gemini 2.5 Flash로 전체 원단 패턴/색상 분류
 * 부클 과잉분류 방지 프롬프트 + 진행 파일 + 자동 재시작
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

// ─── 프롬프트 (최종: 원단종류 + 패턴상세 다중선택) ───
const PROMPT = `You are an expert interior fabric classifier for a B2B fabric distributor.
Classify this fabric image in TWO independent dimensions: material TYPE and visual PATTERN.

=== STEP 1: FABRIC TYPE (원단 종류) — pick EXACTLY ONE ===
What MATERIAL is this fabric made of? Judge by surface texture, not by pattern.

- 패브릭 (fabric): DEFAULT. Regular woven/knit textile with visible thread/yarn/weave structure. Choose this when no special material stands out.
- 벨벳 (velvet): Soft plush surface with dense pile. Includes BOTH shiny velvet AND matte suede-like textures. If the fabric has a soft napped/brushed/plush surface → always classify as 벨벳 (NOT 스웨이드).
- 인조가죽 (faux leather): ⚠️ MOST COMMONLY MISSED — check carefully before choosing 패브릭!
  ✅ 인조가죽: (1) NO visible thread/yarn/weave — continuous sheet surface, (2) Smooth/rubbery/waxy/plastic texture, (3) Visible pores or leather grain bumps, (4) Broad sheen (not fiber glitter), (5) Coated/laminated look.
  ❌ 일반원단: (1) Threads/yarn/weave visible, (2) Matte fiber texture, (3) Soft drape with folds.
  RULE: No thread/weave visible → 인조가죽, NOT 패브릭.
- 시어 (sheer): Transparent or semi-transparent lightweight fabric you can see through.

(린넨/면/울/커튼 are classified separately from spec data — do NOT use them here.)

=== STEP 2: PATTERN (패턴 상세) — pick ONE or TWO from the list ===
What VISUAL PATTERN is on the fabric? Most fabrics have only ONE pattern.
Rarely, two patterns can combine (e.g., boucle texture + herringbone pattern). In that case, list both.

- 무지 (solid): NO pattern at all. Single uniform color. Most common — choose this when in doubt.
- 부클 (boucle): KEY feature is CURLY/CURLED yarn — the yarn itself must look twisted and loopy, creating a bumpy 3D surface. Look for: (1) clearly curly/coiled yarn strands, (2) irregular bumpy texture from loops. Rough or textured surface alone is NOT boucle. Unsure → 무지.
- 하운드투스 (houndstooth): Jagged check pattern with distinctive pointed star/tooth shapes.
- 스트라이프 (stripe): Clear parallel lines running in one direction.
- 체크 (check): ONLY clearly visible crossing lines forming squares with CONTRASTING COLORS. Subtle woven grid/basket weave is NOT check → 무지. Unsure → 무지.
- 헤링본 (herringbone): V-shaped zigzag pattern arranged in columns.
- 추상 (abstract): Irregular artistic/geometric design, OR non-woven random textures (fur-like, brushstrokes, marbled, chaotic fibers, crumpled).
- 자연 (nature): Landscape, water, stone, marble-like natural patterns.
- 동물 (animal): ONLY actual animal prints (leopard spots, zebra stripes, snake scales, crocodile). Wavy/organic abstract textures are NOT animal → 추상.
- 식물 (floral): Flowers, leaves, vines, botanical designs.
- 큰패턴 (large pattern): Large-scale decorative motifs, medallion patterns.
- 다마스크 (damask): Elegant woven pattern with symmetrical floral/scroll motifs, tone-on-tone or contrasting. Classic European ornamental design with repeating symmetry.

COMBINATION EXAMPLES:
- Boucle yarn with herringbone layout → ["부클", "헤링본"]
- Boucle yarn with houndstooth → ["부클", "하운드투스"]
- Just plain solid color → ["무지"]
- Floral pattern on regular fabric → ["식물"]

=== STEP 3: COLOR COMPOSITION ===
Estimate color percentages (must sum to 100).
Available colors (NO 화이트 — use 아이보리 instead):
아이보리, 베이지, 브라운, 그레이, 차콜, 블랙, 네이비, 블루, 그린, 레드, 핑크, 옐로우, 오렌지, 퍼플, 민트

=== OUTPUT FORMAT ===
Reply ONLY with JSON (no markdown, no explanation):
{"type":"패브릭","pattern":["무지"],"colors":[{"color":"아이보리","pct":70},{"color":"베이지","pct":30}]}`;

// ─── fabric_type 매핑 ───
const VALID_TYPES = new Set(["패브릭", "벨벳", "스웨이드", "인조가죽", "시어"]);
// 스웨이드 → 벨벳으로 통일
const TYPE_REMAP = { "스웨이드": "벨벳", "린넨": "패브릭", "커튼": "패브릭" };
const VALID_PATTERNS = new Set([
  "무지", "부클", "하운드투스", "스트라이프", "체크", "헤링본",
  "추상", "자연", "동물", "식물", "큰패턴", "다마스크",
]);

function mapToDbFields(result) {
  // 새 형식: { type, pattern (string or array) }
  if (result.type !== undefined) {
    let fabricType = TYPE_REMAP[result.type] || result.type;
    fabricType = VALID_TYPES.has(fabricType) ? fabricType : "패브릭";

    // pattern을 배열로 정규화
    let patterns = [];
    if (Array.isArray(result.pattern)) {
      patterns = result.pattern.filter(p => VALID_PATTERNS.has(p));
    } else if (result.pattern && VALID_PATTERNS.has(result.pattern)) {
      patterns = [result.pattern];
    }
    if (patterns.length === 0) patterns = ["무지"];

    // 무지만 있으면 패턴 없음
    const isPlain = patterns.length === 1 && patterns[0] === "무지";
    // 무지 + 다른 패턴 조합이면 무지 제거
    if (!isPlain) patterns = patterns.filter(p => p !== "무지");

    const patternStr = patterns.join(",");

    return {
      fabric_type: fabricType,
      pattern_detail: patternStr,
    };
  }
  // 구 형식 호환: { pattern }
  const pattern = result.pattern;
  if (VALID_PATTERNS.has(pattern)) {
    return { fabric_type: "패턴", pattern_detail: pattern };
  }
  return { fabric_type: VALID_TYPES.has(pattern) ? pattern : "무지", pattern_detail: null };
}

// ─── Gemini API 호출 ───
async function classifyWithGemini(imageUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const imgRes = await fetch(imageUrl, { signal: controller.signal });
  clearTimeout(timeout);
  if (!imgRes.ok) throw new Error(`Image fetch ${imgRes.status}`);
  let buffer = Buffer.from(await imgRes.arrayBuffer());

  // 큰 이미지는 리사이즈 (Gemini API 제한 대응)
  if (buffer.byteLength > 3 * 1024 * 1024) {
    buffer = await sharp(buffer)
      .resize(800, 800, { fit: "inside" })
      .jpeg({ quality: 80 })
      .toBuffer();
  }

  const base64 = buffer.toString("base64");
  const mimeType = "image/jpeg";

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64 } },
          { text: PROMPT },
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
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
  console.log(`=== Gemini ${MODEL} 원단 분류 ===\n`);

  // 전체 원단 로드
  let allFabrics = [];
  let page = 0;
  while (true) {
    const from = page * 1000;
    const { data, error } = await supabase
      .from("fabrics")
      .select("id, name, image_url, fabric_type")
      .not("image_url", "is", null)
      .range(from, from + 999);
    if (error) { console.error("DB 에러:", error.message); break; }
    if (!data || data.length === 0) break;
    allFabrics = allFabrics.concat(data);
    if (data.length < 1000) break;
    page++;
  }

  console.log(`총 ${allFabrics.length}개 원단\n`);

  // 진행 파일 (중단 후 재시작)
  const progressFile = "scripts/.gemini-progress.json";
  let processed = new Set();
  try {
    const saved = JSON.parse(fs.readFileSync(progressFile, "utf-8"));
    processed = new Set(saved);
    console.log(`이전 진행: ${processed.size}개 완료, 나머지 계속\n`);
  } catch { /* 처음부터 */ }

  // 통계
  let success = 0;
  let errors = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const stats = {};
  const startTime = Date.now();
  const CONCURRENCY = 2; // 동시 2개 병렬 처리 (API rate limit 대응)

  // 미처리 원단만 필터
  const remaining = allFabrics.filter((f) => !processed.has(f.id));
  console.log(`처리 대상: ${remaining.length}개 (${processed.size}개 완료됨)\n`);

  // 5개씩 묶어서 병렬 처리
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
            if (msg === "RATE_LIMITED" || msg.includes("429") || msg.includes("quota") || msg.includes("expired") || msg.includes("RESOURCE_EXHAUSTED")) {
              retries++;
              const wait = retries * 10;
              await new Promise((r) => setTimeout(r, wait * 1000));
              continue;
            }
            return { fabric, error: msg, ok: false };
          }
        }
        return { fabric, error: "MAX_RETRIES", ok: false };
      })
    );

    // 결과 처리
    for (const r of results) {
      const val = r.status === "fulfilled" ? r.value : { fabric: null, ok: false, error: "promise_rejected" };
      if (!val.fabric) continue;

      if (val.ok) {
        const { fabric, result, usage } = val;
        const { colors } = result;
        const { fabric_type, pattern_detail } = mapToDbFields(result);
        const colorStr = Array.isArray(colors)
          ? colors.map((c) => typeof c === "object" ? `${c.color}:${c.pct}` : c).join(",")
          : "";

        const updateData = { pattern_detail, notes: colorStr };
        const keepType = ["린넨", "면", "울"].includes(fabric.fabric_type);
        if (!keepType) {
          updateData.fabric_type = fabric_type;
        }

        const { error: upErr } = await supabase
          .from("fabrics")
          .update(updateData)
          .eq("id", fabric.id);

        if (upErr) {
          errors++;
        } else {
          success++;
          const statKey = fabric_type + (pattern_detail ? "+" + pattern_detail : "");
          stats[statKey] = (stats[statKey] || 0) + 1;
        }

        totalInputTokens += usage.promptTokenCount || 0;
        totalOutputTokens += usage.candidatesTokenCount || 0;
      } else {
        const msg = val.error || "";
        if (msg.includes("IMAGE_TOO_LARGE")) {
          console.log(`  ${val.fabric.name} 건너뛰기: ${msg}`);
        } else {
          console.error(`  ${val.fabric.name} 에러:`, msg.slice(0, 80));
        }
        errors++;
      }

      processed.add(val.fabric.id);
    }

    // 50개마다 로그
    const total = success + errors;
    if (total % 50 < CONCURRENCY || total <= 5) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      const cost = ((totalInputTokens / 1e6) * 0.15 + (totalOutputTokens / 1e6) * 0.60).toFixed(3);
      const lastFabric = batch[batch.length - 1];
      console.log(`  [${success}/${remaining.length}] ${lastFabric.name} | ${elapsed}분, $${cost} | 성공${success} 에러${errors}`);
      fs.writeFileSync(progressFile, JSON.stringify([...processed]));
    }

    // 500개마다 상세 통계
    if (total % 500 < CONCURRENCY && total >= 500) {
      fs.writeFileSync(progressFile, JSON.stringify([...processed]));
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      const cost = ((totalInputTokens / 1e6) * 0.15 + (totalOutputTokens / 1e6) * 0.60).toFixed(3);
      console.log(`\n--- ${total}개 처리 완료 (${elapsed}분, $${cost}) ---`);
      console.log("  현재 분포:", JSON.stringify(stats));
      console.log();
    }
  }

  // 진행 파일 삭제
  try { fs.unlinkSync(progressFile); } catch {}

  // 최종 결과
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const totalCost = ((totalInputTokens / 1e6) * 0.15 + (totalOutputTokens / 1e6) * 0.60).toFixed(2);

  console.log(`\n=== 분류 완료 ===`);
  console.log(`  성공: ${success}개`);
  console.log(`  에러: ${errors}개`);
  console.log(`  소요시간: ${totalTime}분`);
  console.log(`  토큰: 입력 ${(totalInputTokens / 1e6).toFixed(2)}M / 출력 ${(totalOutputTokens / 1e6).toFixed(2)}M`);
  console.log(`  비용: ~$${totalCost}`);
  console.log(`\n=== 패턴 분포 ===`);
  Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v}개`));

  // ─── 원단명 기준 패턴 통일 (같은 원단명 → 다수결로 패턴 통일) ───
  console.log(`\n=== 원단명 기준 패턴 통일 ===`);

  // 전체 원단 다시 로드 (분류 결과 반영된 상태)
  let allForUnify = [];
  let uPage = 0;
  while (true) {
    const from = uPage * 1000;
    const { data } = await supabase
      .from("fabrics")
      .select("id, name, fabric_type, pattern_detail")
      .not("image_url", "is", null)
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    allForUnify = allForUnify.concat(data);
    if (data.length < 1000) break;
    uPage++;
  }

  // 원단명별 그룹핑
  const nameGroups = {};
  for (const f of allForUnify) {
    if (!nameGroups[f.name]) nameGroups[f.name] = [];
    nameGroups[f.name].push(f);
  }

  let unifiedCount = 0;
  let conflictNames = [];

  for (const [name, fabrics] of Object.entries(nameGroups)) {
    if (fabrics.length <= 1) continue;

    // fabric_type 다수결
    const typeCounts = {};
    const patternCounts = {};
    for (const f of fabrics) {
      const t = f.fabric_type || "무지";
      const p = f.pattern_detail || "__none__";
      typeCounts[t] = (typeCounts[t] || 0) + 1;
      patternCounts[p] = (patternCounts[p] || 0) + 1;
    }

    const majorType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0][0];
    const majorPattern = Object.entries(patternCounts).sort((a, b) => b[1] - a[1])[0][0];
    const finalPattern = majorPattern === "__none__" ? null : majorPattern;

    // 불일치 원단 찾기
    const mismatch = fabrics.filter(f =>
      (f.fabric_type || "무지") !== majorType || (f.pattern_detail || null) !== finalPattern
    );

    if (mismatch.length > 0) {
      conflictNames.push(`${name}: ${mismatch.length}개 수정 (→ ${majorType}${finalPattern ? "+" + finalPattern : ""})`);

      for (const f of mismatch) {
        await supabase
          .from("fabrics")
          .update({ fabric_type: majorType, pattern_detail: finalPattern })
          .eq("id", f.id);
        unifiedCount++;
      }
    }
  }

  console.log(`  통일된 원단: ${unifiedCount}개`);
  if (conflictNames.length > 0) {
    console.log(`  수정된 원단명 (${conflictNames.length}개):`);
    conflictNames.forEach(c => console.log(`    ${c}`));
  } else {
    console.log(`  모든 원단명이 이미 통일 상태`);
  }
}

main().catch(console.error);
