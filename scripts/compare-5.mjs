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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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
  if (!res.ok) throw new Error("Gemini " + res.status + ": " + (await res.text()).slice(0, 200));
  const data = await res.json();
  const text = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || "";
  const cleaned = text.trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return { result: JSON.parse(cleaned), elapsed, usage: data.usageMetadata || {} };
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
  if (!res.ok) throw new Error("GPT-4o " + res.status + ": " + (await res.text()).slice(0, 300));
  const data = await res.json();
  const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  const cleaned = text.trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return { result: JSON.parse(cleaned), elapsed, usage: data.usage || {} };
}

const FILES = ["1808-05.jpg", "68511-02.jpg", "68286-01.jpg", "BUFFALO-09.jpg", "HL2205-03.jpg"];
const testDir = "D:/DIAN FABRIC/01_TEST";
const results = [];

console.log("\n=== GPT-4o vs Gemini 2.5 Flash - 5 sample test ===\n");

for (const filename of FILES) {
  const buf = fs.readFileSync(path.join(testDir, filename));
  const mime = filename.endsWith(".png") ? "image/png" : "image/jpeg";
  const b64 = buf.toString("base64");
  process.stdout.write("  " + filename + " ... ");

  let gemini = null, gpt = null, gE = 0, oE = 0;
  try {
    const g = await classifyGemini(b64, mime);
    gemini = g.result;
    gE = g.elapsed;
  } catch (e) {
    console.error("Gemini err:", e.message.slice(0, 80));
  }

  try {
    const g = await classifyGPT4o(b64, mime);
    gpt = g.result;
    oE = g.elapsed;
  } catch (e) {
    console.error("GPT err:", e.message.slice(0, 80));
  }

  const match = gemini && gpt && gemini.pattern === gpt.pattern;
  console.log((match ? "V" : "X") + " Gemini: " + (gemini ? gemini.pattern : "ERR") + " | GPT: " + (gpt ? gpt.pattern : "ERR"));
  results.push({ filename, gemini, gpt, gE, oE });
  await new Promise((r) => setTimeout(r, 500));
}

// Generate HTML with embedded base64 images
const mc = results.filter((r) => r.gemini && r.gpt && r.gemini.pattern === r.gpt.pattern).length;

const colorMap = {
  "아이보리": "#FFFFF0", "베이지": "#D4B896", "브라운": "#8B4513", "그레이": "#9E9E9E",
  "차콜": "#36454F", "블랙": "#1a1a1a", "네이비": "#1B2A4A", "블루": "#4285f4",
  "그린": "#2e7d32", "레드": "#e53935", "핑크": "#ec407a", "옐로우": "#fdd835",
  "오렌지": "#fb8c00", "퍼플": "#7b1fa2", "민트": "#26a69a",
};

function colorTag(c) {
  const bg = colorMap[c.color] || "#ccc";
  const dark = ["블랙", "네이비", "차콜", "브라운", "퍼플", "그린", "레드", "블루"].includes(c.color);
  return '<span style="display:inline-block;margin:2px;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:500;background:' + bg + ";color:" + (dark ? "#fff" : "#333") + ';">' + c.color + " " + c.pct + "%</span>";
}

