/**
 * CLIP vs DINOv2 일괄 A/B 비교 HTML 생성
 *
 * 50개 원단을 쿼리로 → 양쪽 임베딩으로 각각 Top 10 검색 → HTML로 정리
 * (자기 자신은 결과에서 제외)
 *
 * 사용: node scripts/batch-compare.mjs
 */

import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const envContent = fs.readFileSync(".env.local", "utf-8");
const env = {};
envContent.split("\n").forEach((line) => {
  const [key, ...vals] = line.split("=");
  if (key && vals.length) env[key.trim()] = vals.join("=").trim();
});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

const PATTERNS = [
  "무지", "부클", "하운드투스", "스트라이프", "체크",
  "헤링본", "추상", "기하학", "자연", "동물", "식물", "다마스크",
];
const PER_PATTERN = 4; // 12 * 4 = 48
const TOP_N = 10;

async function pickQueries() {
  const queries = [];
  for (const p of PATTERNS) {
    const { data } = await sb
      .from("fabrics")
      .select("id, name, color_code, image_url, fabric_type, pattern_detail, notes, embedding, embedding_dino")
      .eq("pattern_detail", p)
      .not("image_url", "is", null)
      .not("embedding", "is", null)
      .not("embedding_dino", "is", null)
      .limit(50);
    if (!data || data.length === 0) {
      console.log(`  ${p.padEnd(8)} 없음 (스킵)`);
      continue;
    }
    const shuffled = data.sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, PER_PATTERN);
    queries.push(...picked);
    console.log(`  ${p.padEnd(8)} ${picked.length}개`);
  }
  return queries.slice(0, 48);
}

function toVectorString(emb) {
  // DB에서 문자열로 온 경우 그대로, 배열이면 직렬화
  if (typeof emb === "string") return emb;
  if (Array.isArray(emb)) return `[${emb.join(",")}]`;
  return null;
}

async function searchByEmbedding(rpcName, queryFabric, embCol) {
  const vec = toVectorString(queryFabric[embCol]);
  if (!vec) return [];
  const { data, error } = await sb.rpc(rpcName, {
    query_embedding: vec,
    match_threshold: 0.1,
    match_count: TOP_N + 5,
  });
  if (error) {
    console.error(`${rpcName} 에러:`, error.message);
    return [];
  }
  return (data || []).filter((f) => f.id !== queryFabric.id).slice(0, TOP_N);
}

