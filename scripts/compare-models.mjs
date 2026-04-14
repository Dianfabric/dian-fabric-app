/**
 * GPT-4o vs Gemini 2.5 Flash 원단 분류 비교 테스트
 * 결과를 HTML로 출력하여 시각적 비교 가능
 */

import fs from "fs";
import path from "path";

// ─── 설정 ───
const envContent = fs.readFileSync(".env.local", "utf-8");
const env = {};
envContent.split("\n").forEach((line) => {
  const [key, ...vals] = line.split("=");
  if (key && vals.length) env[key.trim()] = vals.join("=").trim();
});

const GEMINI_API_KEY = env.GEMINI_API_KEY;
const OPENAI_API_KEY = env.OPENAI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";
const GPT_MODEL = "gpt-4o";

// ─── 공통 프롬프트 ───
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

// ─── Gemini API ───
async function classifyGemini(base64, mimeType) {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const start = Date.now();
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
  const elapsed = Date.now() - start;

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const result = JSON.parse(cleaned);
  const usage = data.usageMetadata || {};
  return { result, elapsed, inputTokens: usage.promptTokenCount || 0, outputTokens: usage.candidatesTokenCount || 0 };
}

// ─── GPT-4o API ───
async function classifyGPT4o(base64, mimeType) {
  const start = Date.now();
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: GPT_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "low" } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 1024,
    }),
  });
  const elapsed = Date.now() - start;

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GPT-4o ${response.status}: ${err.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim() || "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const result = JSON.parse(cleaned);
  const usage = data.usage || {};
  return { result, elapsed, inputTokens: usage.prompt_tokens || 0, outputTokens: usage.completion_tokens || 0 };
}

