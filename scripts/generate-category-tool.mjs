/**
 * 카테고리 라벨링 HTML 생성
 * 신규(MINGJI/EASTEN) 디자인별 대표 1장 + 현재 분류값을 임베드한 HTML 도구 생성.
 * 사용자가 fabric_type/pattern_detail 수정 → JSON 내보내기 → apply-category-json.mjs로 DB 반영.
 *
 * 결과: scripts/category-tool.html  (+ public/category-tool.html 복사)
 */
import fs from "fs";
const env = {};
fs.readFileSync(".env.local", "utf-8").split("\n").forEach((l) => { const [k, ...v] = l.split("="); if (k && v.length) env[k.trim()] = v.join("=").trim(); });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

const FABRIC_TYPES = ["패브릭", "벨벳", "스웨이드", "인조가죽", "린넨", "면", "울", "커튼", "시어", "아웃도어"];
const PATTERNS = ["무지", "부클", "하운드투스", "스트라이프", "체크", "헤링본", "추상", "기하학", "자연", "동물", "식물", "큰패턴", "다마스크", "자카드"];

async function main() {
  let rows = [], from = 0;
  while (true) {
    const { data } = await sb.from("fabrics").select("name, color_code, image_url, fabric_type, pattern_detail, supplier")
      .in("supplier", ["MINGJI", "EASTEN"]).not("image_url", "is", "null").range(from, from + 999);
    if (!data || !data.length) break; rows = rows.concat(data); if (data.length < 1000) break; from += 1000;
  }
  // 디자인(name)별 그룹 → 대표 1장(color_code 최소)
  const byCode = {};
  for (const r of rows) {
    if (!byCode[r.name]) byCode[r.name] = { code: r.name, supplier: r.supplier, image: r.image_url, cc: r.color_code, fabric_type: r.fabric_type, pattern_detail: r.pattern_detail, colors: 0 };
    byCode[r.name].colors++;
    if (String(r.color_code).localeCompare(String(byCode[r.name].cc), undefined, { numeric: true }) < 0) { byCode[r.name].image = r.image_url; byCode[r.name].cc = r.color_code; }
  }
  const designs = Object.values(byCode).sort((a, b) => a.code.localeCompare(b.code));
  console.log(`디자인 ${designs.length}개 (MINGJI/EASTEN)`);

  const data = designs.map((d) => ({
    code: d.code, supplier: d.supplier, image: d.image, colors: d.colors,
    // 현재 fabric_type 베이스(소재 토큰 제거) 선택용
    ft: (d.fabric_type || "").split(",").map((s) => s.trim()).find((t) => FABRIC_TYPES.includes(t)) || "패브릭",
    pd: (d.pattern_detail || "").split(",").map((s) => s.trim()).filter((p) => PATTERNS.includes(p)),
  }));

  const html = buildHtml(data);
  fs.writeFileSync("scripts/category-tool.html", html);
  try { fs.mkdirSync("public", { recursive: true }); fs.writeFileSync("public/category-tool.html", html); } catch {}
  console.log("생성: scripts/category-tool.html, public/category-tool.html");
}