let rows = "";
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  const imgBuf = fs.readFileSync(path.join(testDir, r.filename));
  const imgB64 = imgBuf.toString("base64");
  const imgMime = r.filename.endsWith(".png") ? "image/png" : "image/jpeg";

  const gc = (r.gemini && r.gemini.colors || []).map(colorTag).join("");
  const oc = (r.gpt && r.gpt.colors || []).map(colorTag).join("");
  const match = r.gemini && r.gpt && r.gemini.pattern === r.gpt.pattern;

  rows += '<tr style="border-bottom:1px solid #eee;">';
  rows += '<td style="padding:14px;text-align:center;color:#aaa;font-size:13px;">' + (i + 1) + "</td>";
  rows += '<td style="padding:14px;text-align:center;"><img src="data:' + imgMime + ";base64," + imgB64 + '" style="width:150px;height:150px;object-fit:cover;border-radius:10px;border:1px solid #e0e0e0;"><div style="font-size:12px;font-weight:600;margin-top:8px;color:#555;">' + r.filename + "</div></td>";
  rows += '<td style="padding:14px;text-align:center;"><div style="font-size:20px;font-weight:700;color:#8B6914;margin-bottom:8px;">' + (r.gemini ? r.gemini.pattern : "ERROR") + '</div><div style="margin-bottom:4px;">' + gc + '</div><div style="font-size:10px;color:#bbb;margin-top:6px;">' + r.gE + "ms</div></td>";
  rows += '<td style="padding:14px;text-align:center;"><div style="font-size:20px;font-weight:700;color:#1a5276;margin-bottom:8px;">' + (r.gpt ? r.gpt.pattern : "ERROR") + '</div><div style="margin-bottom:4px;">' + oc + '</div><div style="font-size:10px;color:#bbb;margin-top:6px;">' + r.oE + "ms</div></td>";
  rows += '<td style="padding:14px;text-align:center;">' + (match ? '<span style="background:#e8f5e9;color:#2d8a4e;font-weight:700;padding:4px 12px;border-radius:8px;font-size:13px;">&#10003; 일치</span>' : '<span style="background:#fce4ec;color:#c0392b;font-weight:700;padding:4px 12px;border-radius:8px;font-size:13px;">&#10007; 불일치</span>') + "</td>";
  rows += "</tr>";
}

const html = '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>GPT-4o vs Gemini 2.5 Flash</title>' +
  '<style>@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap");' +
  "*{box-sizing:border-box;margin:0;padding:0}" +
  "body{font-family:'Noto Sans KR',sans-serif;background:#faf9f7;color:#1c1a18;padding:40px}" +
  "h1{text-align:center;font-size:26px;margin-bottom:6px}" +
  ".sub{text-align:center;color:#888;font-size:14px;margin-bottom:30px}" +
  ".stats{display:flex;gap:20px;justify-content:center;margin-bottom:30px;flex-wrap:wrap}" +
  ".sc{background:white;border:1px solid #e8e3dc;border-radius:14px;padding:18px 32px;text-align:center;min-width:120px}" +
  ".sn{font-size:30px;font-weight:700}.sl{font-size:12px;color:#888;margin-top:4px}" +
  "table{width:100%;border-collapse:collapse;background:white;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06)}" +
  "th{background:#1c1a18;color:white;padding:16px;font-size:13px;font-weight:500;letter-spacing:1px}" +
  "</style></head><body>" +
  "<h1>GPT-4o vs Gemini 2.5 Flash</h1>" +
  '<div class="sub">원단 분류 비교 — 5장 샘플 테스트 (' + new Date().toLocaleDateString("ko-KR") + ")</div>" +
  '<div class="stats">' +
  '<div class="sc"><div class="sn">5</div><div class="sl">테스트 원단</div></div>' +
  '<div class="sc"><div class="sn" style="color:#2d8a4e;">' + mc + "/5</div>" + '<div class="sl">패턴 일치</div></div>' +
  '<div class="sc"><div class="sn" style="color:#c0392b;">' + (5 - mc) + "</div>" + '<div class="sl">불일치</div></div>' +
  "</div>" +
  "<table><thead><tr><th style='width:40px;'>#</th><th style='width:190px;'>원단 이미지</th><th>Gemini 2.5 Flash</th><th>GPT-4o</th><th style='width:100px;'>비교</th></tr></thead>" +
  "<tbody>" + rows + "</tbody></table></body></html>";

fs.writeFileSync("D:/DIAN FABRIC/01_TEST/comparison-5.html", html, "utf-8");
console.log("\nHTML 결과 저장: D:/DIAN FABRIC/01_TEST/comparison-5.html");