// ─── HTML 생성 ───
function generateHTML(results, totalStats) {
  const rows = results.map((r, i) => {
    const geminiColors = (r.gemini?.colors || []).map(c => `<span style="display:inline-block;margin:1px 3px;padding:2px 8px;border-radius:10px;font-size:11px;background:#f5f0e8;">${c.color} ${c.pct}%</span>`).join("");
    const gptColors = (r.gpt?.colors || []).map(c => `<span style="display:inline-block;margin:1px 3px;padding:2px 8px;border-radius:10px;font-size:11px;background:#e8f0f5;">${c.color} ${c.pct}%</span>`).join("");
    const match = r.gemini?.pattern === r.gpt?.pattern;
    const matchBadge = match
      ? '<span style="color:#2d8a4e;font-weight:bold;">✓ 일치</span>'
      : '<span style="color:#c0392b;font-weight:bold;">✗ 불일치</span>';

    return `
    <tr style="border-bottom:1px solid #eee;">
      <td style="padding:12px;text-align:center;font-size:13px;color:#888;">${i + 1}</td>
      <td style="padding:12px;text-align:center;">
        <img src="file:///D:/DIAN FABRIC/01_TEST/${r.filename}" style="width:120px;height:120px;object-fit:cover;border-radius:8px;border:1px solid #e0e0e0;">
        <div style="font-size:12px;font-weight:600;margin-top:6px;">${r.filename}</div>
      </td>
      <td style="padding:12px;text-align:center;">
        <div style="font-size:16px;font-weight:700;color:#8B6914;margin-bottom:6px;">${r.gemini?.pattern || 'ERROR'}</div>
        <div>${geminiColors}</div>
        <div style="font-size:10px;color:#aaa;margin-top:4px;">${r.geminiElapsed}ms</div>
      </td>
      <td style="padding:12px;text-align:center;">
        <div style="font-size:16px;font-weight:700;color:#1a5276;margin-bottom:6px;">${r.gpt?.pattern || 'ERROR'}</div>
        <div>${gptColors}</div>
        <div style="font-size:10px;color:#aaa;margin-top:4px;">${r.gptElapsed}ms</div>
      </td>
      <td style="padding:12px;text-align:center;">${matchBadge}</td>
    </tr>`;
  }).join("");

  const matchCount = results.filter(r => r.gemini?.pattern === r.gpt?.pattern).length;
  const matchRate = ((matchCount / results.length) * 100).toFixed(1);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>GPT-4o vs Gemini 2.5 Flash — 원단 분류 비교</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Noto Sans KR', sans-serif; background: #faf9f7; color: #1c1a18; padding: 30px; }
  h1 { text-align: center; font-size: 24px; margin-bottom: 8px; }
  .subtitle { text-align: center; color: #888; font-size: 14px; margin-bottom: 30px; }
  .stats { display: flex; gap: 20px; justify-content: center; margin-bottom: 30px; }
  .stat-card { background: white; border: 1px solid #e8e3dc; border-radius: 12px; padding: 16px 28px; text-align: center; }
  .stat-num { font-size: 28px; font-weight: 700; }
  .stat-label { font-size: 12px; color: #888; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
  th { background: #1c1a18; color: white; padding: 14px; font-size: 13px; font-weight: 500; letter-spacing: 1px; }
</style>
</head>
<body>
  <h1>GPT-4o vs Gemini 2.5 Flash</h1>
  <div class="subtitle">원단 분류 정확도 비교 — ${results.length}장 테스트 (${new Date().toLocaleDateString('ko-KR')})</div>

  <div class="stats">
    <div class="stat-card">
      <div class="stat-num">${results.length}</div>
      <div class="stat-label">테스트 원단</div>
    </div>
    <div class="stat-card">
      <div class="stat-num" style="color:#2d8a4e;">${matchCount} (${matchRate}%)</div>
      <div class="stat-label">패턴 분류 일치</div>
    </div>
    <div class="stat-card">
      <div class="stat-num" style="color:#c0392b;">${results.length - matchCount}</div>
      <div class="stat-label">패턴 분류 불일치</div>
    </div>
    <div class="stat-card">
      <div class="stat-num" style="color:#8B6914;">$${totalStats.geminiCost}</div>
      <div class="stat-label">Gemini 비용</div>
    </div>
    <div class="stat-card">
      <div class="stat-num" style="color:#1a5276;">$${totalStats.gptCost}</div>
      <div class="stat-label">GPT-4o 비용</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40px;">#</th>
        <th style="width:160px;">원단 이미지</th>
        <th>Gemini 2.5 Flash</th>
        <th>GPT-4o</th>
        <th style="width:90px;">비교</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

// ─── 메인 ───
async function main() {
  const testDir = "D:/DIAN FABRIC/01_TEST";
  const args = process.argv.slice(2);
  const limit = args[0] ? parseInt(args[0]) : 5;

  let files = fs.readdirSync(testDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));

  // limit이 전체보다 작으면 랜덤 샘플링
  if (limit < files.length) {
    files = files.sort(() => Math.random() - 0.5).slice(0, limit);
  }

  console.log(`\n=== GPT-4o vs Gemini 2.5 Flash 비교 테스트 ===`);
  console.log(`대상: ${files.length}장\n`);

  const results = [];
  let geminiInputTotal = 0, geminiOutputTotal = 0;
  let gptInputTotal = 0, gptOutputTotal = 0;

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const filePath = path.join(testDir, filename);
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filename).toLowerCase();
    const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
    const base64 = buffer.toString("base64");

    process.stdout.write(`  [${i + 1}/${files.length}] ${filename} ... `);

    let geminiResult = null, gptResult = null;
    let geminiElapsed = 0, gptElapsed = 0;

    // Gemini
    try {
      const g = await classifyGemini(base64, mimeType);
      geminiResult = g.result;
      geminiElapsed = g.elapsed;
      geminiInputTotal += g.inputTokens;
      geminiOutputTotal += g.outputTokens;
    } catch (err) {
      console.error(`Gemini 에러: ${err.message.slice(0, 80)}`);
    }

    // GPT-4o
    try {
      const g = await classifyGPT4o(base64, mimeType);
      gptResult = g.result;
      gptElapsed = g.elapsed;
      gptInputTotal += g.inputTokens;
      gptOutputTotal += g.outputTokens;
    } catch (err) {
      console.error(`GPT-4o 에러: ${err.message.slice(0, 80)}`);
    }

    const match = geminiResult?.pattern === gptResult?.pattern;
    console.log(`${match ? '✓' : '✗'} Gemini: ${geminiResult?.pattern || 'ERR'} | GPT: ${gptResult?.pattern || 'ERR'}`);

    results.push({
      filename,
      gemini: geminiResult,
      gpt: gptResult,
      geminiElapsed,
      gptElapsed,
    });

    // Rate limit 방지
    await new Promise(r => setTimeout(r, 500));
  }

  // 비용 계산
  const geminiCost = ((geminiInputTotal / 1e6) * 0.15 + (geminiOutputTotal / 1e6) * 0.60).toFixed(3);
  const gptCost = ((gptInputTotal / 1e6) * 2.50 + (gptOutputTotal / 1e6) * 10.00).toFixed(3);

  const matchCount = results.filter(r => r.gemini?.pattern === r.gpt?.pattern).length;

  console.log(`\n=== 결과 ===`);
  console.log(`일치: ${matchCount}/${results.length} (${((matchCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`Gemini 비용: $${geminiCost}`);
  console.log(`GPT-4o 비용: $${gptCost}`);

  // HTML 저장
  const html = generateHTML(results, { geminiCost, gptCost });
  const outputPath = "D:/DIAN FABRIC/01_TEST/comparison-result.html";
  fs.writeFileSync(outputPath, html, "utf-8");
  console.log(`\nHTML 결과: ${outputPath}`);
}

main().catch(console.error);