function buildHtml(data) {
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DIAN 카테고리 라벨링</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Noto Sans KR',-apple-system,sans-serif;background:#f7f6f4;color:#222;padding:0 0 80px}
header{position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid #eee;padding:14px 20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
h1{font-size:18px;font-weight:800}
.stat{font-size:13px;color:#888}
.btn{padding:8px 14px;border-radius:10px;border:1px solid #ddd;background:#fff;font-size:13px;font-weight:700;cursor:pointer}
.btn.gold{background:linear-gradient(135deg,#8B6914,#C49A6C);color:#fff;border:none}
.btn:hover{background:#f3f3f3}.btn.gold:hover{opacity:.9}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px;padding:20px}
.card{background:#fff;border:1px solid #eee;border-radius:14px;overflow:hidden}
.card.done{outline:2px solid #C49A6C}
.imgwrap{position:relative;aspect-ratio:1;background:#f0f0f0}
.imgwrap img{width:100%;height:100%;object-fit:cover;cursor:zoom-in}
.lb{display:none;position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.9);align-items:center;justify-content:center;cursor:zoom-out}
.lb.open{display:flex}
.lb img{max-width:94vw;max-height:92vh;object-fit:contain;border-radius:8px}
.lb .cap{position:absolute;top:16px;left:0;right:0;text-align:center;color:#fff;font-size:15px;font-weight:700}
.lb .x{position:absolute;top:14px;right:20px;color:#fff;font-size:30px;cursor:pointer;line-height:1}
.tag{position:absolute;top:8px;left:8px;background:rgba(0,0,0,.65);color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:8px}
.tag.sup{right:8px;left:auto;background:rgba(139,105,20,.85)}
.body{padding:12px}
.code{font-weight:800;font-size:15px;margin-bottom:8px}
.lbl{font-size:11px;font-weight:700;color:#999;margin:8px 0 4px}
.chips{display:flex;flex-wrap:wrap;gap:5px}
.chip{padding:5px 9px;border-radius:8px;border:1px solid #e2e2e2;background:#fafafa;font-size:12px;font-weight:600;cursor:pointer;user-select:none}
.chip.on{background:#8B6914;color:#fff;border-color:#8B6914}
.chip.pat.on{background:#C49A6C;border-color:#C49A6C}
</style></head>
<body>
<header>
  <h1>DIAN 카테고리 라벨링</h1>
  <span class="stat" id="stat"></span>
  <span style="flex:1"></span>
  <button class="btn" onclick="save()">💾 중간저장</button>
  <button class="btn" onclick="load()">📂 불러오기</button>
  <button class="btn gold" onclick="exportJson()">📥 JSON 내보내기</button>
</header>
<div class="grid" id="grid"></div>
<div class="lb" id="lb" onclick="closeLb()"><span class="x">&times;</span><div class="cap" id="lbcap"></div><img id="lbimg"></div>
<script>
const FT=${JSON.stringify(FABRIC_TYPES)};
const PD=${JSON.stringify(PATTERNS)};
const DATA=${JSON.stringify(data)};
const KEY='dian-category-label-v1';
let state={}; // code -> {ft, pd:[], touched}
DATA.forEach(d=>{state[d.code]={ft:d.ft,pd:[...d.pd],touched:false}});
try{const s=JSON.parse(localStorage.getItem(KEY));if(s)Object.assign(state,s);}catch{}

function render(){
  const g=document.getElementById('grid');g.innerHTML='';
  DATA.forEach(d=>{
    const st=state[d.code];
    const card=document.createElement('div');card.className='card'+(st.touched?' done':'');
    card.innerHTML=
      '<div class="imgwrap"><img class="thumb" data-img="'+d.image+'" data-code="'+d.code+'" loading="lazy" src="'+d.image+'"><span class="tag">'+d.colors+'색</span><span class="tag sup">'+d.supplier+'</span></div>'+
      '<div class="body"><div class="code">'+d.code+'</div>'+
      '<div class="lbl">원단 종류 (1개)</div><div class="chips">'+
        FT.map(t=>'<span class="chip ft '+(st.ft===t?'on':'')+'" data-c="'+d.code+'" data-t="'+t+'">'+t+'</span>').join('')+'</div>'+
      '<div class="lbl">패턴 (복수, 없으면 무지)</div><div class="chips">'+
        PD.map(p=>'<span class="chip pat '+(st.pd.includes(p)?'on':'')+'" data-c="'+d.code+'" data-p="'+p+'">'+p+'</span>').join('')+'</div>'+
      '</div>';
    g.appendChild(card);
  });
  bind();updateStat();
}
function bind(){
  document.querySelectorAll('.chip.ft').forEach(el=>el.onclick=()=>{const c=el.dataset.c;state[c].ft=el.dataset.t;state[c].touched=true;render();});
  document.querySelectorAll('.chip.pat').forEach(el=>el.onclick=()=>{const c=el.dataset.c,p=el.dataset.p;const a=state[c].pd;const i=a.indexOf(p);if(i>=0)a.splice(i,1);else a.push(p);state[c].touched=true;render();});
  document.querySelectorAll('.thumb').forEach(el=>el.onclick=()=>openLb(el.dataset.img,el.dataset.code));
}
function openLb(src,code){document.getElementById('lbimg').src=src;document.getElementById('lbcap').textContent=code||'';document.getElementById('lb').classList.add('open');}
function closeLb(){document.getElementById('lb').classList.remove('open');}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeLb();});
function updateStat(){const done=Object.values(state).filter(s=>s.touched).length;document.getElementById('stat').textContent=done+' / '+DATA.length+' 검수함';}
function save(){localStorage.setItem(KEY,JSON.stringify(state));alert('저장됨');}
function load(){try{const s=JSON.parse(localStorage.getItem(KEY));if(s){Object.assign(state,s);render();alert('불러옴');}}catch{alert('저장된 거 없음')}}
function exportJson(){
  const out={};
  DATA.forEach(d=>{const s=state[d.code];out[d.code]={fabric_type:s.ft,pattern_detail:s.pd.length?s.pd.join(','):null};});
  const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='category-labels.json';a.click();
}
render();
</script></body></html>`;
}
main().catch((e) => { console.error(e); process.exit(1); });