async function main() {
  console.log("쿼리 원단 선정 중...\n");
  const queries = await pickQueries();
  console.log(`\n총 ${queries.length}개 쿼리 선정\n`);

  console.log("일괄 검색 시작 (자기 자신 제외)...\n");
  const rows = [];
  const start = Date.now();

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const [clipResults, dinoResults] = await Promise.all([
      searchByEmbedding("search_fabrics", q, "embedding"),
      searchByEmbedding("search_fabrics_dino", q, "embedding_dino"),
    ]);
    rows.push({ query: q, clip: clipResults, dino: dinoResults });

    if ((i + 1) % 5 === 0 || i === queries.length - 1) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  [${i + 1}/${queries.length}] ${elapsed}초 경과`);
    }
  }

  // 분류 일치율 계산 (간단 평가)
  let clipMatch = 0,
    dinoMatch = 0,
    totalSlots = 0;
  for (const r of rows) {
    const queryPattern = r.query.pattern_detail;
    if (!queryPattern) continue;
    for (const f of r.clip) {
      totalSlots++;
      if (f.pattern_detail === queryPattern) clipMatch++;
    }
    for (const f of r.dino) {
      if (f.pattern_detail === queryPattern) dinoMatch++;
    }
  }
  const clipPct = totalSlots ? ((clipMatch / totalSlots) * 100).toFixed(1) : 0;
  const dinoPct = totalSlots ? ((dinoMatch / totalSlots) * 100).toFixed(1) : 0;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>CLIP vs DINOv2 A/B 일괄 비교 (${queries.length}개)</title>
<style>
* { box-sizing: border-box; }
body { font-family: -apple-system, "Segoe UI", sans-serif; padding: 24px; background: #f5f5f7; margin: 0; }
header { max-width: 1500px; margin: 0 auto 20px; }
h1 { font-size: 22px; margin: 0 0 6px; }
.summary { background: white; padding: 14px 18px; border-radius: 10px; margin-bottom: 18px; max-width: 1500px; margin-left: auto; margin-right: auto; }
.summary .stat { display: inline-block; margin-right: 24px; font-size: 14px; }
.summary .stat strong { font-size: 20px; }
.summary .clip strong { color: #4A90E2; }
.summary .dino strong { color: #8B6914; }
.row { background: white; border-radius: 12px; padding: 14px 18px; margin: 0 auto 14px; max-width: 1500px; }
.row-header { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #eee; }
.query-img { width: 90px; height: 90px; object-fit: cover; border-radius: 8px; flex-shrink: 0; }
.query-info { flex: 1; font-size: 13px; }
.query-info .name { font-weight: bold; font-size: 16px; margin-bottom: 4px; }
.query-info .meta { color: #666; }
.query-info .pattern { color: #8B6914; font-weight: 700; background: #f0e9d6; padding: 2px 8px; border-radius: 4px; }
.results { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.col { background: #fafafa; padding: 12px; border-radius: 8px; }
.col h3 { margin: 0 0 10px; font-size: 13px; font-weight: 700; }
.col.clip h3 { color: #4A90E2; }
.col.dino h3 { color: #8B6914; }
.thumbs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; }
.thumb { position: relative; aspect-ratio: 1; border-radius: 5px; overflow: hidden; }
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumb .rank {
  position: absolute; top: 3px; left: 3px;
  background: rgba(0,0,0,0.7); color: white;
  font-size: 9px; padding: 1px 5px; border-radius: 3px; font-weight: 700;
}
.thumb .sim {
  position: absolute; top: 3px; right: 3px;
  background: rgba(0,0,0,0.7); color: white;
  font-size: 9px; padding: 1px 4px; border-radius: 3px;
}
.thumb .label {
  position: absolute; bottom: 0; left: 0; right: 0;
  background: rgba(0,0,0,0.65); color: white;
  font-size: 8px; padding: 2px 4px; line-height: 1.2;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.thumb.match { border: 2px solid #00c853; }
</style>
</head>
<body>
<header>
  <h1>CLIP vs DINOv2 — A/B 일괄 비교 (${queries.length}개 원단)</h1>
  <p style="color: #666; font-size: 13px;">각 원단을 쿼리로 했을 때 가장 비슷하다고 판단된 상위 ${TOP_N}개 (자기 자신 제외). 초록 테두리 = 같은 패턴 분류.</p>
</header>

<div class="summary">
  <div class="stat clip">CLIP 패턴 일치율: <strong>${clipPct}%</strong></div>
  <div class="stat dino">DINOv2 패턴 일치율: <strong>${dinoPct}%</strong></div>
  <div class="stat" style="color: #888;">총 슬롯: ${totalSlots}개</div>
</div>

${rows
  .map(
    (r, i) => `
  <div class="row">
    <div class="row-header">
      <img src="${r.query.image_url}" class="query-img">
      <div class="query-info">
        <div class="name">[${i + 1}] ${r.query.name}-${r.query.color_code}</div>
        <div class="meta">${r.query.fabric_type || ""} · <span class="pattern">${r.query.pattern_detail || ""}</span></div>
      </div>
    </div>
    <div class="results">
      <div class="col clip">
        <h3>CLIP (현재 운영) — Top ${TOP_N}</h3>
        <div class="thumbs">
          ${r.clip
            .map(
              (f, idx) => `
            <div class="thumb${f.pattern_detail === r.query.pattern_detail ? " match" : ""}">
              <img src="${f.image_url}" alt="${f.name}">
              <span class="rank">#${idx + 1}</span>
              <span class="sim">${(f.similarity * 100).toFixed(0)}</span>
              <span class="label">${f.pattern_detail || f.fabric_type || "-"}</span>
            </div>`
            )
            .join("")}
        </div>
      </div>
      <div class="col dino">
        <h3>DINOv2 (신규) — Top ${TOP_N}</h3>
        <div class="thumbs">
          ${r.dino
            .map(
              (f, idx) => `
            <div class="thumb${f.pattern_detail === r.query.pattern_detail ? " match" : ""}">
              <img src="${f.image_url}" alt="${f.name}">
              <span class="rank">#${idx + 1}</span>
              <span class="sim">${(f.similarity * 100).toFixed(0)}</span>
              <span class="label">${f.pattern_detail || f.fabric_type || "-"}</span>
            </div>`
            )
            .join("")}
        </div>
      </div>
    </div>
  </div>`
  )
  .join("")}
</body>
</html>`;

  const outPath = "scripts/batch-compare.html";
  fs.writeFileSync(outPath, html);
  console.log(`\n✅ ${outPath} 생성 완료`);
  console.log(`\n=== 패턴 일치율 ===`);
  console.log(`  CLIP:   ${clipPct}% (${clipMatch}/${totalSlots})`);
  console.log(`  DINOv2: ${dinoPct}% (${dinoMatch}/${totalSlots})`);
  console.log(`\n브라우저에서 열기:`);
  console.log(`  file:///D:/DIAN FABRIC/dian-fabric-app/${outPath}`);
}

main().catch((e) => {
  console.error("에러:", e);
  process.exit(1);
});
