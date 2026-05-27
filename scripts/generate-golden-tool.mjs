/**
 * 골든셋 라벨링 HTML 도구 생성
 *
 * 50개 쿼리 원단 × 각 50개 후보 → 사용자가 "비슷함" 클릭으로 선택
 * 결과는 JSON으로 다운로드 → 정량 평가에 사용
 *
 * 후보는 현재 DINOv2 검색 결과 상위 50개 (현재 시스템의 "최선의 추측"을 평가)
 */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
fs.readFileSync(".env.local", "utf-8").split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) env[k.trim()] = v.join("=").trim();
});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// 패턴별로 골고루 샘플링 (다양성 확보)
const PATTERNS = [
  "무지", "부클", "하운드투스", "스트라이프", "체크",
  "헤링본", "추상", "기하학", "자연", "동물", "식물", "다마스크",
];
const TARGET_TOTAL = 100;
const PER_PATTERN = 10; // 12 × 10 = 120, 100으로 트림

async function pickQueries() {
  const queries = [];
  for (const p of PATTERNS) {
    const { data } = await sb
      .from("fabrics")
      .select("id, name, color_code, image_url, fabric_type, pattern_detail, notes, embedding_dino, usage_types, price_per_yard")
      .eq("pattern_detail", p)
      .not("image_url", "is", null)
      .not("embedding_dino", "is", null)
      .limit(100);
    if (!data || data.length === 0) continue;
    const shuffled = data.sort(() => Math.random() - 0.5);
    queries.push(...shuffled.slice(0, PER_PATTERN));
  }
  // 100개 미만이면 무지/패턴 위주로 보충
  if (queries.length < TARGET_TOTAL) {
    const need = TARGET_TOTAL - queries.length;
    const existingIds = new Set(queries.map((q) => q.id));
    const { data: extra } = await sb
      .from("fabrics")
      .select("id, name, color_code, image_url, fabric_type, pattern_detail, notes, embedding_dino, usage_types, price_per_yard")
      .not("image_url", "is", null)
      .not("embedding_dino", "is", null)
      .limit(need * 3);
    const filtered = (extra || []).filter((f) => !existingIds.has(f.id))
      .sort(() => Math.random() - 0.5)
      .slice(0, need);
    queries.push(...filtered);
  }
  return queries.slice(0, TARGET_TOTAL);
}

// 쿼리 원단의 주요 색상 추출 (notes 첫 번째 항목)
function getPrimaryColor(notes) {
  if (!notes) return null;
  const colorPart = notes.split("|")[0];
  const first = colorPart.split(",")[0];
  const name = first.split(":")[0]?.trim();
  return name || null;
}

// 두 벡터의 코사인 유사도 (768d)
function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function toVec(emb) {
  return typeof emb === "string" ? JSON.parse(emb) : emb;
}

/**
 * 후보 50개 = 텍스쳐 유사 30개 + 같은 주요 색상 + 텍스쳐 유사 20개
 * → 색깔 비슷한 거 + 짜임 비슷한 거 둘 다 풍부하게 보여줌
 */
