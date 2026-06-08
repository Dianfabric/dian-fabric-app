/**
 * 골든셋으로 기존 검색 시스템 정확도 측정 + 가중치 튜닝
 *
 * 측정 지표:
 * - Recall@15: 정답 중 몇 %가 Top 15에 포함됐나
 * - Precision@5: Top 5 중 몇 %가 정답이었나
 * - MRR: 첫 정답이 평균 몇 등에 나타나나
 *
 * 가중치 튜닝: DINOv2 vs RGB 색상 여러 비율 비교
 */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
fs.readFileSync(".env.local", "utf-8").split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) env[k.trim()] = v.join("=").trim();
});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// 골든셋 로드
const golden = JSON.parse(fs.readFileSync("scripts/golden-set.json", "utf-8"));
const labeled = golden.labels.filter((l) => l.similar_ids.length > 0);
console.log(`📋 골든셋: ${labeled.length}개 쿼리 (평균 ${(labeled.reduce((s, l) => s + l.similar_ids.length, 0) / labeled.length).toFixed(1)} 정답)\n`);

// RGB 클러스터 파싱 (notes에서)
function parseRGBClusters(notes) {
  if (!notes) return null;
  const rgbPart = notes.match(/\|rgb:([^|]*)/)?.[1];
  if (!rgbPart) return null;
  const clusters = [];
  for (const seg of rgbPart.split(";")) {
    const m = seg.match(/(\d+),(\d+),(\d+):(\d+)/);
    if (m) clusters.push({ rgb: [+m[1], +m[2], +m[3]], pct: +m[4] });
  }
  if (clusters.length === 0) {
    const m = rgbPart.match(/(\d+),(\d+),(\d+)/);
    if (m) clusters.push({ rgb: [+m[1], +m[2], +m[3]], pct: 100 });
  }
  return clusters.length ? clusters : null;
}

function rgbDist(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db) / 441.67;
}

function rgbSimilarity(q, f) {
  if (!q || !f) return 0;
  let total = 0;
  for (const qc of q) {
    let best = 0;
    for (const fc of f) {
      const d = rgbDist(qc.rgb, fc.rgb);
      const colorSim = Math.max(0, 1 - d * 2.5);
      const pctSim = 1 - Math.abs(qc.pct - fc.pct) / 100;
      const match = colorSim * 0.7 + pctSim * 0.3;
      if (match > best) best = match;
    }
    total += best * (qc.pct / 100);
  }
  return total;
}

