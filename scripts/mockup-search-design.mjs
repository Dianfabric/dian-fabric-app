/**
 * 새 검색 결과 페이지 디자인 mockup 생성
 * 실제 DINOv2 검색 결과로 시각화
 */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
fs.readFileSync(".env.local", "utf-8").split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) env[k.trim()] = v.join("=").trim();
});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function main() {
  // 1. "업로드된" 원단 가정 (무지 + 아이보리 — 사용자 스크린샷 시나리오)
  const { data: queryData } = await sb.from("fabrics")
    .select("id, name, color_code, image_url, fabric_type, pattern_detail, notes, embedding_dino, usage_types, price_per_yard")
    .ilike("pattern_detail", "%무지%")
    .ilike("notes", "%아이보리%")
    .not("embedding_dino", "is", null)
    .limit(20);

  if (!queryData || queryData.length === 0) {
    console.log("쿼리 원단 없음"); return;
  }
  const query = queryData[Math.floor(Math.random() * queryData.length)];
  console.log(`업로드 시뮬레이션: ${query.name}-${query.color_code}`);

  // 2. DINOv2로 유사 원단 검색
  const vec = typeof query.embedding_dino === "string"
    ? query.embedding_dino : `[${query.embedding_dino.join(",")}]`;
  const { data: results } = await sb.rpc("search_fabrics_dino", {
    query_embedding: vec, match_threshold: 0.1, match_count: 16,
  });
  const matches = (results || []).filter(f => f.id !== query.id).slice(0, 15);
  console.log(`매칭: ${matches.length}개`);

  // Gemini 시뮬레이션 — query의 분류 정보 사용
  const fakeGemini = {
    location: "기타",
    pattern_detail: query.pattern_detail || "무지",
    color: "아이보리",
    confidence: 95,
  };

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>새 검색 결과 디자인 mockup</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, "Segoe UI", sans-serif; background: #f5f5f7; color: #1a1a1a; }

/* 헤더 */
.topnav {
  background: white; padding: 14px 24px; display: flex; align-items: center;
  gap: 16px; border-bottom: 1px solid #eee; position: sticky; top: 0; z-index: 10;
}
.topnav .logo { font-weight: 800; font-size: 18px; }
.topnav .label {
  margin-left: auto; font-size: 13px; color: #666;
  background: #f0e9d6; padding: 5px 12px; border-radius: 6px;
}
.topnav .label strong { color: #8B6914; }

/* 메인 비교 영역 — 3열 */
.compare-wrap { max-width: 1700px; margin: 0 auto; padding: 24px; }
.compare-grid { display: grid; grid-template-columns: 1.2fr 1.2fr 1fr; gap: 18px; }

.panel { background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.panel-header {
  padding: 12px 18px; border-bottom: 1px solid #f0f0f0;
  display: flex; align-items: center; justify-content: space-between;
}
.panel-header .title { font-size: 13px; font-weight: 700; color: #666; }
.panel-header.left .title { color: #4A90E2; }
.panel-header.right .title { color: #8B6914; }
.panel-header .badge {
  font-size: 11px; padding: 3px 10px; border-radius: 4px; font-weight: 700;
}
.panel-header.right .badge { background: #8B6914; color: white; }

/* 메인 이미지 — 사이즈 축소 */
.hero { height: 380px; background: #fafafa; cursor: zoom-in; position: relative; }
.hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
.hero .sim-badge {
  position: absolute; top: 14px; right: 14px;
  background: linear-gradient(135deg, #8B6914, #C49A6C); color: white;
  padding: 8px 16px; border-radius: 8px; font-weight: 700; font-size: 15px;
  box-shadow: 0 2px 8px rgba(139,105,20,0.3);
}
.hero .dismiss-btn {
  position: absolute; top: 14px; left: 14px;
  width: 38px; height: 38px;
  background: rgba(0,0,0,0.55); color: white;
  border-radius: 50%; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
  backdrop-filter: blur(4px);
}
.hero .dismiss-btn:hover { background: #d32f2f; transform: scale(1.1); }
.hero .dismiss-btn svg { width: 18px; height: 18px; stroke-width: 3; }

/* 빈 상태 */
.empty-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px 20px; color: #999; text-align: center;
}
.empty-state .ico { font-size: 48px; margin-bottom: 16px; }
.empty-state .msg { font-size: 16px; font-weight: 600; }

/* 정보 영역 — 글자 크기 키움 */
.info { padding: 24px 28px; }
.info .name { font-size: 26px; font-weight: 800; margin-bottom: 6px; line-height: 1.2; }
.info .color { font-size: 16px; color: #777; margin-bottom: 18px; }
.info .meta-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
.info .tag {
  font-size: 14px; padding: 6px 14px; border-radius: 6px; font-weight: 600;
  background: #f0e9d6; color: #8B6914;
}
.info .tag.pattern { background: #8B6914; color: white; }
.info .price { font-size: 22px; font-weight: 800; color: #8B6914; margin-top: 10px; }
.info .row { display: flex; justify-content: space-between; padding: 10px 0; font-size: 16px; border-bottom: 1px solid #f0f0f0; }
.info .row:last-child { border-bottom: none; }
.info .row .k { color: #888; }
.info .row .v { font-weight: 700; }

/* Gemini 분석 박스 (왼쪽 전용) */
.gemini-box {
  background: linear-gradient(135deg, rgba(74,144,226,0.06), rgba(74,144,226,0.02));
  border-radius: 12px; padding: 18px 20px; margin-top: 18px;
}
.gemini-box .ghead { font-size: 13px; color: #4A90E2; font-weight: 700; margin-bottom: 12px; letter-spacing: 0.5px; }
.gemini-box .gitem { display: flex; justify-content: space-between; font-size: 16px; padding: 6px 0; }
.gemini-box .gitem .key { color: #555; }
.gemini-box .gitem .val { font-weight: 700; }
.confidence-bar { height: 6px; background: #e0e7f0; border-radius: 3px; margin-top: 14px; overflow: hidden; }
.confidence-bar .fill { height: 100%; background: #4A90E2; border-radius: 3px; }

/* 대기열 카드 리스트 (3번째 열) */
.waitlist-panel {
  background: white; border-radius: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  display: flex; flex-direction: column; max-height: calc(100vh - 100px);
}
.waitlist-header {
  padding: 14px 18px; border-bottom: 1px solid #f0f0f0;
  display: flex; align-items: center; justify-content: space-between;
}
.waitlist-header .title { font-size: 13px; font-weight: 700; color: #666; }
.waitlist-header .count {
  font-size: 11px; padding: 3px 10px; border-radius: 4px;
  background: #f0f0f0; color: #555; font-weight: 700;
}
.waitlist-hint { font-size: 12px; color: #999; padding: 8px 18px 0; }
.waitlist {
  flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px;
}
.waitlist::-webkit-scrollbar { width: 6px; }
.waitlist::-webkit-scrollbar-thumb { background: #ddd; border-radius: 3px; }
.wcard {
  display: flex; gap: 12px; padding: 10px; background: #fafafa;
  border-radius: 10px; cursor: pointer; border: 2px solid transparent;
  transition: all 0.15s;
}
.wcard:hover { background: #f5f0e0; }
.wcard.active { border-color: #8B6914; background: #faf6eb; }
.wcard .wimg {
  flex-shrink: 0; width: 110px; height: 110px; border-radius: 8px;
  overflow: hidden; position: relative; background: #eee;
}
.wcard .wimg img { width: 100%; height: 100%; object-fit: cover; }
.wcard .wimg .wrank {
  position: absolute; top: 4px; left: 4px;
  background: rgba(0,0,0,0.75); color: white;
  font-size: 11px; padding: 2px 7px; border-radius: 4px; font-weight: 700;
}
.wcard .wimg .wsim {
  position: absolute; bottom: 4px; right: 4px;
  background: linear-gradient(135deg, #8B6914, #C49A6C); color: white;
  font-size: 11px; padding: 2px 7px; border-radius: 4px; font-weight: 700;
}
.wcard .winfo { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 4px; }
.wcard .winfo .wname { font-size: 16px; font-weight: 700; line-height: 1.2; }
.wcard .winfo .wcolor { font-size: 13px; color: #888; }
.wcard .winfo .wtags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.wcard .winfo .wtag {
  font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600;
  background: #f0e9d6; color: #8B6914;
}
.wcard .winfo .wtag.pattern { background: #8B6914; color: white; }
.wcard .winfo .wprice { font-size: 13px; color: #8B6914; font-weight: 800; margin-top: 2px; }

/* 빠른 비교 강조 */
.compare-hint {
  text-align: center; font-size: 12px; color: #888; margin: 14px 0;
  padding: 8px; background: white; border-radius: 8px;
}

/* 반응형 */
@media (max-width: 1200px) {
  .compare-grid { grid-template-columns: 1fr 1fr; }
  .waitlist-panel { grid-column: 1 / -1; max-height: 600px; }
  .waitlist { flex-direction: row; flex-wrap: wrap; }
  .wcard { flex: 1 1 calc(50% - 5px); min-width: 280px; }
}
@media (max-width: 700px) {
  .compare-grid { grid-template-columns: 1fr; }
  .wcard { flex: 1 1 100%; }
}
</style>
</head>
<body>

<div class="topnav">
  <span class="logo">DIAN <span style="color: #8B6914;">fabric</span></span>
  <span class="label">검색 결과 — <strong>${fakeGemini.location} · ${fakeGemini.pattern_detail} · ${fakeGemini.color} (${fakeGemini.confidence}%)</strong></span>
</div>

<div class="compare-wrap">
  <div class="compare-grid">

    <!-- 좌: 업로드 원단 -->
    <div class="panel">
      <div class="panel-header left">
        <span class="title">📤 내가 업로드한 원단</span>
      </div>
      <div class="hero">
        <img src="${query.image_url}" alt="업로드">
      </div>
      <div class="info">
        <div class="name">업로드 이미지</div>
        <div class="color">2026-04-29 검색</div>

        <div class="gemini-box">
          <div class="ghead">🤖 AI 분석 (Gemini 3 Flash)</div>
          <div class="gitem"><span class="key">위치</span><span class="val">${fakeGemini.location}</span></div>
          <div class="gitem"><span class="key">패턴</span><span class="val">${fakeGemini.pattern_detail}</span></div>
          <div class="gitem"><span class="key">주요 색상</span><span class="val">${fakeGemini.color}</span></div>
          <div class="gitem"><span class="key">신뢰도</span><span class="val">${fakeGemini.confidence}%</span></div>
          <div class="confidence-bar"><div class="fill" style="width: ${fakeGemini.confidence}%"></div></div>
        </div>
      </div>
    </div>

    <!-- 중간: 선택된 매칭 원단 (큰 사진 + 정보) -->
    <div class="panel">
      <div class="panel-header right">
        <span class="title">✨ 비슷한 원단</span>
        <span class="badge" id="rankBadge">#1 / ${matches.length}</span>
      </div>
      <div class="hero" id="heroBox">
        <img id="mainImg" src="${matches[0].image_url}" alt="">
        <button class="dismiss-btn" id="dismissBtn" title="이 원단 제외 → 다음 원단 표시">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <div class="sim-badge" id="simBadge">${(matches[0].similarity * 100).toFixed(0)}% 매칭</div>
      </div>
      <div class="info">
        <div class="name" id="mName">${matches[0].name}</div>
        <div class="color" id="mColor">Color: ${matches[0].color_code}</div>

        <div class="meta-row" id="mTags">
          ${matches[0].fabric_type ? `<span class="tag">${matches[0].fabric_type}</span>` : ""}
          ${matches[0].pattern_detail ? `<span class="tag pattern">${matches[0].pattern_detail}</span>` : ""}
        </div>

        <div class="row"><span class="k">사용처</span><span class="v" id="mUsage">${(matches[0].usage_types || []).join(", ") || "-"}</span></div>
        <div class="row"><span class="k">가격</span><span class="v" id="mPrice">${matches[0].price_per_yard ? "₩" + matches[0].price_per_yard.toLocaleString() + "/Y" : "-"}</span></div>
      </div>
    </div>

    <!-- 우: 대기열 — 카드 리스트 (큰 썸네일 + 정보) -->
    <div class="waitlist-panel">
      <div class="waitlist-header">
        <span class="title">📋 대기열</span>
        <span class="count">${matches.length}개</span>
      </div>
      <div class="waitlist-hint">클릭하면 가운데로 이동</div>
      <div class="waitlist" id="waitlist">
        ${matches.map((f, i) => `
          <div class="wcard${i === 0 ? " active" : ""}" data-idx="${i}">
            <div class="wimg">
              <img src="${f.image_url}" alt="${f.name}" loading="lazy">
              <span class="wrank">#${i + 1}</span>
              <span class="wsim">${(f.similarity * 100).toFixed(0)}%</span>
            </div>
            <div class="winfo">
              <div class="wname">${f.name}</div>
              <div class="wcolor">Color: ${f.color_code}</div>
              <div class="wtags">
                ${f.fabric_type ? `<span class="wtag">${f.fabric_type}</span>` : ""}
                ${f.pattern_detail ? `<span class="wtag pattern">${f.pattern_detail}</span>` : ""}
              </div>
              ${f.price_per_yard ? `<div class="wprice">₩${f.price_per_yard.toLocaleString()}/Y</div>` : ""}
            </div>
          </div>
        `).join("")}
      </div>
    </div>

  </div>
</div>

<script>
let matches = ${JSON.stringify(matches)};
const totalInitial = matches.length;

const heroBox = document.getElementById("heroBox");
const mainImg = document.getElementById("mainImg");
const simBadge = document.getElementById("simBadge");
const rankBadge = document.getElementById("rankBadge");
const dismissBtn = document.getElementById("dismissBtn");
const mName = document.getElementById("mName");
const mColor = document.getElementById("mColor");
const mTags = document.getElementById("mTags");
const mUsage = document.getElementById("mUsage");
const mPrice = document.getElementById("mPrice");
const waitlistEl = document.getElementById("waitlist");
const countEl = document.querySelector(".waitlist-header .count");
const infoBox = document.querySelector(".panel:nth-child(2) .info");

function selectCard(idx) {
  const f = matches[idx];
  if (!f) return;

  document.querySelectorAll(".wcard").forEach(x => x.classList.remove("active"));
  const card = document.querySelector(\`.wcard[data-idx="\${idx}"]\`);
  if (card) {
    card.classList.add("active");
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  mainImg.src = f.image_url;
  simBadge.textContent = (f.similarity * 100).toFixed(0) + "% 매칭";
  rankBadge.textContent = "#" + (idx + 1) + " / " + matches.length;
  mName.textContent = f.name;
  mColor.textContent = "Color: " + f.color_code;
  mTags.innerHTML = (f.fabric_type ? '<span class="tag">' + f.fabric_type + '</span>' : '') +
                   (f.pattern_detail ? '<span class="tag pattern">' + f.pattern_detail + '</span>' : '');
  mUsage.textContent = (f.usage_types || []).join(", ") || "-";
  mPrice.textContent = f.price_per_yard ? "₩" + f.price_per_yard.toLocaleString() + "/Y" : "-";
}

function bindCard(card) {
  card.addEventListener("click", () => selectCard(parseInt(card.dataset.idx)));
}
document.querySelectorAll(".wcard").forEach(bindCard);

function renumberCards() {
  document.querySelectorAll(".wcard").forEach((c, i) => {
    c.dataset.idx = i;
    c.querySelector(".wrank").textContent = "#" + (i + 1);
  });
}

function showEmptyState() {
  heroBox.innerHTML = '<div class="empty-state"><div class="ico">✓</div><div class="msg">모든 원단을 확인했습니다</div></div>';
  rankBadge.textContent = "0 / " + totalInitial;
  mName.textContent = "—";
  mColor.textContent = "";
  mTags.innerHTML = "";
  mUsage.textContent = "-";
  mPrice.textContent = "-";
}

function dismissCurrent() {
  const active = document.querySelector(".wcard.active");
  if (!active) return;
  const idx = parseInt(active.dataset.idx);

  // matches 배열에서 제거
  matches.splice(idx, 1);

  // DOM에서 카드 제거
  active.remove();

  // 카운트 업데이트
  countEl.textContent = matches.length + "개";

  // 남은 카드 번호 다시 매김
  renumberCards();

  if (matches.length === 0) {
    showEmptyState();
    return;
  }

  // 다음 카드 자동 활성화 (현재 idx, 또는 마지막이면 한 칸 앞)
  const newIdx = Math.min(idx, matches.length - 1);
  selectCard(newIdx);
}

dismissBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  dismissCurrent();
});

// 키보드 단축키
document.addEventListener("keydown", (e) => {
  // X / Delete / Backspace → 현재 원단 제외
  if (e.key === "Delete" || e.key === "Backspace" || e.key === "x" || e.key === "X") {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    e.preventDefault();
    dismissCurrent();
    return;
  }

  // 화살표 → 다음/이전
  const active = document.querySelector(".wcard.active");
  if (!active) return;
  let idx = parseInt(active.dataset.idx);
  if ((e.key === "ArrowDown" || e.key === "ArrowRight") && idx < matches.length - 1) idx++;
  else if ((e.key === "ArrowUp" || e.key === "ArrowLeft") && idx > 0) idx--;
  else return;
  e.preventDefault();
  selectCard(idx);
});
</script>

</body>
</html>`;

  fs.writeFileSync("scripts/mockup-search.html", html);
  console.log("\n✅ scripts/mockup-search.html 생성");
  console.log("브라우저로 열기: file:///D:/DIAN FABRIC/dian-fabric-app/scripts/mockup-search.html");
}

main().catch(e => { console.error(e); process.exit(1); });
