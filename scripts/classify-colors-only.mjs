/**
 * 3단계: 컬러 변형 원단 색상만 Gemini 3 Flash로 분류
 * type/pattern/usage는 이미 복사됨 → colors(notes)만 분류
 * 진행 파일 지원 → 중단 후 이어하기 가능
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
const MODEL = "gemini-3-flash-preview";

// ─── 색상 전용 프롬프트 (간결) ───
const PROMPT = `Analyze this fabric image and estimate color composition as percentages (must sum to 100).
Available colors ONLY (NO 화이트 — use 아이보리):
아이보리, 베이지, 브라운, 그레이, 차콜, 블랙, 네이비, 블루, 그린, 레드, 핑크, 옐로우, 오렌지, 퍼플, 민트

Reply ONLY with JSON array (no markdown):
[{"color":"베이지","pct":60},{"color":"브라운","pct":40}]`;

// ─── Gemini API 호출 ───
async function classifyColors(imageUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const imgRes = await fetch(imageUrl, { signal: controller.signal });
  clearTimeout(timeout);
  if (!imgRes.ok) throw new Error(`Image fetch ${imgRes.status}`);
  let buffer = Buffer.from(await imgRes.arrayBuffer());

  if (buffer.byteLength > 3 * 1024 * 1024) {
    buffer = await sharp(buffer)
      .resize(400, 400, { fit: "inside" })
      .jpeg({ quality: 70 })
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
        maxOutputTokens: 256,
      },
    }),
  });

  if (response.status === 429) throw new Error("RATE_LIMITED");
  if (!response.ok) throw new Error(`API ${response.status}`);

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Empty response");

  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

// ─── 메인 ───
async function main() {
  console.log(`=== 3단계: 색상 분류 (Gemini 3 Flash) ===\n`);

  // notes가 비어있는 원단 로드 (색상 미분류)
  let allFabrics = [];
  let page = 0;
  while (true) {
    const from = page * 1000;
    const { data, error } = await supabase
      .from("fabrics")
      .select("id, name, color_code, image_url")
      .not("image_url", "is", null)
      .or("notes.is.null,notes.eq.")
      .range(from, from + 999);
    if (error) { console.error("DB 에러:", error.message); break; }
    if (!data || data.length === 0) break;
    allFabrics = allFabrics.concat(data);
    if (data.length < 1000) break;
    page++;
  }

  console.log(`색상 미분류: ${allFabrics.length}개\n`);

  if (allFabrics.length === 0) {
    console.log("분류할 원단이 없습니다.");
    return;
  }

  // 진행 파일
  const progressFile = "scripts/.color-classify-progress.json";
  let processed = new Set();
  try {
    const saved = JSON.parse(fs.readFileSync(progressFile, "utf-8"));
    processed = new Set(saved);
    console.log(`이전 진행: ${processed.size}개 완료\n`);
  } catch { /* 처음부터 */ }

  const remaining = allFabrics.filter((f) => !processed.has(f.id));
  console.log(`처리 대상: ${remaining.length}개\n`);

  let success = 0;
  let errors = 0;
  const startTime = Date.now();
  const CONCURRENCY = 3;

  for (let i = 0; i < remaining.length; i += CONCURRENCY) {
    const batch = remaining.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (fabric) => {
        let retries = 0;
        while (retries < 3) {
          try {
            const colors = await classifyColors(fabric.image_url);
            return { fabric, colors, ok: true };
          } catch (err) {
            const msg = err.message || "";
            if (msg === "RATE_LIMITED" || msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")) {
              retries++;
              await new Promise((r) => setTimeout(r, retries * 15 * 1000));
              continue;
            }
            return { fabric, error: msg, ok: false };
          }
        }
        return { fabric, error: "MAX_RETRIES", ok: false };
      })
    );

    for (const r of results) {
      const val = r.status === "fulfilled" ? r.value : null;
      if (!val) continue;

      if (val.ok) {
        const colorStr = Array.isArray(val.colors)
          ? val.colors.map((c) => `${c.color}:${c.pct}`).join(",")
          : "";

        const { error: upErr } = await supabase
          .from("fabrics")
          .update({ notes: colorStr, auto_classified: true })
          .eq("id", val.fabric.id);

        if (upErr) errors++;
        else success++;
      } else {
        errors++;
        if (errors <= 5) console.log(`  에러: ${val.fabric.name}-${val.fabric.color_code}: ${val.error}`);
      }

      processed.add(val.fabric.id);
    }

    const total = success + errors;
    if (total % 100 < CONCURRENCY || total <= 5) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      const remaining2 = ((Date.now() - startTime) / total * (remaining.length - total) / 60000).toFixed(0);
      console.log(`  [${total}/${remaining.length}] ${elapsed}분 경과, ~${remaining2}분 남음 | 성공:${success} 에러:${errors}`);
      fs.writeFileSync(progressFile, JSON.stringify([...processed]));
    }
  }

  // 진행 파일은 유지 (이어하기용)
  fs.writeFileSync(progressFile, JSON.stringify([...processed]));

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n=== 3단계 완료 ===`);
  console.log(`  성공: ${success}개`);
  console.log(`  에러: ${errors}개`);
  console.log(`  시간: ${totalTime}분`);
}

main().catch(console.error);