function toVec(emb) {
  return typeof emb === "string" ? JSON.parse(emb) : emb;
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// 쿼리 fabric의 임베딩 + RGB 클러스터 가져오기
async function getQueryFabric(id) {
  const { data } = await sb.from("fabrics")
    .select("id, name, embedding_dino, notes")
    .eq("id", id).single();
  return data;
}

// 후보 200개 가져오기 (DINOv2 RPC)
async function fetchCandidates(queryFabric) {
  const vec = typeof queryFabric.embedding_dino === "string"
    ? queryFabric.embedding_dino
    : `[${queryFabric.embedding_dino.join(",")}]`;
  const { data } = await sb.rpc("search_fabrics_dino", {
    query_embedding: vec,
    match_threshold: 0.0,
    match_count: 200,
  });
  return (data || []).filter((f) => f.id !== queryFabric.id);
}

// 가중치 조합으로 Top K 추출
function rankWithWeights(candidates, queryRGB, queryVec, dinoWeight, rgbWeight, topK = 15) {
  const scored = candidates.map((f) => {
    const dinoSim = f.similarity || 0;
    const fabricRGB = parseRGBClusters(f.notes);
    const rgbSim = rgbSimilarity(queryRGB, fabricRGB);
    return {
      id: f.id,
      score: dinoWeight * dinoSim + rgbWeight * rgbSim,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((s) => s.id);
}

// 평가 메트릭
function evaluate(predIds, truthIds) {
  const truthSet = new Set(truthIds);
  const predSet = new Set(predIds);

  // Recall@15: 정답 중 결과에 포함된 비율
  const hits = truthIds.filter((id) => predSet.has(id)).length;
  const recall = hits / truthIds.length;

  // Precision@5: Top 5 중 정답 비율
  const top5 = predIds.slice(0, 5);
  const top5Hits = top5.filter((id) => truthSet.has(id)).length;
  const precisionAt5 = top5Hits / Math.min(5, predIds.length);

  // MRR: 첫 정답의 1/rank
  let firstHitRank = 0;
  for (let i = 0; i < predIds.length; i++) {
    if (truthSet.has(predIds[i])) {
      firstHitRank = i + 1;
      break;
    }
  }
  const mrr = firstHitRank > 0 ? 1 / firstHitRank : 0;

  return { recall, precisionAt5, mrr, hits, total: truthIds.length };
}

// 메인
async function main() {
  console.log("=== 1. 모든 쿼리 데이터 + 후보 가져오기 ===\n");

  const queryData = [];
  for (let i = 0; i < labeled.length; i++) {
    const l = labeled[i];
    const q = await getQueryFabric(l.query.id);
    if (!q || !q.embedding_dino) {
      console.log(`  [${i+1}] ${l.query.name} — embedding 없음 (스킵)`);
      continue;
    }
    const cands = await fetchCandidates(q);
    const queryRGB = parseRGBClusters(q.notes);
    const queryVec = toVec(q.embedding_dino);

    queryData.push({
      truthIds: l.similar_ids,
      candidates: cands,
      queryRGB,
      queryVec,
      name: l.query.name,
    });
    if ((i + 1) % 10 === 0) console.log(`  [${i+1}/${labeled.length}] 로드 완료`);
  }
  console.log(`\n✅ ${queryData.length}개 쿼리 준비 완료\n`);

  // ─── 가중치 튜닝 ───
  console.log("=== 2. 가중치 조합 비교 ===\n");
  console.log("DINOv2 / RGB      | Recall@15 | Precision@5 | MRR    | 정답 발견");
  console.log("------------------|-----------|-------------|--------|----------");

  const weightCombos = [
    { name: "100% / 0%   (DINOv2만)", dW: 1.0, rW: 0.0 },
    { name: " 90% /10%", dW: 0.9, rW: 0.1 },
    { name: " 80% /20%", dW: 0.8, rW: 0.2 },
    { name: " 70% /30%", dW: 0.7, rW: 0.3 },
    { name: " 60% /40%  (현재)", dW: 0.6, rW: 0.4 },
    { name: " 50% /50%", dW: 0.5, rW: 0.5 },
    { name: " 40% /60%", dW: 0.4, rW: 0.6 },
    { name: " 30% /70%", dW: 0.3, rW: 0.7 },
    { name: " 20% /80%", dW: 0.2, rW: 0.8 },
    { name: "  0% /100% (RGB만)", dW: 0.0, rW: 1.0 },
  ];

  const results = [];
  for (const combo of weightCombos) {
    let totalRecall = 0, totalPrecision = 0, totalMrr = 0, totalHits = 0, totalTruth = 0;
    for (const q of queryData) {
      const predIds = rankWithWeights(q.candidates, q.queryRGB, q.queryVec, combo.dW, combo.rW, 15);
      const m = evaluate(predIds, q.truthIds);
      totalRecall += m.recall;
      totalPrecision += m.precisionAt5;
      totalMrr += m.mrr;
      totalHits += m.hits;
      totalTruth += m.total;
    }
    const n = queryData.length;
    const avgRecall = (totalRecall / n * 100).toFixed(1);
    const avgPrec = (totalPrecision / n * 100).toFixed(1);
    const avgMrr = (totalMrr / n).toFixed(3);
    results.push({ combo: combo.name, dW: combo.dW, rW: combo.rW, recall: parseFloat(avgRecall), precision: parseFloat(avgPrec), mrr: parseFloat(avgMrr), hits: totalHits, total: totalTruth });
    console.log(`${combo.name.padEnd(18)} | ${avgRecall.padStart(7)}%   | ${avgPrec.padStart(9)}%   | ${avgMrr}  | ${totalHits}/${totalTruth}`);
  }

  // 최고 조합
  results.sort((a, b) => b.recall - a.recall);
  console.log(`\n🏆 최고 Recall@15: ${results[0].combo.trim()} → ${results[0].recall}%`);
  console.log(`   (현재 60/40 대비 ${(results[0].recall - results.find(r => r.dW === 0.6).recall).toFixed(1)}%p 차이)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
