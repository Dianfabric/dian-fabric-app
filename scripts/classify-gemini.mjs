/**
 * Gemini 2.5 Flash로 전체 원단 패턴/색상 분류
 * 부클 과잉분류 방지 프롬프트 + 진행 파일 + 자동 재시작
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// ─── 설정 ───
const envContent = fs.readFileSync(".env.local", "utf-8");
const env = {};
envContent.split("\n").forEach((line) => {
  const [key, ...vals] = line.split("=");
  if (key && vals.length) env[key.trim()] = vals.join("=").trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const GEMINI_API_KEY = "AIzaSyAj1Q-jqSqkhAoNjvzOiAIcfZ-k9Vf9q2c";
const MODEL = "gemini-2.5-flash";

// ─── 프롬프트 (부클 과잉분류 방지 + 컬러 비율) ───
const PROMPT = `You are an expert fabric/textile classifier. Analyze this fabric image carefully.

IMPORTANT CLASSIFICATION RULES:
- 부클 (boucle): ONLY if you can clearly see CURLY, LOOPED YARN creating a bumpy 3D surface.
  Regular woven texture, tweed weave, or slightly rough surface is NOT boucle.
  If unsure between 부클 and 무지, choose 무지.
- 무지 (solid/plain): Uniform color fabric. Can have texture (linen texture, canvas weave, etc.)
  but NO distinct pattern. Most fabrics fall here. When in doubt, choose 무지.
- 벨벳 (velvet): Soft, plush surface with visible sheen/pile
- 스웨이드 (suede): Matte, napped/brushed surface like suede leather
- 인조가죽 (faux leather): Smooth or pebbled leather-like surface
- 하운드투스 (houndstooth): Distinct jagged check pattern with pointed star shapes
- 스트라이프 (stripe): Clear parallel lines
- 체크 (check/plaid): Crossing lines forming squares/rectangles
- 헤링본 (herringbone): V-shaped zigzag pattern in columns
- 추상 (abstract): Irregular artistic/geometric pattern
- 자연 (nature): Landscape, water, stone patterns
- 동물 (animal): Animal print (leopard, zebra, snake, etc.)
- 식물 (floral): Flowers, leaves, botanical patterns
- 큰패턴 (large pattern): Large-scale decorative motifs, damask
- 자카드 (jacquard): Woven-in pattern with visible texture variation

Pick EXACTLY ONE category.

Also estimate the color composition as percentages (must sum to 100).
Pick from these colors ONLY (NO 화이트 — use 아이보리 instead):
아이보리, 베이지, 브라운, 그레이, 차콜, 블랙, 네이비, 블루, 그린, 레드, 핑크, 옐로우, 오렌지, 퍼플, 민트

Reply ONLY with JSON (no markdown, no explanation):
{"pattern":"카테고리명","colors":[{"color":"아이보리","pct":70},{"color":"베이지","pct":30}]}`;

// ─── fabric_type 매핑 ───
const SUB_PATTERNS = new Set([
  "부클", "하운드투스", "스트라이프", "체크", "헤링본",
  "추상", "자연", "동물", "식물", "큰패턴", "자카드",
]);

function mapToDbFields(pattern) {
  if (SUB_PATTERNS.has(pattern)) {
    return { fabric_type: "패턴", pattern_detail: pattern };
  }
  return { fabric_type: pattern, pattern_detail: null };
}

// ─── Gemini API 호출 ───
async function classifyWithGemini(imageUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const imgRes = await fetch(imageUrl, { signal: controller.signal });
  clearTimeout(timeout);
  if (!imgRes.ok) throw new Error(`Image fetch ${imgRes.status}`);
  const buffer = await imgRes.arrayBuffer();

  if (buffer.byteLength > 5 * 1024 * 1024) {
    throw new Error(`IMAGE_TOO_LARGE (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB)`);
  }

  const base64 = Buffer.from(buffer).toString("base64");
  const mimeType = imgRes.headers.get("content-type") || "image/jpeg";

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
  const CONCURRENCY = 5; // 동시 5개 병렬 처리

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
            if (msg === "RATE_LIMITED" || msg.includes("429") || msg.includes("quota")) {
              retries++;
              const wait = retries * 30;
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
        const { pattern, colors } = result;
        const { fabric_type, pattern_detail } = mapToDbFields(pattern);
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
          stats[pattern] = (stats[pattern] || 0) + 1;
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
}

main().catch(console.error);
