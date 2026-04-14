import fs from "fs";
import path from "path";

const envContent = fs.readFileSync(".env.local", "utf-8");
const env = {};
envContent.split("\n").forEach((line) => {
  const [key, ...vals] = line.split("=");
  if (key && vals.length) env[key.trim()] = vals.join("=").trim();
});

const GEMINI_API_KEY = env.GEMINI_API_KEY;
const OPENAI_API_KEY = env.OPENAI_API_KEY;

const PROMPT = `You are an expert fabric/textile classifier. Analyze this fabric image carefully.

IMPORTANT CLASSIFICATION RULES:
- 부클 (boucle): ONLY if you can clearly see CURLY, LOOPED YARN creating a bumpy 3D surface. Regular woven texture, tweed weave, or slightly rough surface is NOT boucle. If unsure between 부클 and 무지, choose 무지.
- 무지 (solid/plain): Uniform color fabric. Can have texture (linen texture, canvas weave, etc.) but NO distinct pattern. Most fabrics fall here. When in doubt, choose 무지.
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

async function classifyGPT4o(base64, mimeType) {
  const start = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + OPENAI_API_KEY },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "data:" + mimeType + ";base64," + base64, detail: "low" } }, { type: "text", text: PROMPT }] }],
      temperature: 0.1,
      max_tokens: 1024,
    }),
  });
  const elapsed = Date.now() - start;
  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) throw new Error("GPT-4o " + res.status);
  const data = await res.json();
  const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
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
const progressFile = "scripts/.compare-progress.json";
let savedResults = [];
try {
  savedResults = JSON.parse(fs.readFileSync(progressFile, "utf-8"));
  console.log("이전 진행 " + savedResults.length + "개 복원");
} catch { /* 처음부터 */ }
const doneSet = new Set(savedResults.map(r => r.filename));

const testDir = "D:/DIAN FABRIC/01_TEST";
const allFiles = fs.readdirSync(testDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)).sort();
const remaining = allFiles.filter(f => !doneSet.has(f));

console.log("\n=== GPT-4o vs Gemini 2.5 Flash — " + allFiles.length + "장 전체 비교 ===");
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

  let gemini = null, gpt = null, gE = 0, oE = 0;

  try {
    const g = await withRetry(() => classifyGemini(b64, mime), 3);
    gemini = g.result; gE = g.elapsed;
  } catch (e) { process.stdout.write("G-ERR "); errCount++; }

  try {
    const g = await withRetry(() => classifyGPT4o(b64, mime), 3);
    gpt = g.result; oE = g.elapsed;
  } catch (e) { process.stdout.write("O-ERR "); errCount++; }

  const match = gemini && gpt && gemini.pattern === gpt.pattern;
  console.log((match ? "V" : "X") + " G:" + (gemini ? gemini.pattern : "ERR") + " O:" + (gpt ? gpt.pattern : "ERR"));

  results.push({ filename, gemini, gpt, gE, oE });

  // 10개마다 진행 저장
  if ((i + 1) % 10 === 0) {
    fs.writeFileSync(progressFile, JSON.stringify(results));
    const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
    const done = savedResults.length + i + 1;
    console.log("    --- " + done + "/" + allFiles.length + " (" + elapsed + "분) ---");
  }

  await new Promise(r => setTimeout(r, 300));
}

// 결과 JSON 저장 (HTML 생성 실패 대비)
const jsonPath = "D:/DIAN FABRIC/01_TEST/comparison-results.json";
fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
console.log("JSON 저장: " + jsonPath);

// 진행 파일 삭제
try { fs.unlinkSync(progressFile); } catch {}

// ─── HTML 생성 ───
const colorMap = {
  "아이보리": "#FFFFF0", "베이지": "#D4B896", "브라운": "#8B4513", "그레이": "#9E9E9E",
  "차콜": "#36454F", "블랙": "#1a1a1a", "네이비": "#1B2A4A", "블루": "#4285f4",
  "그린": "#2e7d32", "레드": "#e53935", "핑크": "#ec407a", "옐로우": "#fdd835",
  "오렌지": "#fb8c00", "퍼플": "#7b1fa2", "민트": "#26a69a",
};
const darkColors = new Set(["블랙", "네이비", "차콜", "브라운", "퍼플", "그린", "레드", "블루"]);

function cTag(c) {
  const bg = colorMap[c.color] || "#ccc";
  const fg = darkColors.has(c.color) ? "#fff" : "#333";
  return '<span style="display:inline-block;margin:2px;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:500;background:' + bg + ";color:" + fg + ';">' + c.color + " " + c.pct + "%</span>";
}

console.log("\nHTML 생성 중...");

const mc = results.filter(r => r.gemini && r.gpt && r.gemini.pattern === r.gpt.pattern).length;
const mismatch = results.length - mc;
const matchRate = ((mc / results.length) * 100).toFixed(1);

let rows = "";
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  const imgSrc = "file:///D:/DIAN FABRIC/01_TEST/" + encodeURIComponent(r.filename).replace(/%20/g, " ");
  const gc = (r.gemini && r.gemini.colors || []).map(cTag).join("");
  const oc = (r.gpt && r.gpt.colors || []).map(cTag).join("");
  const isMatch = r.gemini && r.gpt && r.gemini.pattern === r.gpt.pattern;

  rows += '<tr class="row ' + (isMatch ? "match" : "mismatch") + '" style="border-bottom:1px solid #eee;">';
  rows += '<td style="padding:12px;text-align:center;color:#aaa;font-size:13px;">' + (i + 1) + "</td>";
  rows += '<td style="padding:12px;text-align:center;"><img src="' + imgSrc + '" style="width:130px;height:130px;object-fit:cover;border-radius:10px;border:1px solid #e0e0e0;" loading="lazy"><div style="font-size:11px;font-weight:600;margin-top:6px;color:#555;">' + r.filename + "</div></td>";
  rows += '<td style="padding:12px;text-align:center;"><div style="font-size:18px;font-weight:700;color:#8B6914;margin-bottom:6px;">' + (r.gemini ? r.gemini.pattern : "ERROR") + "</div><div>" + gc + '</div><div style="font-size:10px;color:#bbb;margin-top:4px;">' + r.gE + "ms</div></td>";
  rows += '<td style="padding:12px;text-align:center;"><div style="font-size:18px;font-weight:700;color:#1a5276;margin-bottom:6px;">' + (r.gpt ? r.gpt.pattern : "ERROR") + "</div><div>" + oc + '</div><div style="font-size:10px;color:#bbb;margin-top:4px;">' + r.oE + "ms</div></td>";
  rows += '<td style="padding:12px;text-align:center;">' + (isMatch ? '<span style="background:#e8f5e9;color:#2d8a4e;font-weight:700;padding:4px 12px;border-radius:8px;font-size:12px;">&#10003; 일치</span>' : '<span style="background:#fce4ec;color:#c0392b;font-weight:700;padding:4px 12px;border-radius:8px;font-size:12px;">&#10007; 불일치</span>') + "</td>";
  rows += "</tr>\n";

  if ((i + 1) % 50 === 0) process.stdout.write("  HTML " + (i + 1) + "/" + results.length + "...\r");
}

const html = '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>GPT-4o vs Gemini 2.5 Flash — ' + results.length + '장 비교</title>' +
'<style>' +
'@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap");' +
'*{box-sizing:border-box;margin:0;padding:0}' +
'body{font-family:"Noto Sans KR",sans-serif;background:#faf9f7;color:#1c1a18;padding:40px}' +
'h1{text-align:center;font-size:26px;margin-bottom:6px}' +
'.sub{text-align:center;color:#888;font-size:14px;margin-bottom:24px}' +
'.stats{display:flex;gap:16px;justify-content:center;margin-bottom:20px;flex-wrap:wrap}' +
'.sc{background:white;border:1px solid #e8e3dc;border-radius:14px;padding:16px 28px;text-align:center;min-width:110px}' +
'.sn{font-size:28px;font-weight:700}.sl{font-size:12px;color:#888;margin-top:4px}' +
'.filters{display:flex;gap:10px;justify-content:center;margin-bottom:24px}' +
'.fbtn{padding:10px 24px;border-radius:12px;border:2px solid #e8e3dc;background:white;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:inherit}' +
'.fbtn:hover{border-color:#c8a96e}.fbtn.active{background:#1c1a18;color:white;border-color:#1c1a18}' +
'table{width:100%;border-collapse:collapse;background:white;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06)}' +
'th{background:#1c1a18;color:white;padding:14px;font-size:13px;font-weight:500;letter-spacing:1px;position:sticky;top:0;z-index:10}' +
'tr.hide{display:none}' +
'</style></head><body>' +
'<h1>GPT-4o vs Gemini 2.5 Flash</h1>' +
'<div class="sub">원단 분류 비교 — ' + results.length + '장 전체 테스트 (' + new Date().toLocaleDateString("ko-KR") + ')</div>' +
'<div class="stats">' +
'<div class="sc"><div class="sn">' + results.length + '</div><div class="sl">테스트 원단</div></div>' +
'<div class="sc"><div class="sn" style="color:#2d8a4e;">' + mc + ' (' + matchRate + '%)</div><div class="sl">패턴 일치</div></div>' +
'<div class="sc"><div class="sn" style="color:#c0392b;">' + mismatch + '</div><div class="sl">불일치</div></div>' +
'</div>' +
'<div class="filters">' +
'<button class="fbtn active" onclick="filterAll(this)">전체 (' + results.length + ')</button>' +
'<button class="fbtn" onclick="filterMatch(this)" style="color:#2d8a4e;">&#10003; 일치만 (' + mc + ')</button>' +
'<button class="fbtn" onclick="filterMismatch(this)" style="color:#c0392b;">&#10007; 불일치만 (' + mismatch + ')</button>' +
'</div>' +
'<table><thead><tr>' +
'<th style="width:40px;">#</th><th style="width:170px;">원단 이미지</th><th>Gemini 2.5 Flash</th><th>GPT-4o</th><th style="width:100px;">비교</th>' +
'</tr></thead><tbody>' + rows + '</tbody></table>' +
'<script>' +
'function setActive(btn){document.querySelectorAll(".fbtn").forEach(b=>b.classList.remove("active"));btn.classList.add("active")}' +
'function filterAll(btn){setActive(btn);document.querySelectorAll(".row").forEach(r=>r.classList.remove("hide"))}' +
'function filterMatch(btn){setActive(btn);document.querySelectorAll(".row").forEach(r=>{r.classList.toggle("hide",!r.classList.contains("match"))})}' +
'function filterMismatch(btn){setActive(btn);document.querySelectorAll(".row").forEach(r=>{r.classList.toggle("hide",!r.classList.contains("mismatch"))})}' +
'</script></body></html>';

const outputPath = "D:/DIAN FABRIC/01_TEST/comparison-full.html";
fs.writeFileSync(outputPath, html, "utf-8");
console.log("\n\n=== 완료 ===");
console.log("일치: " + mc + "/" + results.length + " (" + matchRate + "%)");
console.log("에러: " + errCount);
console.log("HTML: " + outputPath);
