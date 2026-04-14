/**
 * 보강 프롬프트로 Gemini만 499장 재분류
 * 기존 결과(old-gemini-results.json)와 비교 HTML 생성
 */
import fs from "fs";
import path from "path";

const envContent = fs.readFileSync(".env.local", "utf-8");
const env = {};
envContent.split("\n").forEach((line) => {
  const [key, ...vals] = line.split("=");
  if (key && vals.length) env[key.trim()] = vals.join("=").trim();
});

const GEMINI_API_KEY = env.GEMINI_API_KEY;

const PROMPT = `You are an expert fabric/textile classifier. Analyze this fabric image carefully.
You must classify TWO things separately: fabric TYPE and PATTERN.

=== STEP 1: FABRIC TYPE (원단 종류) — pick EXACTLY ONE ===
This is about the MATERIAL/TEXTURE, not the pattern.
- 무지 (solid/plain): Default. Uniform color woven fabric with no special material characteristic.
- 벨벳 (velvet): SHINY plush surface with visible light reflection. Glossy/silky shine that changes with angle. Velvet = SHINY.
- 스웨이드 (suede): MATTE napped/brushed surface with NO shine. Dry, powdery look. Suede = MATTE. If sheen → 벨벳.
- 인조가죽 (faux leather): THIS IS THE MOST COMMONLY MISSED TYPE. Check carefully before choosing 무지.
  인조가죽 vs 일반원단 구분법:
  ✅ 인조가죽 signs: (1) Surface has NO visible thread/yarn/weave — looks like a continuous sheet,
  (2) Smooth, rubbery, plastic, or waxy texture, (3) Visible pores, grain, or pebbled bumps like real leather,
  (4) Light reflects as a broad sheen (not fiber-level glitter), (5) Surface looks coated or laminated.
  ❌ 일반원단 signs: (1) Visible threads, yarn, or weave pattern under close look,
  (2) Matte fiber texture, (3) Fabric drapes softly with visible folds.
  RULE: If you cannot see any thread/yarn/weave structure → it is 인조가죽, NOT 무지.
- 자카드 (jacquard): Woven-in pattern with visible texture variation between pattern and background.
- 시어 (sheer): Transparent or semi-transparent lightweight fabric.

=== STEP 2: PATTERN (패턴) — pick ONE or null ===
This is about the VISUAL PATTERN on the fabric. null means no pattern.
- null: No pattern. Most 무지 fabrics have no pattern.
- 부클 (boucle): ONLY if clearly visible CURLY LOOPED YARN creating bumpy 3D surface. If unsure → null.
- 하운드투스 (houndstooth): Distinct jagged check with pointed star shapes.
- 스트라이프 (stripe): Clear parallel lines.
- 체크 (check/plaid): ONLY clearly visible crossing lines with CONTRASTING COLORS. Woven basket texture is NOT check → null.
- 헤링본 (herringbone): V-shaped zigzag pattern in columns.
- 추상 (abstract): Irregular artistic/geometric pattern, OR non-woven textures (fur-like, brushstrokes, marbled, chaotic fibers).
- 자연 (nature): Landscape, water, stone patterns.
- 동물 (animal): ONLY if actual animal print is visible (leopard spots, zebra stripes, snake scales). Abstract wavy/organic textures are NOT animal → use 추상.
- 식물 (floral): Flowers, leaves, botanical patterns.
- 큰패턴 (large pattern): Large-scale decorative motifs, damask.

IMPORTANT: A fabric can be 인조가죽 type WITH 헤링본 pattern. Type and pattern are INDEPENDENT.

=== STEP 3: COLOR COMPOSITION ===
Estimate color percentages (must sum to 100).
Colors ONLY (NO 화이트 — use 아이보리):
아이보리, 베이지, 브라운, 그레이, 차콜, 블랙, 네이비, 블루, 그린, 레드, 핑크, 옐로우, 오렌지, 퍼플, 민트

Reply ONLY with JSON (no markdown, no explanation):
{"type":"원단종류","pattern":null,"colors":[{"color":"아이보리","pct":70},{"color":"베이지","pct":30}]}`;

async function classifyGemini(base64, mimeType) {
  const start = Date.now();
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI_API_KEY,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: PROMPT }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
      }),
    }
  );
  const elapsed = Date.now() - start;
  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) throw new Error("Gemini " + res.status);
  const data = await res.json();
  const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  const text = (parts && parts[0] && parts[0].text) || "";
  const cleaned = text.trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return { result: JSON.parse(cleaned), elapsed };
}

