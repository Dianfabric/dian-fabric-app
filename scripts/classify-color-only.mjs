/**
 * 색상 전용 Gemini 분류 (카테고리는 건드리지 않음)
 * auto_classified=false 인 신규 원단의 색상명 비율만 추출 → notes 에 저장
 * (카테고리=fabric_type/pattern_detail 은 kNN이 따로 처리)
 *
 * 실행: node scripts/classify-color-only.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const sharp = require("sharp");
import fs from "fs";

const env = {};
fs.readFileSync(".env.local", "utf-8").split("\n").forEach((l) => { const [k, ...v] = l.split("="); if (k && v.length) env[k.trim()] = v.join("=").trim(); });
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const GEMINI_API_KEY = env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";

const PROMPT = `Analyze this fabric image and estimate its color composition as percentages (must sum to 100).
Pick from these colors ONLY (NO 화이트 — use 아이보리 instead):
아이보리, 베이지, 브라운, 그레이, 차콜, 블랙, 네이비, 블루, 그린, 레드, 핑크, 옐로우, 오렌지, 퍼플, 민트
Reply ONLY with JSON (no markdown): {"colors":[{"color":"그레이","pct":70},{"color":"아이보리","pct":30}]}`;

async function classify(imageUrl) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  const imgRes = await fetch(imageUrl, { signal: controller.signal });
  clearTimeout(t);
  if (!imgRes.ok) throw new Error(`img ${imgRes.status}`);
  let buf = Buffer.from(await imgRes.arrayBuffer());
  if (buf.byteLength > 3 * 1024 * 1024) buf = await sharp(buf).resize(800, 800, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: "image/jpeg", data: buf.toString("base64") } }, { text: PROMPT }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 512, thinkingConfig: { thinkingBudget: 0 } } }),
  });
  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("empty");
  return JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
}

async function main() {
  let all = [], from = 0;
  while (true) {
    const { data } = await sb.from("fabrics").select("id, image_url, notes").eq("auto_classified", false).not("image_url", "is", "null").range(from, from + 999);
    if (!data || !data.length) break; all = all.concat(data); if (data.length < 1000) break; from += 1000;
  }
  console.log(`색상 분류 대상: ${all.length}개`);
  const progressFile = "scripts/.color-progress.json";
  let done = new Set(); try { done = new Set(JSON.parse(fs.readFileSync(progressFile, "utf-8"))); } catch {}
  const todo = all.filter((f) => !done.has(f.id));
  console.log(`남은: ${todo.length}개\n`);

  let ok = 0, err = 0; const CONC = 3; const start = Date.now();
  for (let i = 0; i < todo.length; i += CONC) {
    const batch = todo.slice(i, i + CONC);
    await Promise.all(batch.map(async (f) => {
      let retry = 0;
      while (retry < 3) {
        try {
          const r = await classify(f.image_url);
          const colorStr = (r.colors || []).map((c) => `${c.color}:${c.pct}`).join(",");
          // 기존 notes의 |rgb: 부분 보존 + 색상명 앞에 교체
          const rgbPart = (f.notes || "").match(/\|rgb:[^|]*/)?.[0] || "";
          await sb.from("fabrics").update({ notes: colorStr + rgbPart }).eq("id", f.id);
          ok++; done.add(f.id); return;
        } catch (e) {
          if (/RATE_LIMITED|429|quota|RESOURCE_EXHAUSTED/.test(e.message)) { retry++; await new Promise((r) => setTimeout(r, retry * 8000)); continue; }
          err++; done.add(f.id); return;
        }
      }
      err++; done.add(f.id);
    }));
    const n = ok + err;
    if (n % 30 < CONC) { fs.writeFileSync(progressFile, JSON.stringify([...done])); const eta = Math.ceil(((Date.now() - start) / 1000 / n) * (todo.length - n) / 60); process.stdout.write(`\r  [${n}/${todo.length}] ✓${ok} ✗${err} ETA~${eta}분   `); }
  }
  fs.writeFileSync(progressFile, JSON.stringify([...done]));
  console.log(`\n완료: ✓${ok} ✗${err}`);
  try { fs.unlinkSync(progressFile); } catch {}
}
main().catch((e) => { console.error(e); process.exit(1); });