async function searchSimilar(queryFabric, topN = 50) {
  const queryVec = toVec(queryFabric.embedding_dino);
  const vecStr = `[${queryVec.join(",")}]`;

  // ─── A. 텍스쳐 유사도만 (다양한 색) — Top 30 ───
  const { data: textureMatches } = await sb.rpc("search_fabrics_dino", {
    query_embedding: vecStr,
    match_threshold: 0.1,
    match_count: 60,
  });
  const textureTop = (textureMatches || [])
    .filter((f) => f.id !== queryFabric.id)
    .slice(0, 30);

  // ─── B. 같은 주요 색상 + 텍스쳐 유사도 — Top 20 ───
  let colorTop = [];
  const primaryColor = getPrimaryColor(queryFabric.notes);
  if (primaryColor) {
    const { data: colorMatches } = await sb
      .from("fabrics")
      .select("id, name, color_code, image_url, fabric_type, pattern_detail, notes, embedding_dino")
      .ilike("notes", `%${primaryColor}%`)
      .not("embedding_dino", "is", null)
      .neq("id", queryFabric.id)
      .limit(500);

    const scored = (colorMatches || [])
      .map((f) => {
        const fVec = toVec(f.embedding_dino);
        if (!fVec || fVec.length !== queryVec.length) return null;
        return {
          id: f.id,
          name: f.name,
          color_code: f.color_code,
          image_url: f.image_url,
          fabric_type: f.fabric_type,
          pattern_detail: f.pattern_detail,
          notes: f.notes,
          similarity: cosineSim(queryVec, fVec),
        };
      })
      .filter(Boolean);
    scored.sort((a, b) => b.similarity - a.similarity);
    colorTop = scored.slice(0, 20);
  }

  // ─── C. 합치고 중복 제거 (색상 매칭 우선) ───
  const seen = new Set();
  const merged = [];
  for (const f of [...colorTop, ...textureTop]) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    merged.push(f);
  }

  // 부족하면 텍스쳐에서 더 채움
  if (merged.length < topN && textureMatches) {
    for (const f of textureMatches) {
      if (f.id === queryFabric.id) continue;
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      merged.push(f);
      if (merged.length >= topN) break;
    }
  }

  return merged.slice(0, topN);
}

async function main() {
  console.log("쿼리 50개 선정 중...");
  const queries = await pickQueries();
  console.log(`  ${queries.length}개 선정\n`);

  console.log("각 쿼리에 대해 후보 50개씩 검색...");
  const data = [];
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const candidates = await searchSimilar(q);
    data.push({
      query: {
        id: q.id,
        name: q.name,
        color_code: q.color_code,
        image_url: q.image_url,
        fabric_type: q.fabric_type,
        pattern_detail: q.pattern_detail,
        notes: q.notes,
      },
      candidates: candidates.map((c) => ({
        id: c.id,
        name: c.name,
        color_code: c.color_code,
        image_url: c.image_url,
        fabric_type: c.fabric_type,
        pattern_detail: c.pattern_detail,
        similarity: c.similarity,
      })),
    });
    if ((i + 1) % 10 === 0) console.log(`  [${i + 1}/${queries.length}]`);
  }

  console.log("\nHTML 생성 중...");

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>골든셋 라벨링 도구 — DIAN Fabric</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, "Segoe UI", sans-serif; background: #f5f5f7; color: #1a1a1a; }

