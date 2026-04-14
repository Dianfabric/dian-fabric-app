/**
 * 진행 중인 비교 결과 JSON → HTML 생성 (별도 실행)
 */
import fs from "fs";

const progressFile = "scripts/.compare-progress.json";
const jsonFile = "D:/DIAN FABRIC/01_TEST/comparison-results.json";

let results;
if (fs.existsSync(jsonFile)) {
  results = JSON.parse(fs.readFileSync(jsonFile, "utf-8"));
  console.log("완료된 JSON에서 로드: " + results.length + "개");
} else if (fs.existsSync(progressFile)) {
  results = JSON.parse(fs.readFileSync(progressFile, "utf-8"));
  console.log("진행 중 파일에서 로드: " + results.length + "개");
} else {
  console.error("결과 파일 없음"); process.exit(1);
}

const testDir = "D:/DIAN FABRIC/01_TEST";
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

const mc = results.filter(r => r.gemini && r.gpt && r.gemini.pattern === r.gpt.pattern).length;
const mismatch = results.length - mc;
const matchRate = ((mc / results.length) * 100).toFixed(1);

let rows = "";
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  const imgSrc = "file:///D:/DIAN FABRIC/01_TEST/" + r.filename;
  const gc = (r.gemini && r.gemini.colors || []).map(cTag).join("");
  const oc = (r.gpt && r.gpt.colors || []).map(cTag).join("");
  const isMatch = r.gemini && r.gpt && r.gemini.pattern === r.gpt.pattern;

  rows += '<tr class="row ' + (isMatch ? "match" : "mismatch") + '" style="border-bottom:1px solid #eee;">';
  rows += '<td style="padding:12px;text-align:center;color:#aaa;font-size:13px;">' + (i + 1) + "</td>";
  rows += '<td style="padding:12px;text-align:center;"><img src="' + imgSrc + '" onclick="openImg(this.src,\'' + r.filename.replace(/'/g, "\\'") + '\')" style="width:220px;height:220px;object-fit:cover;border-radius:10px;border:1px solid #e0e0e0;cursor:pointer;" loading="lazy"><div style="font-size:11px;font-weight:600;margin-top:6px;color:#555;">' + r.filename + "</div></td>";
  rows += '<td style="padding:12px;text-align:center;"><div style="font-size:18px;font-weight:700;color:#8B6914;margin-bottom:6px;">' + (r.gemini ? r.gemini.pattern : "ERROR") + "</div><div>" + gc + '</div><div style="font-size:10px;color:#bbb;margin-top:4px;">' + (r.gE || 0) + "ms</div></td>";
  rows += '<td style="padding:12px;text-align:center;"><div style="font-size:18px;font-weight:700;color:#1a5276;margin-bottom:6px;">' + (r.gpt ? r.gpt.pattern : "ERROR") + "</div><div>" + oc + '</div><div style="font-size:10px;color:#bbb;margin-top:4px;">' + (r.oE || 0) + "ms</div></td>";
  rows += '<td style="padding:12px;text-align:center;">' + (isMatch ? '<span style="background:#e8f5e9;color:#2d8a4e;font-weight:700;padding:4px 12px;border-radius:8px;font-size:12px;">&#10003; 일치</span>' : '<span style="background:#fce4ec;color:#c0392b;font-weight:700;padding:4px 12px;border-radius:8px;font-size:12px;">&#10007; 불일치</span>') + "</td>";
  rows += "</tr>\n";
}

const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>GPT-4o vs Gemini — ${results.length}장 비교</title>
<style>
@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap");
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Noto Sans KR",sans-serif;background:#faf9f7;color:#1c1a18;padding:40px}
h1{text-align:center;font-size:26px;margin-bottom:6px}
.sub{text-align:center;color:#888;font-size:14px;margin-bottom:24px}
.stats{display:flex;gap:16px;justify-content:center;margin-bottom:20px;flex-wrap:wrap}
.sc{background:white;border:1px solid #e8e3dc;border-radius:14px;padding:16px 28px;text-align:center;min-width:110px}
.sn{font-size:28px;font-weight:700}.sl{font-size:12px;color:#888;margin-top:4px}
.filters{display:flex;gap:10px;justify-content:center;margin-bottom:24px}
.fbtn{padding:10px 24px;border-radius:12px;border:2px solid #e8e3dc;background:white;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:inherit}
.fbtn:hover{border-color:#c8a96e}.fbtn.active{background:#1c1a18;color:white;border-color:#1c1a18}
table{width:100%;border-collapse:collapse;background:white;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06)}
th{background:#1c1a18;color:white;padding:14px;font-size:13px;font-weight:500;letter-spacing:1px;position:sticky;top:0;z-index:10}
tr.hide{display:none}
.overlay{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:999;align-items:center;justify-content:center;cursor:pointer}
.overlay.show{display:flex}
.overlay img{max-width:90vw;max-height:90vh;object-fit:contain;border-radius:12px}
.overlay .fname{position:absolute;bottom:30px;left:50%;transform:translateX(-50%);color:white;font-size:14px;font-weight:600;background:rgba(0,0,0,0.5);padding:6px 16px;border-radius:8px}
</style></head><body>
<h1>GPT-4o vs Gemini 2.5 Flash</h1>
<div class="sub">원단 분류 비교 — ${results.length}장 (${new Date().toLocaleDateString("ko-KR")})</div>
<div class="stats">
<div class="sc"><div class="sn">${results.length}</div><div class="sl">테스트 원단</div></div>
<div class="sc"><div class="sn" style="color:#2d8a4e;">${mc} (${matchRate}%)</div><div class="sl">패턴 일치</div></div>
<div class="sc"><div class="sn" style="color:#c0392b;">${mismatch}</div><div class="sl">불일치</div></div>
</div>
<div class="filters">
<button class="fbtn active" onclick="filterAll(this)">전체 (${results.length})</button>
<button class="fbtn" onclick="filterMatch(this)" style="color:#2d8a4e;">&#10003; 일치만 (${mc})</button>
<button class="fbtn" onclick="filterMismatch(this)" style="color:#c0392b;">&#10007; 불일치만 (${mismatch})</button>
</div>
<div id="imgOverlay" class="overlay"><img src=""><div class="fname"></div></div>
<table><thead><tr>
<th style="width:40px;">#</th><th style="width:170px;">원단 이미지</th><th>Gemini 2.5 Flash</th><th>GPT-4o</th><th style="width:100px;">비교</th>
</tr></thead><tbody>${rows}</tbody></table>
<script>
function setActive(btn){document.querySelectorAll(".fbtn").forEach(b=>b.classList.remove("active"));btn.classList.add("active")}
function filterAll(btn){setActive(btn);document.querySelectorAll(".row").forEach(r=>r.classList.remove("hide"))}
function filterMatch(btn){setActive(btn);document.querySelectorAll(".row").forEach(r=>{r.classList.toggle("hide",!r.classList.contains("match"))})}
function filterMismatch(btn){setActive(btn);document.querySelectorAll(".row").forEach(r=>{r.classList.toggle("hide",!r.classList.contains("mismatch"))})}
function openImg(src,name){var o=document.getElementById("imgOverlay");o.querySelector("img").src=src;o.querySelector(".fname").textContent=name;o.classList.add("show")}
document.getElementById("imgOverlay").onclick=function(){this.classList.remove("show")};
</script></body></html>`;

const outputPath = "D:/DIAN FABRIC/01_TEST/comparison-full.html";
fs.writeFileSync(outputPath, html, "utf-8");
console.log("HTML 저장: " + outputPath + " (" + results.length + "장)");
