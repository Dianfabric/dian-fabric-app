/**
 * gemini-sample-1000.json → 드롭다운 편집 가능 HTML 생성
 */
import fs from "fs";

const results = JSON.parse(fs.readFileSync("D:/DIAN FABRIC/01_TEST/gemini-sample-1000.json", "utf-8"));
console.log("로드: " + results.length + "개");

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

const typeStats = {};
const patternStats = {};
for (const r of results) {
  if (!r.result) continue;
  const t = r.result.type || "?";
  typeStats[t] = (typeStats[t] || 0) + 1;
  const patterns = Array.isArray(r.result.pattern) ? r.result.pattern : [r.result.pattern || "?"];
  for (const p of patterns) patternStats[p] = (patternStats[p] || 0) + 1;
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

const typeOptions = ["패브릭","벨벳","인조가죽","시어","린넨","면","울","커튼"];
const patternOptions = ["무지","부클","하운드투스","스트라이프","체크","헤링본","추상","기하학","자연","동물","식물","큰패턴","다마스크"];
const usageDefault = ["소파","쿠션","침대헤드","스툴","벽패널"]; // 기본 체크됨 (해제 가능)
const usageAll = ["소파","쿠션","커튼","침대헤드","스툴","벽패널","아웃도어","친환경"];
const usageOptions = usageAll;

function makeSelect(name, options, selected, idx) {
  let h = `<select data-idx="${idx}" data-field="${name}" onchange="markEdited(this)" style="font-size:12px;padding:4px 8px;border-radius:8px;border:1px solid #ddd;font-family:inherit;cursor:pointer;">`;
  for (const o of options) h += `<option value="${o}"${o === selected ? " selected" : ""}>${o}</option>`;
  return h + "</select>";
}

function makeCheckboxes(name, options, selected, idx) {
  const selSet = new Set(Array.isArray(selected) ? selected : [selected]);
  let h = `<div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;" data-idx="${idx}" data-field="${name}">`;
  for (const o of options) {
    const ck = selSet.has(o);
    h += `<label style="font-size:11px;padding:3px 8px;border-radius:8px;cursor:pointer;border:1.5px solid ${ck?"#8B6914":"#e0e0e0"};background:${ck?"rgba(139,105,20,0.08)":"#fafafa"};color:${ck?"#8B6914":"#999"};font-weight:${ck?"600":"400"};transition:all 0.15s;" onmousedown="toggleCb(this)"><input type="checkbox" value="${o}" ${ck?"checked":""} style="display:none;" onchange="markEdited(this)">${o}</label>`;
  }
  return h + "</div>";
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
  rows += `<td style="padding:10px;text-align:center;vertical-align:middle;">`;
  rows += `<div style="margin-bottom:8px;"><span style="font-size:10px;color:#aaa;">원단종류</span><br>${makeSelect("type", typeOptions, type, i)}</div>`;
  rows += `<div style="margin-bottom:8px;"><span style="font-size:10px;color:#aaa;">패턴상세</span><br>${makeCheckboxes("pattern", patternOptions, patterns, i)}</div>`;
  rows += `<div style="margin-bottom:8px;"><span style="font-size:10px;color:#aaa;">사용처</span><br>${makeCheckboxes("usage", usageOptions, usageDefault, i)}</div>`;
  rows += `<div>${colors}</div></td>`;
  rows += `<td style="padding:10px;text-align:center;vertical-align:middle;">`;
  rows += `<span class="status-badge" data-idx="${i}" style="background:#e8f5e9;color:#2d8a4e;font-weight:600;padding:4px 12px;border-radius:8px;font-size:11px;display:block;margin-bottom:8px;">AI</span>`;
  rows += `<button class="confirm-btn" data-idx="${i}" onclick="confirmRow(this)" style="padding:6px 16px;border-radius:10px;border:2px solid #2d8a4e;background:white;color:#2d8a4e;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.2s;">컨펌</button>`;
  rows += `</td>`;
  rows += `</tr>\n`;
}

const DATA_JSON = JSON.stringify(results.map(r => ({
  id: r.id, name: r.name, color_code: r.color_code, image_url: r.image_url,
  type: r.result?.type || "패브릭",
  pattern: Array.isArray(r.result?.pattern) ? r.result.pattern : [r.result?.pattern || "무지"],
  colors: r.result?.colors || [],
  oldType: r.oldType, oldPattern: r.oldPattern,
})));

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
tr.confirmed{background:#f0faf0 !important}
tr.confirmed.edited{background:#e8f5e9 !important}
.confirm-btn:hover{background:#2d8a4e !important;color:white !important}
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
<div class="sc"><div class="sn" id="confirmCount" style="color:#2d8a4e;">0</div><div class="sl">컨펌됨</div></div>
<div class="sc"><div class="sn" id="pendingCount" style="color:#888;">${successCount}</div><div class="sl">분류중</div></div>
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
<button class="fbtn" onclick="filterConfirmed(this)" style="color:#2d8a4e;">컨펌됨</button>
<button class="fbtn" onclick="filterPending(this)" style="color:#888;">분류중</button>
</div>
<div class="toolbar">
<button onclick="confirmAllVisible()" style="background:#2d8a4e;color:white;">보이는 원단 전체 컨펌</button>
<button onclick="exportJSON()" style="background:linear-gradient(135deg,#8B6914,#C49A6C);color:white;">수정된 JSON 내보내기</button>
<button onclick="exportAllJSON()" style="background:#1c1a18;color:white;">전체 JSON 내보내기</button>
<button onclick="exportConfirmedJSON()" style="background:#2d8a4e;color:white;">컨펌된 JSON 내보내기</button>
</div>
<div id="imgOverlay" class="overlay"><img src=""><div class="fname"></div></div>
<div id="toast" class="toast"></div>
<table><thead><tr>
<th style="width:36px;">#</th><th style="width:160px;">원단 이미지</th><th style="width:90px;">기존</th><th>Gemini 분류 (수정 가능)</th><th style="width:60px;">상태</th>
</tr></thead><tbody>${rows}</tbody></table>
<script>
var DATA=${DATA_JSON};
var SAVE_KEY="dian-fabric-confirm-state";
function saveState(){var state={};document.querySelectorAll("tr.row").forEach(function(row){var idx=row.dataset.idx;var d={};if(row.classList.contains("confirmed"))d.confirmed=true;if(row.classList.contains("edited"))d.edited=true;var sel=row.querySelector("select[data-field=type]");if(sel)d.type=sel.value;var patBox=row.querySelector("[data-field=pattern]");if(patBox){d.pattern=[];patBox.querySelectorAll("input:checked").forEach(function(cb){d.pattern.push(cb.value)})}var usageBox=row.querySelector("[data-field=usage]");if(usageBox){d.usage=[];usageBox.querySelectorAll("input:checked").forEach(function(cb){d.usage.push(cb.value)})}if(d.confirmed||d.edited)state[idx]=d});try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));console.log("저장됨: "+Object.keys(state).length+"개")}catch(e){}}
function loadState(){try{var raw=localStorage.getItem(SAVE_KEY);if(!raw)return;var state=JSON.parse(raw);var loaded=0;for(var idx in state){var d=state[idx];var row=document.querySelector('tr[data-idx="'+idx+'"]');if(!row)continue;if(d.type){var sel=row.querySelector("select[data-field=type]");if(sel)sel.value=d.type}if(d.pattern){var patBox=row.querySelector("[data-field=pattern]");if(patBox){patBox.querySelectorAll("input").forEach(function(cb){var ck=d.pattern.includes(cb.value);cb.checked=ck;var label=cb.closest("label");label.style.border="1.5px solid "+(ck?"#8B6914":"#e0e0e0");label.style.background=ck?"rgba(139,105,20,0.08)":"#fafafa";label.style.color=ck?"#8B6914":"#999";label.style.fontWeight=ck?"600":"400"})}}if(d.usage){var usageBox=row.querySelector("[data-field=usage]");if(usageBox){usageBox.querySelectorAll("input").forEach(function(cb){var ck=d.usage.includes(cb.value);cb.checked=ck;var label=cb.closest("label");label.style.border="1.5px solid "+(ck?"#8B6914":"#e0e0e0");label.style.background=ck?"rgba(139,105,20,0.08)":"#fafafa";label.style.color=ck?"#8B6914":"#999";label.style.fontWeight=ck?"600":"400"})}}if(d.edited){row.classList.add("edited");var badge=row.querySelector(".status-badge");badge.textContent="수정됨";badge.style.background="#fff3e0";badge.style.color="#e65100"}if(d.confirmed){var btn=row.querySelector(".confirm-btn");if(btn)confirmRow(btn)}loaded++}updateCounts();document.getElementById("editCount").textContent=document.querySelectorAll("tr.edited").length;console.log("복원됨: "+loaded+"개")}catch(e){console.error(e)}}
window.addEventListener("load",function(){loadState()});
function toggleCb(label){var cb=label.querySelector("input");cb.checked=!cb.checked;label.style.border="1.5px solid "+(cb.checked?"#8B6914":"#e0e0e0");label.style.background=cb.checked?"rgba(139,105,20,0.08)":"#fafafa";label.style.color=cb.checked?"#8B6914":"#999";label.style.fontWeight=cb.checked?"600":"400";markEdited(cb);event.preventDefault()}
function confirmRow(btn){var row=btn.closest("tr");row.classList.add("confirmed");row.style.background="#f0faf0";var badge=row.querySelector(".status-badge");badge.textContent="컨펌됨";badge.style.background="#2d8a4e";badge.style.color="white";btn.textContent="취소";btn.style.background="#2d8a4e";btn.style.color="white";btn.onclick=function(){unconfirmRow(this)};updateCounts();saveState()}
function unconfirmRow(btn){var row=btn.closest("tr");row.classList.remove("confirmed");row.style.background="";var badge=row.querySelector(".status-badge");var isEdited=row.classList.contains("edited");badge.textContent=isEdited?"수정됨":"AI";badge.style.background=isEdited?"#fff3e0":"#e8f5e9";badge.style.color=isEdited?"#e65100":"#2d8a4e";btn.textContent="컨펌";btn.style.background="white";btn.style.color="#2d8a4e";btn.onclick=function(){confirmRow(this)};updateCounts();saveState()}
function confirmAllVisible(){document.querySelectorAll("tr.row:not(.hide):not(.confirmed)").forEach(function(row){var btn=row.querySelector(".confirm-btn");if(btn)confirmRow(btn)});showToast("보이는 원단 전체 컨펌 완료")}
function updateCounts(){var confirmed=document.querySelectorAll("tr.confirmed").length;var total=${successCount};document.getElementById("confirmCount").textContent=confirmed;document.getElementById("pendingCount").textContent=total-confirmed}
function filterConfirmed(btn){setActive(btn);document.querySelectorAll(".row").forEach(function(r){r.classList.toggle("hide",!r.classList.contains("confirmed"))})}
function filterPending(btn){setActive(btn);document.querySelectorAll(".row").forEach(function(r){r.classList.toggle("hide",r.classList.contains("confirmed"))})}
function exportConfirmedJSON(){var confirmed=[];document.querySelectorAll("tr.confirmed").forEach(function(row){confirmed.push(getRowData(row))});if(confirmed.length===0){showToast("컨펌된 항목이 없습니다");return}download("confirmed-"+confirmed.length+".json",JSON.stringify(confirmed,null,2));showToast(confirmed.length+"개 컨펌 항목 JSON 내보내기 완료")}
function markEdited(el){var row=el.closest("tr");row.classList.add("edited");var badge=row.querySelector(".status-badge");if(!row.classList.contains("confirmed")){badge.textContent="수정됨";badge.style.background="#fff3e0";badge.style.color="#e65100"}document.getElementById("editCount").textContent=document.querySelectorAll("tr.edited").length;saveState()}
function getRowData(row){var idx=parseInt(row.dataset.idx);var d=Object.assign({},DATA[idx]);var sel=row.querySelector("select[data-field=type]");if(sel)d.type=sel.value;var patBox=row.querySelector("[data-field=pattern]");if(patBox){d.pattern=[];patBox.querySelectorAll("input:checked").forEach(function(cb){d.pattern.push(cb.value)});if(d.pattern.length===0)d.pattern=["무지"]}var usageBox=row.querySelector("[data-field=usage]");if(usageBox){d.usage=[];usageBox.querySelectorAll("input:checked").forEach(function(cb){d.usage.push(cb.value)})}return d}
function exportJSON(){var edited=[];document.querySelectorAll("tr.edited").forEach(function(row){edited.push(getRowData(row))});if(edited.length===0){showToast("수정된 항목이 없습니다");return}download("edited-"+edited.length+".json",JSON.stringify(edited,null,2));showToast(edited.length+"개 수정 항목 JSON 내보내기 완료")}
function exportAllJSON(){var all=[];document.querySelectorAll("tr.row").forEach(function(row){all.push(getRowData(row))});download("gemini-classified-all-"+all.length+".json",JSON.stringify(all,null,2));showToast(all.length+"개 전체 JSON 내보내기 완료")}
function download(name,content){var a=document.createElement("a");a.href="data:application/json;charset=utf-8,"+encodeURIComponent(content);a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a)}
function showToast(msg){var t=document.getElementById("toast");t.textContent=msg;t.style.display="block";setTimeout(function(){t.style.display="none"},3000)}
function setActive(btn){document.querySelectorAll(".fbtn").forEach(function(b){b.classList.remove("active")});btn.classList.add("active")}
function filterAll(btn){setActive(btn);document.querySelectorAll(".row").forEach(function(r){r.classList.remove("hide")})}
function filterType(btn,t){setActive(btn);document.querySelectorAll(".row").forEach(function(r){r.classList.toggle("hide",r.dataset.type!==t)})}
function filterPattern(btn,p){setActive(btn);document.querySelectorAll(".row").forEach(function(r){r.classList.toggle("hide",!r.dataset.pattern.includes(p))})}
function filterEdited(btn){setActive(btn);document.querySelectorAll(".row").forEach(function(r){r.classList.toggle("hide",!r.classList.contains("edited"))})}
function openImg(src,name){var o=document.getElementById("imgOverlay");o.querySelector("img").src=src;o.querySelector(".fname").textContent=name;o.classList.add("show")}
document.getElementById("imgOverlay").onclick=function(){this.classList.remove("show")};
</script></body></html>`;

const outputPath = "D:/DIAN FABRIC/01_TEST/gemini-sample-1000.html";
fs.writeFileSync(outputPath, html, "utf-8");
console.log("HTML 저장: " + outputPath);