/* 상단 진행률 바 */
.topbar {
  position: sticky; top: 0; z-index: 100;
  background: white; border-bottom: 1px solid #eee;
  padding: 12px 24px; display: flex; align-items: center; gap: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.topbar .logo { font-weight: 800; font-size: 16px; }
.topbar .progress-wrap { flex: 1; max-width: 400px; }
.topbar .progress-bar { height: 8px; background: #eee; border-radius: 4px; overflow: hidden; }
.topbar .progress-fill { height: 100%; background: linear-gradient(90deg, #8B6914, #C49A6C); transition: width 0.3s; }
.topbar .progress-text { font-size: 12px; color: #666; margin-top: 4px; }
.topbar button {
  padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer;
  font-weight: 700; font-size: 13px;
}
.topbar .btn-nav { background: #f0f0f0; color: #333; }
.topbar .btn-nav:hover { background: #e0e0e0; }
.topbar .btn-nav:disabled { opacity: 0.4; cursor: not-allowed; }
.topbar .btn-download { background: #8B6914; color: white; }
.topbar .btn-download:hover { background: #7a5c11; }
.topbar .btn-download:disabled { opacity: 0.4; cursor: not-allowed; }
.topbar .btn-reset { background: #fee; color: #c33; font-size: 11px; padding: 4px 10px; }

/* 메인 */
.container { max-width: 1500px; margin: 0 auto; padding: 24px; }

/* 쿼리 영역 */
.query-panel {
  background: white; border-radius: 16px; padding: 20px; margin-bottom: 20px;
  display: flex; gap: 20px; align-items: center;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}
.query-panel .qimg {
  width: 200px; height: 200px; border-radius: 12px; object-fit: cover;
  flex-shrink: 0;
}
.query-panel .qinfo { flex: 1; }
.query-panel .qlabel { font-size: 11px; color: #8B6914; font-weight: 700; margin-bottom: 4px; letter-spacing: 0.5px; }
.query-panel .qname { font-size: 28px; font-weight: 800; margin-bottom: 6px; }
.query-panel .qmeta { font-size: 14px; color: #666; margin-bottom: 12px; }
.query-panel .qtags { display: flex; gap: 6px; flex-wrap: wrap; }
.query-panel .qtag {
  font-size: 12px; padding: 4px 10px; border-radius: 5px; font-weight: 600;
  background: #f0e9d6; color: #8B6914;
}
.query-panel .qtag.pattern { background: #8B6914; color: white; }
.query-panel .counter {
  text-align: right; min-width: 180px;
}
.query-panel .counter .num {
  font-size: 32px; font-weight: 800; color: #8B6914;
}
.query-panel .counter .label { font-size: 13px; color: #888; }
.query-panel .counter .hint { font-size: 11px; color: #aaa; margin-top: 4px; }

/* 안내 메시지 */
.instruction {
  background: #fff8e7; padding: 12px 18px; border-radius: 10px; margin-bottom: 16px;
  font-size: 14px; color: #6a5410;
  display: flex; gap: 10px; align-items: center;
}
.instruction strong { color: #8B6914; }

/* 메인 비교 영역 */
.hero-compare {
  background: white; border-radius: 16px; padding: 24px; margin-bottom: 20px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}
.hero-row {
  display: grid; grid-template-columns: 1fr auto 1fr; gap: 24px;
  align-items: center;
}
.hero-side { text-align: center; }
.hero-side .hlabel {
  font-size: 12px; font-weight: 700; letter-spacing: 0.5px;
  margin-bottom: 10px; padding: 4px 12px; border-radius: 6px;
  display: inline-block;
}
.hero-side.query .hlabel { background: #e3f2fd; color: #1976d2; }
.hero-side.cand .hlabel { background: #fff3e0; color: #f57c00; }
.hero-img-wrap {
  position: relative; max-width: 480px; margin: 0 auto;
}
.hero-img-wrap img {
  width: 100%; aspect-ratio: 1; object-fit: cover;
  border-radius: 12px; background: #fafafa;
  cursor: zoom-in;
}
.hero-img-wrap .hsim {
  position: absolute; top: 12px; right: 12px;
  background: rgba(0,0,0,0.7); color: white;
  padding: 6px 12px; border-radius: 6px; font-weight: 700; font-size: 14px;
}
.hero-side .hname { font-size: 22px; font-weight: 800; margin-top: 14px; }
.hero-side .hmeta { font-size: 14px; color: #666; margin-top: 4px; }
.hero-side .htags { display: flex; gap: 6px; justify-content: center; margin-top: 10px; flex-wrap: wrap; }
.hero-side .htag {
  font-size: 12px; padding: 4px 10px; border-radius: 5px; font-weight: 600;
  background: #f0e9d6; color: #8B6914;
}
.hero-side .htag.pattern { background: #8B6914; color: white; }

/* 화살표 (가운데) */
.hero-arrows {
  display: flex; flex-direction: column; gap: 12px; align-items: center;
}
.arrow-btn {
  width: 56px; height: 56px; border-radius: 50%;
  background: white; border: 2px solid #ddd;
  cursor: pointer; font-size: 24px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s; color: #666;
}
.arrow-btn:hover { background: #8B6914; color: white; border-color: #8B6914; transform: scale(1.1); }
.arrow-btn:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }
.arrow-btn:disabled:hover { background: white; color: #666; border-color: #ddd; }
.arrow-counter {
  font-size: 13px; font-weight: 700; color: #888;
  background: #f5f5f5; padding: 6px 12px; border-radius: 6px;
}

/* 선택 버튼 (하단 중앙) */
.hero-actions {
  text-align: center; margin-top: 20px;
  padding-top: 20px; border-top: 1px solid #f0f0f0;
}
.select-btn {
  padding: 14px 36px; border: none; border-radius: 10px;
  font-weight: 700; font-size: 16px; cursor: pointer;
  background: #4caf50; color: white;
  transition: all 0.15s;
  display: inline-flex; align-items: center; gap: 8px;
}
.select-btn:hover { background: #45a049; transform: scale(1.02); }
.select-btn.selected { background: #e74c3c; }
.select-btn.selected:hover { background: #c0392b; }
.hero-hint {
  font-size: 12px; color: #999; margin-top: 12px;
}

/* 후보 그리드 (하단) */
.candidates-section { margin-top: 24px; }
.candidates-section h3 {
  font-size: 15px; font-weight: 700; color: #555;
  margin-bottom: 12px; display: flex; align-items: center; gap: 10px;
}
.candidates-section .sub {
  font-size: 12px; color: #888; font-weight: 400;
}
.candidates {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}
.cand {
  background: white; border-radius: 10px; overflow: hidden;
  cursor: pointer; border: 3px solid transparent;
  transition: all 0.15s;
  position: relative;
}
.cand:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.cand.selected { border-color: #4caf50; }
.cand.focused { box-shadow: 0 0 0 3px #8B6914, 0 4px 12px rgba(139,105,20,0.3); }
.cand.selected::after {
  content: "✓"; position: absolute; top: 8px; right: 8px;
  width: 28px; height: 28px; background: #4caf50; color: white;
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-weight: 900; font-size: 16px;
  box-shadow: 0 2px 6px rgba(76,175,80,0.4);
  z-index: 2;
}
.cand img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
.cand .cinfo { padding: 8px 10px; }
.cand .cname { font-size: 13px; font-weight: 700; }
.cand .cmeta { font-size: 11px; color: #888; }
.cand .csim {
  position: absolute; top: 8px; left: 8px;
  background: rgba(0,0,0,0.65); color: white;
  font-size: 10px; padding: 2px 6px; border-radius: 3px; font-weight: 700;
  z-index: 2;
}
.cand .ctags { display: flex; gap: 3px; flex-wrap: wrap; margin-top: 4px; }
.cand .ctag {
  font-size: 9px; padding: 2px 5px; border-radius: 3px;
  background: #f0e9d6; color: #8B6914; font-weight: 600;
}
.cand .ctag.pattern { background: #8B6914; color: white; }

/* 확대 버튼 */
.cand .zoom-btn {
  position: absolute; bottom: 6px; right: 6px;
  width: 32px; height: 32px; border-radius: 50%;
  background: rgba(0,0,0,0.6); color: white;
  border: none; cursor: pointer; font-size: 16px;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: all 0.15s;
  z-index: 3;
  backdrop-filter: blur(4px);
}
.cand:hover .zoom-btn { opacity: 1; }
.cand .zoom-btn:hover { background: #8B6914; transform: scale(1.1); }

/* 라이트박스 모달 */
.lightbox {
  display: none; position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.92);
  align-items: center; justify-content: center;
  padding: 40px;
}
.lightbox.show { display: flex; }
.lightbox-content {
  max-width: 95vw; max-height: 95vh;
  display: flex; gap: 24px; align-items: center;
  position: relative;
}
.lightbox-side {
  flex: 1; max-width: 50vw;
  display: flex; flex-direction: column; align-items: center;
}
.lightbox-side img {
  max-width: 100%; max-height: 80vh; object-fit: contain;
  border-radius: 8px; background: #222;
}
.lightbox-side .lb-label {
  color: #aaa; font-size: 12px; margin-bottom: 8px; font-weight: 700; letter-spacing: 1px;
}
.lightbox-side .lb-name {
  color: white; font-size: 18px; font-weight: 700; margin-top: 12px;
}
.lightbox-side .lb-meta {
  color: #ccc; font-size: 13px; margin-top: 4px;
}
.lightbox-side .lb-tags { display: flex; gap: 6px; margin-top: 8px; }
.lightbox-side .lb-tag {
  font-size: 11px; padding: 3px 8px; border-radius: 4px;
  background: rgba(139,105,20,0.3); color: #f0e9d6; font-weight: 600;
}
.lightbox-side .lb-tag.pattern { background: #8B6914; color: white; }
.lightbox-close {
  position: absolute; top: -50px; right: 0;
  width: 40px; height: 40px; border-radius: 50%;
  background: white; color: black; border: none;
  font-size: 20px; cursor: pointer; font-weight: 700;
}
.lightbox-close:hover { background: #f0f0f0; }
.lightbox-hint {
  position: absolute; bottom: -40px; left: 50%; transform: translateX(-50%);
  color: #aaa; font-size: 12px; white-space: nowrap;
}
.lb-select-btn {
  margin-top: 16px; padding: 10px 24px;
  background: #4caf50; color: white; border: none;
  border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 14px;
}
.lb-select-btn:hover { background: #45a049; }
.lb-select-btn.selected { background: #e74c3c; }
.lb-select-btn.selected:hover { background: #c0392b; }

@media (max-width: 900px) {
  .lightbox-content { flex-direction: column; gap: 12px; }
  .lightbox-side { max-width: 100%; }
}

/* 완료 화면 */
.done-screen {
  background: white; border-radius: 16px; padding: 60px 40px;
  text-align: center; margin-top: 40px;
  display: none;
}
.done-screen.show { display: block; }
.done-screen .ico { font-size: 64px; margin-bottom: 20px; }
.done-screen h2 { font-size: 24px; margin-bottom: 10px; }
.done-screen p { color: #666; margin-bottom: 24px; }
.done-screen .btn-big {
  padding: 14px 32px; background: #8B6914; color: white;
  border: none; border-radius: 10px; font-weight: 700; font-size: 15px;
  cursor: pointer;
}
.done-screen .btn-big:hover { background: #7a5c11; }
</style>
</head>
<body>

<div class="topbar">
  <span class="logo">DIAN 골든셋</span>
  <button class="btn-nav" id="prevBtn">← 이전</button>
  <div class="progress-wrap">
    <div class="progress-bar"><div class="progress-fill" id="progFill"></div></div>
    <div class="progress-text" id="progText">0 / ${data.length} 완료</div>
  </div>
  <button class="btn-nav" id="nextBtn">다음 →</button>
  <button class="btn-download" id="saveBtn" style="background:#4caf50;">💾 중간 저장</button>
  <button class="btn-download" id="downloadBtn" disabled>📥 최종 다운로드</button>
  <label class="btn-download" id="loadBtn" style="background:#fff;color:#333;border:1px solid #ddd;cursor:pointer;">
    📂 불러오기
    <input type="file" id="fileInput" accept=".json" style="display:none;">
  </label>
  <button class="btn-reset" id="resetBtn">초기화</button>
</div>

<div class="container">
  <!-- 상단 요약 -->
  <div class="query-panel">
    <div class="qinfo">
      <div class="qlabel">🎯 쿼리 원단 #<span id="queryIdx">1</span> / ${data.length}</div>
      <div class="qname" id="queryName"></div>
      <div class="qmeta" id="queryMeta"></div>
    </div>
    <div class="counter">
      <div class="num"><span id="selectedCount">0</span> / 10</div>
      <div class="label">선택됨</div>
      <div class="hint">목표: 5-15개</div>
    </div>
  </div>

  <!-- 메인 비교 영역 (큰 사진) -->
  <div class="hero-compare">
    <div class="hero-row">
      <!-- 좌: 원안 -->
      <div class="hero-side query">
        <div class="hlabel">📌 원안 (쿼리)</div>
        <div class="hero-img-wrap">
          <img id="heroQueryImg" src="">
        </div>
        <div class="hname" id="heroQueryName"></div>
        <div class="htags" id="heroQueryTags"></div>
      </div>

      <!-- 가운데: 화살표 -->
      <div class="hero-arrows">
        <button class="arrow-btn" id="heroPrevBtn" title="이전 후보 (←)">‹</button>
        <div class="arrow-counter"><span id="focusIdx">1</span> / <span id="totalCands">50</span></div>
        <button class="arrow-btn" id="heroNextBtn" title="다음 후보 (→)">›</button>
      </div>

      <!-- 우: 대체안 -->
      <div class="hero-side cand">
        <div class="hlabel">🎨 대체안 (후보)</div>
        <div class="hero-img-wrap">
          <img id="heroCandImg" src="">
          <span class="hsim" id="heroCandSim"></span>
        </div>
        <div class="hname" id="heroCandName"></div>
        <div class="htags" id="heroCandTags"></div>
      </div>
    </div>

    <!-- 선택 버튼 -->
    <div class="hero-actions">
      <button class="select-btn" id="heroSelectBtn">
        <span>✓</span> <span>비슷함으로 선택</span>
      </button>
      <div class="hero-hint">
        ← → 화살표로 다음 후보 · Space/Enter로 선택 · Shift+← → 다음 쿼리
      </div>
    </div>
  </div>

  <!-- 후보 카드 그리드 (전체 보기 + 직접 클릭) -->
  <div class="candidates-section">
    <h3>📋 전체 후보 <span class="sub">(클릭하면 위에 큰 화면으로 비교 · 카드 클릭으로도 선택 가능)</span></h3>
    <div class="candidates" id="candidates"></div>
  </div>
</div>

  <div class="done-screen" id="doneScreen">
    <div class="ico">🎉</div>
    <h2>모든 라벨링 완료!</h2>
    <p>50개 쿼리 라벨링이 끝났습니다. JSON 파일을 다운로드하여 알려주세요.</p>
    <button class="btn-big" onclick="downloadJSON()">📥 골든셋 JSON 다운로드</button>
  </div>
</div>

<script>
const ALL_DATA = ${JSON.stringify(data)};
const STORAGE_KEY = "dian-golden-set-v2";

let currentIdx = 0;
let focusIdx = 0;  // 현재 보고 있는 후보 인덱스
let labels = {};   // { queryId: [selectedCandidateId, ...] }

// 저장된 라벨 로드
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  labels = saved.labels || {};
  currentIdx = saved.currentIdx || 0;
} catch {}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ labels, currentIdx }));
  updateProgress();
}

function updateProgress() {
  const completed = Object.keys(labels).filter(k => labels[k] && labels[k].length > 0).length;
  const pct = (completed / ALL_DATA.length) * 100;
  document.getElementById("progFill").style.width = pct + "%";
  document.getElementById("progText").textContent = \`\${completed} / \${ALL_DATA.length} 완료\`;
  document.getElementById("downloadBtn").disabled = completed < ALL_DATA.length;

  if (completed === ALL_DATA.length) {
    document.getElementById("doneScreen").classList.add("show");
  }
}

// 메인 비교 영역 업데이트
function renderHero() {
  const item = ALL_DATA[currentIdx];
  const q = item.query;
  const c = item.candidates[focusIdx];
  if (!c) return;

  document.getElementById("heroQueryImg").src = q.image_url;
  document.getElementById("heroQueryName").textContent = q.name + "-" + q.color_code;
  document.getElementById("heroQueryTags").innerHTML =
    (q.fabric_type ? '<span class="htag">' + q.fabric_type + '</span>' : '') +
    (q.pattern_detail ? '<span class="htag pattern">' + q.pattern_detail + '</span>' : '');

  document.getElementById("heroCandImg").src = c.image_url;
  document.getElementById("heroCandSim").textContent = (c.similarity * 100).toFixed(0) + "%";
  document.getElementById("heroCandName").textContent = c.name + "-" + c.color_code;
  document.getElementById("heroCandTags").innerHTML =
    (c.fabric_type ? '<span class="htag">' + c.fabric_type + '</span>' : '') +
    (c.pattern_detail ? '<span class="htag pattern">' + c.pattern_detail + '</span>' : '');

  document.getElementById("focusIdx").textContent = focusIdx + 1;
  document.getElementById("totalCands").textContent = item.candidates.length;
  document.getElementById("heroPrevBtn").disabled = focusIdx === 0;
  document.getElementById("heroNextBtn").disabled = focusIdx >= item.candidates.length - 1;

  // 선택 버튼 상태
  const sel = (labels[q.id] || []).includes(c.id);
  const btn = document.getElementById("heroSelectBtn");
  if (sel) {
    btn.innerHTML = '<span>✗</span> <span>선택 해제</span>';
    btn.classList.add("selected");
  } else {
    btn.innerHTML = '<span>✓</span> <span>비슷함으로 선택</span>';
    btn.classList.remove("selected");
  }

  // 카드 그리드 focus 표시 (스크롤은 X — 화살표로 빠르게 넘길 때 화면 튀지 않게)
  document.querySelectorAll(".cand").forEach((el) => {
    const idx = parseInt(el.dataset.cidx);
    if (idx === focusIdx) el.classList.add("focused");
    else el.classList.remove("focused");
  });
}

function setFocus(idx) {
  const item = ALL_DATA[currentIdx];
  if (idx < 0 || idx >= item.candidates.length) return;
  focusIdx = idx;
  renderHero();
}

function render() {
  focusIdx = 0;
  const item = ALL_DATA[currentIdx];
  const q = item.query;
  document.getElementById("queryIdx").textContent = currentIdx + 1;
  document.getElementById("queryName").textContent = q.name + " — " + q.color_code;

  const colors = (q.notes || "").split("|")[0].split(",").slice(0, 3).join(", ");
  document.getElementById("queryMeta").textContent =
    (q.pattern_detail || "") + (colors ? " · " + colors : "");

  const selected = new Set(labels[q.id] || []);
  document.getElementById("selectedCount").textContent = selected.size;

  const candHtml = item.candidates.map((c, ci) => \`
    <div class="cand \${selected.has(c.id) ? 'selected' : ''}" data-id="\${c.id}" data-cidx="\${ci}">
      <span class="csim">\${(c.similarity * 100).toFixed(0)}%</span>
      <img src="\${c.image_url}" alt="\${c.name}" loading="lazy">
      <div class="cinfo">
        <div class="cname">\${c.name}-\${c.color_code}</div>
        <div class="ctags">
          \${c.pattern_detail ? '<span class="ctag pattern">' + c.pattern_detail + '</span>' : ''}
        </div>
      </div>
    </div>
  \`).join("");
  document.getElementById("candidates").innerHTML = candHtml;

  // 카드 클릭: 단일클릭 = focus 변경 + hero로 스크롤, 더블클릭 = select 토글
  document.querySelectorAll(".cand").forEach((el) => {
    let clickTimer = null;
    el.addEventListener("click", () => {
      if (clickTimer) {
        // 더블클릭 → select 토글
        clearTimeout(clickTimer);
        clickTimer = null;
        toggle(q.id, el.dataset.id, el);
      } else {
        // 첫 클릭 → 250ms 후 focus 변경 + 위로 스크롤
        clickTimer = setTimeout(() => {
          clickTimer = null;
          setFocus(parseInt(el.dataset.cidx));
          document.querySelector(".hero-compare").scrollIntoView({ behavior: "smooth", block: "start" });
        }, 250);
      }
    });
  });

  document.getElementById("prevBtn").disabled = currentIdx === 0;
  document.getElementById("nextBtn").disabled = currentIdx === ALL_DATA.length - 1;

  renderHero();
}

function toggle(queryId, candId, el) {
  if (!labels[queryId]) labels[queryId] = [];
  const idx = labels[queryId].indexOf(candId);
  if (idx >= 0) {
    labels[queryId].splice(idx, 1);
    el.classList.remove("selected");
  } else {
    labels[queryId].push(candId);
    el.classList.add("selected");
  }
  document.getElementById("selectedCount").textContent = labels[queryId].length;
  save();
}

function next() {
  if (currentIdx < ALL_DATA.length - 1) {
    currentIdx++;
    save();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}
function prev() {
  if (currentIdx > 0) {
    currentIdx--;
    save();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function downloadJSON(isPartial = false) {
  const completed = Object.keys(labels).filter(k => labels[k] && labels[k].length > 0).length;
  const out = {
    created_at: new Date().toISOString(),
    total_queries: ALL_DATA.length,
    completed_count: completed,
    is_partial: isPartial,
    current_idx: currentIdx,
    labels: ALL_DATA.map((item) => ({
      query: {
        id: item.query.id,
        name: item.query.name,
        color_code: item.query.color_code,
        pattern_detail: item.query.pattern_detail,
      },
      similar_ids: labels[item.query.id] || [],
    })),
  };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const prefix = isPartial ? "golden-set-partial-" : "golden-set-";
  a.download = prefix + completed + "of" + ALL_DATA.length + "-" + new Date().toISOString().slice(0,10) + ".json";
  a.click();
  URL.revokeObjectURL(url);
}

function loadJSON(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.labels || !Array.isArray(data.labels)) {
        alert("올바른 골든셋 JSON이 아닙니다.");
        return;
      }
      // 라벨 복원
      const newLabels = {};
      for (const item of data.labels) {
        if (item.query?.id && Array.isArray(item.similar_ids)) {
          newLabels[item.query.id] = item.similar_ids;
        }
      }
      const completed = Object.keys(newLabels).filter(k => newLabels[k].length > 0).length;
      if (!confirm("불러오기: " + completed + "개 라벨 복원하시겠습니까? 현재 작업은 덮어씁니다.")) return;
      labels = newLabels;
      if (typeof data.current_idx === "number") currentIdx = data.current_idx;
      save();
      render();
      alert("불러오기 완료! " + completed + "개 라벨이 복원되었습니다.");
    } catch (err) {
      alert("파일 읽기 실패: " + err.message);
    }
  };
  reader.readAsText(file);
}

document.getElementById("nextBtn").addEventListener("click", next);
document.getElementById("prevBtn").addEventListener("click", prev);
document.getElementById("downloadBtn").addEventListener("click", () => downloadJSON(false));
document.getElementById("saveBtn").addEventListener("click", () => downloadJSON(true));
document.getElementById("fileInput").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (f) loadJSON(f);
  e.target.value = "";
});
document.getElementById("resetBtn").addEventListener("click", () => {
  if (confirm("정말 모두 초기화하시겠습니까? 모든 선택이 사라집니다.")) {
    labels = {};
    currentIdx = 0;
    localStorage.removeItem(STORAGE_KEY);
    render();
    updateProgress();
  }
});

// ===== Hero 비교 영역 핸들러 =====
document.getElementById("heroPrevBtn").addEventListener("click", () => setFocus(focusIdx - 1));
document.getElementById("heroNextBtn").addEventListener("click", () => setFocus(focusIdx + 1));
document.getElementById("heroSelectBtn").addEventListener("click", () => {
  const item = ALL_DATA[currentIdx];
  const c = item.candidates[focusIdx];
  const el = document.querySelector(\`.cand[data-cidx="\${focusIdx}"]\`);
  toggle(item.query.id, c.id, el);
  renderHero();
});

// 키보드 단축키
document.addEventListener("keydown", (e) => {
  const tag = (e.target).tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;

  // Shift+화살표 = 쿼리 이동
  if (e.shiftKey) {
    if (e.key === "ArrowRight") { e.preventDefault(); next(); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); prev(); return; }
  }
  // 그냥 화살표 = 후보 focus 이동
  if (e.key === "ArrowRight") { e.preventDefault(); setFocus(focusIdx + 1); }
  if (e.key === "ArrowLeft") { e.preventDefault(); setFocus(focusIdx - 1); }
  // Space/Enter = 현재 후보 토글
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    document.getElementById("heroSelectBtn").click();
  }
});

render();
updateProgress();
</script>

</body>
</html>`;

  const outPath = "scripts/golden-set-tool.html";
  fs.writeFileSync(outPath, html);
  console.log(`\n✅ ${outPath} 생성 완료`);
  console.log(`   브라우저로 열기:`);
  console.log(`   file:///D:/DIAN FABRIC/dian-fabric-app/${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
