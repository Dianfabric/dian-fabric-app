/**
 * Claude Haiku 4.5로 전체 원단 패턴/색상 분류
 * 이미지를 직접 보고 판단 → CLIP보다 훨씬 정확
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
const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
const MODEL = "claude-haiku-4-5-20251001";

// ─── 프롬프트 ───
const PROMPT = `Classify this fabric image. Reply ONLY with JSON (no markdown, no explanation):
{"pattern":"카테고리명","colors":["색상1","색상2"]}

Pattern categories (pick ONE):
무지 (solid/plain), 벨벳 (velvet), 스웨이드 (suede), 인조가죽 (faux leather),
부클 (boucle/looped texture), 하운드투스 (houndstooth), 스트라이프 (stripe),
체크 (check/plaid), 헤링본 (herringbone), 추상 (abstract), 자연 (nature),
동물 (animal print), 식물 (floral/botanical), 큰패턴 (large pattern), 자카드 (jacquard)

Colors (pick 1-3):
화이트,아이보리,베이지,브라운,그레이,차콜,블랙,네이비,블루,그린,레드,핑크,옐로우,오렌지,퍼플,민트`;

// ─── fabric_type 매핑 ───
const SUB_PATTERNS = new Set([
  "부클", "하운드투스", "스트라이프", "체크", "헤링본",
  "추상", "자연", "동물", "식물", "큰패턴", "자카드",
]);

function mapToDbFields(pattern) {
  if (SUB_PATTERNS.has(pattern)) {
    return { fabric_type: "패턴", pattern_detail: pattern };
  }
  // 무지, 벨벳, 스웨이드, 인조가죽 등은 그대로
  return { fabric_type: pattern, pattern_detail: null };
}

// ─── Haiku API 호출 ───
async function classifyWithHaiku(imageUrl) {
  // 이미지 다운로드 (10초 타임아웃)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const imgRes = await fetch(imageUrl, { signal: controller.signal });
  clearTimeout(timeout);
  if (!imgRes.ok) throw new Error(`Image fetch ${imgRes.status}`);
  const buffer = await imgRes.arrayBuffer();

  // 5MB 이상 이미지는 건너뛰기
  if (buffer.byteLength > 5 * 1024 * 1024) {
    throw new Error(`IMAGE_TOO_LARGE (${(buffer.byteLength/1024/1024).toFixed(1)}MB)`);
  }

  const base64 = Buffer.from(buffer).toString("base64");
  const mime = imgRes.headers.get("content-type") || "image/jpeg";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 80,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mime, data: base64 } },
          { type: "text", text: PROMPT },
        ],
      }],
    }),
  });

  if (response.status === 429) {
    throw new Error("RATE_LIMITED");
  }
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    || data.content?.[0]?.text || "";
  const usage = data.usage || {};

  // JSON 파싱
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const result = JSON.parse(cleaned);
  return { result, usage };
}

// ─── 메인 ───
async function main() {
  console.log("=== Claude Haiku 원단 분류 ===");
  console.log(`모델: ${MODEL}\n`);

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

  // 진행 상황 파일 (중단 후 재시작 대비)
  const progressFile = "scripts/.haiku-progress.json";
  let processed = new Set();
  try {
    const saved = JSON.parse(fs.readFileSync(progressFile, "utf-8"));
    processed = new Set(saved);
    console.log(`이전 진행 상황: ${processed.size}개 완료, 나머지 계속\n`);
  } catch { /* 없으면 처음부터 */ }

  // 통계
  let success = 0;
  let errors = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const stats = {};
  const startTime = Date.now();

  for (let i = 0; i < allFabrics.length; i++) {
    const fabric = allFabrics[i];

    // 이미 처리된 건 건너뛰기
    if (processed.has(fabric.id)) continue;

    let retries = 0;
    while (retries < 3) {
      try {
        const { result, usage } = await classifyWithHaiku(fabric.image_url);
        const { pattern, colors } = result;
        const { fabric_type, pattern_detail } = mapToDbFields(pattern);
        const colorStr = Array.isArray(colors) ? colors.join(",") : "";

        // DB 업데이트 (린넨/면/울 fabric_type은 유지, pattern_detail과 colors만 업데이트)
        const updateData = { pattern_detail, notes: colorStr };

        // 린넨/면/울이 아닌 경우에만 fabric_type도 업데이트
        const keepType = ["린넨", "면", "울"].includes(fabric.fabric_type);
        if (!keepType) {
          updateData.fabric_type = fabric_type;
        }

        const { error: upErr } = await supabase
          .from("fabrics")
          .update(updateData)
          .eq("id", fabric.id);

        if (upErr) {
          console.error(`  [${i + 1}] ${fabric.name} DB에러:`, upErr.message);
          errors++;
        } else {
          success++;
          const label = keepType ? `${fabric.fabric_type}/${pattern}` : pattern;
          stats[pattern] = (stats[pattern] || 0) + 1;
        }

        totalInputTokens += usage.input_tokens || 0;
        totalOutputTokens += usage.output_tokens || 0;

        // 진행 저장
        processed.add(fabric.id);

        // 20개마다 로그 + 진행 저장
        if (success % 20 === 0 || success <= 3) {
          const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
          const cost = ((totalInputTokens / 1e6) * 0.80 + (totalOutputTokens / 1e6) * 4.0).toFixed(3);
          console.log(`  [${success}/${allFabrics.length - processed.size + success}] ${fabric.name} → ${pattern} (${colorStr}) | ${elapsed}분, $${cost}`);
          fs.writeFileSync(progressFile, JSON.stringify([...processed]));
        }

        break; // 성공 → 다음 원단

      } catch (err) {
        const msg = err.message || "";
        if (msg === "RATE_LIMITED" || msg.includes("529") || msg.includes("overloaded")) {
          retries++;
          const wait = retries * 20;
          console.log(`  Rate limit/overloaded — ${wait}초 대기 (재시도 ${retries}/3)`);
          await new Promise((r) => setTimeout(r, wait * 1000));
          continue;
        }
        if (msg.includes("IMAGE_TOO_LARGE")) {
          console.log(`  [${i + 1}] ${fabric.name} 건너뛰기: ${msg}`);
        } else {
          console.error(`  [${i + 1}] ${fabric.name} 에러:`, msg.slice(0, 80));
        }
        errors++;
        processed.add(fabric.id);
        break;
      }
    }

    // API 속도 조절 (분당 ~50 요청 → 약 1.2초 간격)
    await new Promise((r) => setTimeout(r, 800));
  }

  // 진행 파일 삭제
  try { fs.unlinkSync(progressFile); } catch {}

  // 최종 결과
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  const totalCost = ((totalInputTokens / 1e6) * 0.80 + (totalOutputTokens / 1e6) * 4.0).toFixed(2);

  console.log(`\n=== 분류 완료 ===`);
  console.log(`  성공: ${success}개`);
  console.log(`  에러: ${errors}개`);
  console.log(`  소요시간: ${totalTime}분`);
  console.log(`  토큰: 입력 ${(totalInputTokens/1e6).toFixed(2)}M / 출력 ${(totalOutputTokens/1e6).toFixed(2)}M`);
  console.log(`  비용: $${totalCost}`);
  console.log(`\n=== 패턴 분포 ===`);
  Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v}개`));
}

main().catch(console.error);
