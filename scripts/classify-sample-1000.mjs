/**
 * Gemini 2.5 Flash 분류 — 1000개 샘플 (원단명 중복 제거)
 * 결과를 JSON + HTML로 저장하여 컨펌용
 * DB는 수정하지 않음 (컨펌 후 전체 돌리기용)
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
const SAMPLE_COUNT = 9999; // 전체 고유 원단명

// ─── 프롬프트 (최종: classify-gemini.mjs와 동일) ───
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
- 추상 (abstract): Irregular artistic design, OR non-woven random textures (fur-like, brushstrokes, marbled, chaotic fibers, crumpled). NOT geometric → use 기하학.
- 기하학 (geometric): Regular repeating geometric shapes — circles, triangles, hexagons, diamonds, lattice, grid, trellis, interlocking tiles, tessellations. Must have clear geometric regularity. Irregular/random shapes → 추상.
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

// ─── Gemini API 호출 ───
async function classifyWithGemini(imageUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
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
  return JSON.parse(cleaned);
}

// ─── HTML 생성 (드롭다운 편집 가능) ───
function generateHTML(results, outputPath) {
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
    return `<span style="display:inline-block;margin:2px;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:500;background:${bg};color:${fg};">${c.color} ${c.pct}%</span>`;
  }

  // 통계
  const typeStats = {};
  const patternStats = {};
  for (const r of results) {
    if (!r.result) continue;
    const t = r.result.type || "?";
    typeStats[t] = (typeStats[t] || 0) + 1;
    const patterns = Array.isArray(r.result.pattern) ? r.result.pattern : [r.result.pattern || "?"];
    for (const p of patterns) {
      patternStats[p] = (patternStats[p] || 0) + 1;
    }
  }

  const successCount = results.filter(r => r.result).length;
  const errorCount = results.filter(r => r.error).length;

  const typeStatsHtml = Object.entries(typeStats).sort((a,b) => b[1]-a[1])
    .map(([k,v]) => `<div class="sc"><div class="sn">${v}</div><div class="sl">${k}</div></div>`).join("");
  const patternStatsHtml = Object.entries(patternStats).sort((a,b) => b[1]-a[1])
    .map(([k,v]) => `<div class="sc"><div class="sn">${v}</div><div class="sl">${k}</div></div>`).join("");

  const typeFilters = Object.entries(typeStats).sort((a,b) => b[1]-a[1])
    .map(([k,v]) => `<button class="fbtn" onclick="filterType(this,'${k}')">${k} (${v})</button>`).join("");
  const patternFilters = Object.entries(patternStats).sort((a,b) => b[1]-a[1])
    .map(([k,v]) => `<button class="fbtn" onclick="filterPattern(this,'${k}')">${k} (${v})</button>`).join("");

  // 드롭다운 옵션
  const typeOptions = ["패브릭","벨벳","인조가죽","시어","린넨","면","울","커튼"];
  const patternOptions = ["무지","부클","하운드투스","스트라이프","체크","헤링본","추상","자연","동물","식물","큰패턴","다마스크"];
  const usageOptions = ["소파","쿠션","커튼","침대헤드","스툴","벽패널","아웃도어","친환경"];

  function makeSelect(name, options, selected, idx) {
    let html = `<select data-idx="${idx}" data-field="${name}" onchange="markEdited(this)" style="font-size:12px;padding:4px 8px;border-radius:8px;border:1px solid #ddd;font-family:inherit;cursor:pointer;">`;
    for (const o of options) {
      html += `<option value="${o}"${o === selected ? ' selected' : ''}>${o}</option>`;
    }
    html += '</select>';
    return html;
  }

  function makeCheckboxes(name, options, selected, idx) {
    const selSet = new Set(Array.isArray(selected) ? selected : [selected]);
    let html = `<div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;" data-idx="${idx}" data-field="${name}">`;
    for (const o of options) {
      const checked = selSet.has(o);
      html += `<label style="font-size:11px;padding:3px 8px;border-radius:8px;cursor:pointer;border:1.5px solid ${checked ? '#8B6914' : '#e0e0e0'};background:${checked ? 'rgba(139,105,20,0.08)' : '#fafafa'};color:${checked ? '#8B6914' : '#999'};font-weight:${checked ? '600' : '400'};transition:all 0.15s;" onmousedown="toggleCb(this)">`;
      html += `<input type="checkbox" value="${o}" ${checked ? 'checked' : ''} style="display:none;" onchange="markEdited(this)">${o}</label>`;
    }
    html += '</div>';
    return html;
  }

  let rows = "";
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const type = r.result?.type || "패브릭";
    const patterns = r.result ? (Array.isArray(r.result.pattern) ? r.result.pattern : [r.result.pattern || "무지"]) : ["무지"];
    const colors = (r.result?.colors || []).map(cTag).join("");
    const oldType = r.oldType || "-";
    const oldPattern = r.oldPattern || "-";

    rows += `<tr class="row" data-type="${type}" data-pattern="${patterns.join(",")}" data-idx="${i}" data-id="${r.id}" data-name="${r.name}" style="border-bottom:1px solid #eee;">`;
    rows += `<td style="padding:10px;text-align:center;color:#aaa;font-size:13px;">${i + 1}</td>`;
    rows += `<td style="padding:10px;text-align:center;"><img src="${r.image_url}" onclick="openImg(this.src,'${r.name}-${r.color_code}')" style="width:180px;height:180px;object-fit:cover;border-radius:10px;border:1px solid #e0e0e0;cursor:pointer;" loading="lazy"><div style="font-size:12px;font-weight:600;margin-top:5px;color:#555;">${r.name}-${r.color_code}</div></td>`;
    rows += `<td style="padding:10px;text-align:center;vertical-align:middle;"><div style="font-size:13px;color:#999;margin-bottom:3px;">${oldType}</div><div style="font-size:11px;color:#bbb;">${oldPattern}</div></td>`;
    // 편집 가능 셀
    rows += `<td style="padding:10px;text-align:center;vertical-align:middle;">`;
    rows += `<div style="margin-bottom:8px;"><span style="font-size:10px;color:#aaa;">원단종류</span><br>${makeSelect("type", typeOptions, type, i)}</div>`;
    rows += `<div style="margin-bottom:8px;"><span style="font-size:10px;color:#aaa;">패턴상세</span><br>${makeCheckboxes("pattern", patternOptions, patterns, i)}</div>`;
    rows += `<div style="margin-bottom:8px;"><span style="font-size:10px;color:#aaa;">사용처</span><br>${makeCheckboxes("usage", usageOptions, [], i)}</div>`;
    rows += `<div>${colors}</div>`;
    rows += `</td>`;
    rows += `<td style="padding:10px;text-align:center;vertical-align:middle;"><span class="status-badge" data-idx="${i}" style="background:#e8f5e9;color:#2d8a4e;font-weight:600;padding:4px 12px;border-radius:8px;font-size:11px;">AI</span></td>`;
    rows += `</tr>\n`;
  }

  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>Gemini 3 Flash 분류 — ${results.length}개 컨펌</title>
<style>
@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap");
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Noto Sans KR",sans-serif;background:#faf9f7;color:#1c1a18;padding:30px}
h1{text-align:center;font-size:24px;margin-bottom:4px}
.sub{text-align:center;color:#888;font-size:13px;margin-bottom:20px}
.stats{display:flex;gap:10px;justify-content:center;margin-bottom:14px;flex-wrap:wrap}
.sc{background:white;border:1px solid #e8e3dc;border-radius:14px;padding:10px 18px;text-align:center;min-width:70px}
.sn{font-size:20px;font-weight:700}.sl{font-size:10px;color:#888;margin-top:2px}
.section-title{font-size:12px;font-weight:700;color:#8B6914;text-align:center;margin:12px 0 6px}
.filters{display:flex;gap:6px;justify-content:center;margin-bottom:10px;flex-wrap:wrap}
.fbtn{padding:6px 14px;border-radius:10px;border:2px solid #e8e3dc;background:white;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:inherit}
.fbtn:hover{border-color:#c8a96e}.fbtn.active{background:#1c1a18;color:white;border-color:#1c1a18}
.toolbar{display:flex;gap:10px;justify-content:center;margin:20px 0;flex-wrap:wrap}
.toolbar button{padding:10px 24px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;border:none;transition:all 0.2s}
table{width:100%;border-collapse:collapse;background:white;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin-top:16px}
th{background:#1c1a18;color:white;padding:12px;font-size:12px;font-weight:500;letter-spacing:1px;position:sticky;top:0;z-index:10}
tr.hide{display:none}
tr.edited{background:#fffde7 !important}
.overlay{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:999;align-items:center;justify-content:center;cursor:pointer}
.overlay.show{display:flex}
.overlay img{max-width:90vw;max-height:90vh;object-fit:contain;border-radius:12px}
.overlay .fname{position:absolute;bottom:30px;left:50%;transform:translateX(-50%);color:white;font-size:14px;font-weight:600;background:rgba(0,0,0,0.5);padding:6px 16px;border-radius:8px}
.toast{position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#1c1a18;color:white;padding:12px 28px;border-radius:12px;font-size:13px;font-weight:600;z-index:1000;display:none}
</style></head><body>
<h1>Gemini 3 Flash — 분류 결과 컨펌</h1>
<div class="sub">${results.length}개 고유 원단 — 드롭다운/체크박스로 수정 후 JSON 내보내기</div>
<div class="stats">
<div class="sc"><div class="sn">${results.length}</div><div class="sl">전체</div></div>
<div class="sc"><div class="sn" style="color:#2d8a4e;">${successCount}</div><div class="sl">성공</div></div>
<div class="sc"><div class="sn" style="color:#c0392b;">${errorCount}</div><div class="sl">에러</div></div>
<div class="sc"><div class="sn" id="editCount" style="color:#e65100;">0</div><div class="sl">수정됨</div></div>
</div>
<div class="section-title">원단 종류 분포</div>
<div class="stats">${typeStatsHtml}</div>
<div class="section-title">패턴 분포</div>
<div class="stats">${patternStatsHtml}</div>
<div class="filters">
<button class="fbtn active" onclick="filterAll(this)">전체 (${results.length})</button>
${typeFilters}
</div>
<div class="filters">
${patternFilters}
<button class="fbtn" onclick="filterEdited(this)" style="color:#e65100;">수정됨만</button>
</div>
<div class="toolbar">
<button onclick="exportJSON()" style="background:linear-gradient(135deg,#8B6914,#C49A6C);color:white;">수정된 JSON 내보내기</button>
<button onclick="exportAllJSON()" style="background:#1c1a18;color:white;">전체 JSON 내보내기</button>
</div>
<div id="imgOverlay" class="overlay"><img src=""><div class="fname"></div></div>
<div id="toast" class="toast"></div>
<table><thead><tr>
<th style="width:36px;">#</th><th style="width:160px;">원단 이미지</th><th style="width:90px;">기존</th><th>Gemini 분류 (수정 가능)</th><th style="width:60px;">상태</th>
</tr></thead><tbody>${rows}</tbody></table>
<script>
var DATA = ${JSON.stringify(results.map(r => ({
    id: r.id, name: r.name, color_code: r.color_code, image_url: r.image_url,
    type: r.result?.type || "패브릭",
    pattern: Array.isArray(r.result?.pattern) ? r.result.pattern : [r.result?.pattern || "무지"],
    colors: r.result?.colors || [],
    oldType: r.oldType, oldPattern: r.oldPattern,
  })))};

function toggleCb(label){
  var cb=label.querySelector('input');
  cb.checked=!cb.checked;
  label.style.border='1.5px solid '+(cb.checked?'#8B6914':'#e0e0e0');
  label.style.background=cb.checked?'rgba(139,105,20,0.08)':'#fafafa';
  label.style.color=cb.checked?'#8B6914':'#999';
  label.style.fontWeight=cb.checked?'600':'400';
  markEdited(cb);
  event.preventDefault();
}
function markEdited(el){
  var row=el.closest('tr');
  row.classList.add('edited');
  var idx=row.dataset.idx;
  var badge=row.querySelector('.status-badge');
  badge.textContent='수정됨';
  badge.style.background='#fff3e0';
  badge.style.color='#e65100';
  document.getElementById('editCount').textContent=document.querySelectorAll('tr.edited').length;
}
function getRowData(row){
  var idx=parseInt(row.dataset.idx);
  var d=Object.assign({},DATA[idx]);
  var sel=row.querySelector('select[data-field=type]');
  if(sel) d.type=sel.value;
  var patBox=row.querySelector('[data-field=pattern]');
  if(patBox){d.pattern=[];patBox.querySelectorAll('input:checked').forEach(function(cb){d.pattern.push(cb.value)});if(d.pattern.length===0) d.pattern=['무지'];}
  var usageBox=row.querySelector('[data-field=usage]');
  if(usageBox){d.usage=[];usageBox.querySelectorAll('input:checked').forEach(function(cb){d.usage.push(cb.value)});}
  return d;
}
function exportJSON(){
  var edited=[];
  document.querySelectorAll('tr.edited').forEach(function(row){edited.push(getRowData(row));});
  if(edited.length===0){showToast('수정된 항목이 없습니다');return;}
  download('edited-'+edited.length+'.json',JSON.stringify(edited,null,2));
  showToast(edited.length+'개 수정 항목 JSON 내보내기 완료');
}
function exportAllJSON(){
  var all=[];
  document.querySelectorAll('tr.row').forEach(function(row){all.push(getRowData(row));});
  download('gemini-classified-all-'+all.length+'.json',JSON.stringify(all,null,2));
  showToast(all.length+'개 전체 JSON 내보내기 완료');
}
function download(name,content){
  var a=document.createElement('a');a.href='data:application/json;charset=utf-8,'+encodeURIComponent(content);
  a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a);
}
function showToast(msg){var t=document.getElementById('toast');t.textContent=msg;t.style.display='block';setTimeout(function(){t.style.display='none';},3000);}
function setActive(btn){document.querySelectorAll(".fbtn").forEach(function(b){b.classList.remove("active")});btn.classList.add("active")}
function filterAll(btn){setActive(btn);document.querySelectorAll(".row").forEach(function(r){r.classList.remove("hide")})}
function filterType(btn,t){setActive(btn);document.querySelectorAll(".row").forEach(function(r){r.classList.toggle("hide",r.dataset.type!==t)})}
function filterPattern(btn,p){setActive(btn);document.querySelectorAll(".row").forEach(function(r){r.classList.toggle("hide",!r.dataset.pattern.includes(p))})}
function filterEdited(btn){setActive(btn);document.querySelectorAll(".row").forEach(function(r){r.classList.toggle("hide",!r.classList.contains("edited"))})}
function openImg(src,name){var o=document.getElementById("imgOverlay");o.querySelector("img").src=src;o.querySelector(".fname").textContent=name;o.classList.add("show")}
document.getElementById("imgOverlay").onclick=function(){this.classList.remove("show")};
</script></body></html>`;

  fs.writeFileSync(outputPath, html, "utf-8");
}

// ─── 메인 ───
async function main() {
  console.log(`=== Gemini ${MODEL} 분류 샘플 ${SAMPLE_COUNT}개 ===\n`);

  // 전체 원단 로드
  let allFabrics = [];
  let page = 0;
  while (true) {
    const from = page * 1000;
    const { data, error } = await supabase
      .from("fabrics")
      .select("id, name, color_code, image_url, fabric_type, pattern_detail")
      .not("image_url", "is", null)
      .order("name")
      .range(from, from + 999);
    if (error) { console.error("DB 에러:", error.message); break; }
    if (!data || data.length === 0) break;
    allFabrics = allFabrics.concat(data);
    if (data.length < 1000) break;
    page++;
  }

  // 원단명 중복 제거 (첫 번째 컬러만)
  const seen = new Set();
  const unique = [];
  for (const f of allFabrics) {
    if (!seen.has(f.name)) {
      seen.add(f.name);
      unique.push(f);
    }
  }

  // 전체 고유 원단명 사용
  const samples = unique;

  console.log(`전체: ${allFabrics.length}개 → 고유: ${unique.length}개 → 샘플: ${samples.length}개\n`);

  // 진행 파일
  const progressFile = "scripts/.sample-1000-progress.json";
  let results = [];
  try {
    results = JSON.parse(fs.readFileSync(progressFile, "utf-8"));
    console.log(`이전 진행: ${results.length}개, 나머지 계속\n`);
  } catch { /* 처음부터 */ }

  const processedIds = new Set(results.map(r => r.id));
  const remaining = samples.filter(s => !processedIds.has(s.id));

  let success = 0;
  let errors = 0;
  const startTime = Date.now();
  const CONCURRENCY = 2;

  for (let i = 0; i < remaining.length; i += CONCURRENCY) {
    const batch = remaining.slice(i, i + CONCURRENCY);

    const batchResults = await Promise.allSettled(
      batch.map(async (fabric) => {
        let retries = 0;
        while (retries < 3) {
          try {
            const result = await classifyWithGemini(fabric.image_url);
            return {
              id: fabric.id,
              name: fabric.name,
              color_code: fabric.color_code,
              image_url: fabric.image_url,
              oldType: fabric.fabric_type,
              oldPattern: fabric.pattern_detail,
              result,
              error: null,
            };
          } catch (err) {
            const msg = err.message || "";
            if (msg === "RATE_LIMITED" || msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")) {
              retries++;
              await new Promise((r) => setTimeout(r, retries * 10 * 1000));
              continue;
            }
            return {
              id: fabric.id,
              name: fabric.name,
              color_code: fabric.color_code,
              image_url: fabric.image_url,
              oldType: fabric.fabric_type,
              oldPattern: fabric.pattern_detail,
              result: null,
              error: msg,
            };
          }
        }
        return {
          id: fabric.id, name: fabric.name, color_code: fabric.color_code,
          image_url: fabric.image_url, oldType: fabric.fabric_type, oldPattern: fabric.pattern_detail,
          result: null, error: "MAX_RETRIES",
        };
      })
    );

    for (const r of batchResults) {
      const val = r.status === "fulfilled" ? r.value : null;
      if (!val) continue;
      results.push(val);
      if (val.result) success++;
      else errors++;
    }

    const total = success + errors;
    if (total % 50 < CONCURRENCY || total <= 5 || i + CONCURRENCY >= remaining.length) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      const pct = ((results.length / samples.length) * 100).toFixed(0);
      console.log(`  [${results.length}/${samples.length}] ${pct}% | ${elapsed}분 | 성공:${success} 에러:${errors}`);
      fs.writeFileSync(progressFile, JSON.stringify(results, null, 0));
    }
  }

  // HTML 생성
  const htmlPath = "D:/DIAN FABRIC/01_TEST/gemini-sample-1000.html";
  const jsonPath = "D:/DIAN FABRIC/01_TEST/gemini-sample-1000.json";
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  generateHTML(results, htmlPath);

  // 진행 파일 삭제
  try { fs.unlinkSync(progressFile); } catch {}

  console.log(`\n=== 완료 ===`);
  console.log(`  성공: ${success}개`);
  console.log(`  에러: ${errors}개`);
  console.log(`  HTML: ${htmlPath}`);
  console.log(`  JSON: ${jsonPath}`);
}

main().catch(console.error);