async function withRetry(fn, retries) {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (e) {
      if (e.message === "RATE_LIMITED" && i < retries - 1) {
        console.log("    rate limited, waiting " + ((i + 1) * 15) + "s...");
        await new Promise(r => setTimeout(r, (i + 1) * 15000));
        continue;
      }
      throw e;
    }
  }
}

// ─── 진행 저장/복원 ───
const progressFile = "scripts/.gemini-v2-progress.json";
let savedResults = [];
try {
  savedResults = JSON.parse(fs.readFileSync(progressFile, "utf-8"));
  console.log("이전 진행 " + savedResults.length + "개 복원");
} catch {}
const doneSet = new Set(savedResults.map(r => r.filename));

const testDir = "D:/DIAN FABRIC/01_TEST";
const allFiles = fs.readdirSync(testDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)).sort();
const remaining = allFiles.filter(f => !doneSet.has(f));

console.log("\n=== Gemini 보강 프롬프트 재분류 — " + allFiles.length + "장 ===");
console.log("완료: " + savedResults.length + " / 남은: " + remaining.length + "\n");

const results = [...savedResults];
const startTime = Date.now();
let errCount = 0;

for (let i = 0; i < remaining.length; i++) {
  const filename = remaining[i];
  const buf = fs.readFileSync(path.join(testDir, filename));
  const mime = filename.endsWith(".png") ? "image/png" : "image/jpeg";
  const b64 = buf.toString("base64");

  process.stdout.write("  [" + (savedResults.length + i + 1) + "/" + allFiles.length + "] " + filename + " ... ");

  let gemini = null, gE = 0;
  try {
    const g = await withRetry(() => classifyGemini(b64, mime), 3);
    gemini = g.result; gE = g.elapsed;
  } catch (e) { process.stdout.write("ERR "); errCount++; }

  // 새 형식 → 기존 형식으로도 표시
  const typeStr = gemini ? (gemini.type || "?") : "ERR";
  const patStr = gemini ? (gemini.pattern || "-") : "ERR";
  console.log(typeStr + (patStr !== "-" ? "+" + patStr : ""));

  results.push({ filename, gemini, gE });

  if ((i + 1) % 10 === 0) {
    fs.writeFileSync(progressFile, JSON.stringify(results));
    const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
    console.log("    --- " + (savedResults.length + i + 1) + "/" + allFiles.length + " (" + elapsed + "분) ---");
  }

  await new Promise(r => setTimeout(r, 300));
}

// 결과 JSON 저장
const jsonPath = "D:/DIAN FABRIC/01_TEST/new-gemini-results.json";
fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
console.log("\nJSON 저장: " + jsonPath);

// 원단명 기준 패턴 통일 (다수결)
console.log("\n=== 원단명 기준 패턴 통일 ===");
const nameGroups = {};
for (const r of results) {
  if (!r.gemini) continue;
  const name = r.filename.replace(/-[^-]*\.\w+$/, "").replace(/\.\w+$/, "");
  if (!nameGroups[name]) nameGroups[name] = [];
  nameGroups[name].push(r);
}

let unifiedCount = 0;
for (const [name, group] of Object.entries(nameGroups)) {
  if (group.length <= 1) continue;
  const typeCounts = {};
  const patCounts = {};
  for (const r of group) {
    const t = r.gemini.type || "무지";
    const p = r.gemini.pattern || "__none__";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
    patCounts[p] = (patCounts[p] || 0) + 1;
  }
  const majorType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0][0];
  const majorPat = Object.entries(patCounts).sort((a, b) => b[1] - a[1])[0][0];
  const finalPat = majorPat === "__none__" ? null : majorPat;

  for (const r of group) {
    if (r.gemini.type !== majorType || (r.gemini.pattern || null) !== finalPat) {
      r.gemini.type = majorType;
      r.gemini.pattern = finalPat;
      unifiedCount++;
    }
  }
}
console.log("통일 수정: " + unifiedCount + "개");

// 통일 후 JSON 다시 저장
fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));

// 진행 파일 삭제
try { fs.unlinkSync(progressFile); } catch {}

console.log("\n=== 완료 ===");
console.log("에러: " + errCount);
console.log("결과: " + jsonPath);
console.log("\nHTML 생성: node scripts/generate-compare-html.mjs");
